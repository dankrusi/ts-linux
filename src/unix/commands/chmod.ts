import type { UnixCommandInstaller } from "../types";

type ModeClass = "u" | "g" | "o";
type ModeOp = "+" | "-" | "=";

export const installChmod: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
    name: "chmod",
    description: "change file mode bits",
    source: makeSyscallSource("chmod", [
      "// runtime supports: chmod [-R] MODE FILE..."
    ]),
    run: ({ args, sys }) => {
      let recursive = false;
      let verbose = false;
      let modeSpec: string | null = null;
      const targets: string[] = [];
      let parsingOptions = true;

      for (const arg of args) {
        if (parsingOptions && arg === "--") {
          parsingOptions = false;
          continue;
        }

        if (parsingOptions && arg.startsWith("--")) {
          if (arg === "--recursive") {
            recursive = true;
            continue;
          }
          if (arg === "--verbose") {
            verbose = true;
            continue;
          }
          sys.write(`chmod: unrecognized option '${arg}'`);
          return;
        }

        if (parsingOptions && arg.startsWith("-") && arg !== "-") {
          for (const flag of arg.slice(1)) {
            if (flag === "R") {
              recursive = true;
              continue;
            }
            if (flag === "v") {
              verbose = true;
              continue;
            }
            sys.write(`chmod: invalid option -- '${flag}'`);
            return;
          }
          continue;
        }

        if (modeSpec === null) {
          modeSpec = arg;
          continue;
        }
        targets.push(arg);
      }

      if (!modeSpec) {
        sys.write("chmod: missing operand");
        return;
      }
      if (targets.length === 0) {
        sys.write(`chmod: missing operand after '${modeSpec}'`);
        return;
      }

      const formatMode = (mode: number): string => {
        return (mode & 0o777).toString(8).padStart(4, "0");
      };

      const applySymbolicClause = (mode: number, clause: string): number | null => {
        const match = clause.match(/^([ugoa]*)([+\-=])([rwxX]+)$/);
        if (!match) {
          return null;
        }

        const whoRaw = match[1] ?? "";
        const op = (match[2] ?? "+") as ModeOp;
        const perms = match[3] ?? "";

        const classes: Set<ModeClass> = new Set();
        if (whoRaw.length === 0 || whoRaw.includes("a")) {
          classes.add("u");
          classes.add("g");
          classes.add("o");
        }
        if (whoRaw.includes("u")) {
          classes.add("u");
        }
        if (whoRaw.includes("g")) {
          classes.add("g");
        }
        if (whoRaw.includes("o")) {
          classes.add("o");
        }

        const bitFor = (klass: ModeClass, perm: string): number => {
          if (klass === "u") {
            if (perm === "r") {
              return 0o400;
            }
            if (perm === "w") {
              return 0o200;
            }
            return 0o100;
          }
          if (klass === "g") {
            if (perm === "r") {
              return 0o040;
            }
            if (perm === "w") {
              return 0o020;
            }
            return 0o010;
          }
          if (perm === "r") {
            return 0o004;
          }
          if (perm === "w") {
            return 0o002;
          }
          return 0o001;
        };

        let clearMask = 0;
        let setMask = 0;
        for (const klass of classes) {
          clearMask |= bitFor(klass, "r") | bitFor(klass, "w") | bitFor(klass, "x");
          for (const perm of perms) {
            if (perm !== "r" && perm !== "w" && perm !== "x" && perm !== "X") {
              return null;
            }
            const effective = perm === "X" ? "x" : perm;
            setMask |= bitFor(klass, effective);
          }
        }

        if (op === "+") {
          return mode | setMask;
        }
        if (op === "-") {
          return mode & ~setMask;
        }
        return (mode & ~clearMask) | setMask;
      };

      const applyModeSpec = (currentMode: number): number | null => {
        if (/^[0-7]{3,4}$/.test(modeSpec)) {
          return Number.parseInt(modeSpec, 8) & 0o777;
        }

        let nextMode = currentMode;
        const clauses = modeSpec.split(",");
        for (const clause of clauses) {
          if (clause.length === 0) {
            return null;
          }
          const updated = applySymbolicClause(nextMode, clause);
          if (updated === null) {
            return null;
          }
          nextMode = updated;
        }
        return nextMode;
      };

      const collectTargets = (root: string, out: string[]): boolean => {
        const stat = sys.fs.stat(root);
        if (!stat) {
          sys.write(`chmod: cannot access '${root}': No such file or directory`);
          return false;
        }

        out.push(root);
        if (!recursive || stat.kind !== "dir") {
          return true;
        }

        const listing = sys.fs.list(root);
        if (listing.error) {
          sys.write(listing.error.replace(/^ls:/, "chmod:"));
          return false;
        }

        for (const item of listing.items) {
          const child = sys.helpers.joinPath(root, item.name);
          if (!collectTargets(child, out)) {
            return false;
          }
        }
        return true;
      };

      for (const target of targets) {
        const absoluteTarget = sys.fs.toAbsolute(target);
        const applyPaths: string[] = [];
        if (!collectTargets(absoluteTarget, applyPaths)) {
          continue;
        }

        for (const applyPath of applyPaths) {
          const stat = sys.fs.stat(applyPath);
          if (!stat) {
            sys.write(`chmod: cannot access '${applyPath}': No such file or directory`);
            continue;
          }

          const previousMode = stat.mode;
          const nextMode = applyModeSpec(previousMode);
          if (nextMode === null) {
            sys.write(`chmod: invalid mode: '${modeSpec}'`);
            return;
          }

          const result = sys.fs.chmodMode(applyPath, nextMode);
          if (!result.ok) {
            sys.write(result.error);
            continue;
          }

          if (verbose) {
            sys.write(
              `mode of '${applyPath}' changed from ${formatMode(previousMode)} to ${formatMode(nextMode)}`
            );
          }
        }
      }
    }
  });
};

