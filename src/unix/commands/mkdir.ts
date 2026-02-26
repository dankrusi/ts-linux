import type { UnixCommandInstaller } from "../types";

export const installMkdir: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
    name: "mkdir",
    description: "create directories",
    source: makeSyscallSource("mkdir", [
      "// runtime supports: mkdir [-p] [-v] [-m MODE] dir ..."
    ]),
    run: ({ args, sys }) => {
      let parents = false;
      let verbose = false;
      let modeOverride: number | null = null;
      const targets: string[] = [];
      let parsingOptions = true;

      const parseMode = (raw: string): number | null => {
        if (!/^[0-7]{3,4}$/.test(raw)) {
          return null;
        }
        return Number.parseInt(raw, 8) & 0o777;
      };

      const parentDirectory = (absolutePath: string): string => {
        const normalized =
          absolutePath.endsWith("/") && absolutePath.length > 1
            ? absolutePath.slice(0, -1)
            : absolutePath;
        const slash = normalized.lastIndexOf("/");
        if (slash <= 0) {
          return "/";
        }
        return normalized.slice(0, slash);
      };

      for (let i = 0; i < args.length; i += 1) {
        const arg = args[i] ?? "";
        if (parsingOptions && arg === "--") {
          parsingOptions = false;
          continue;
        }

        if (parsingOptions && arg.startsWith("--")) {
          if (arg === "--parents") {
            parents = true;
            continue;
          }
          if (arg === "--verbose") {
            verbose = true;
            continue;
          }
          if (arg === "--mode") {
            const value = args[i + 1];
            if (!value) {
              sys.write("mkdir: option '--mode' requires an argument");
              return;
            }
            const parsed = parseMode(value);
            if (parsed === null) {
              sys.write(`mkdir: invalid mode '${value}'`);
              return;
            }
            modeOverride = parsed;
            i += 1;
            continue;
          }
          if (arg.startsWith("--mode=")) {
            const rawMode = arg.slice("--mode=".length);
            const parsed = parseMode(rawMode);
            if (parsed === null) {
              sys.write(`mkdir: invalid mode '${rawMode}'`);
              return;
            }
            modeOverride = parsed;
            continue;
          }

          sys.write(`mkdir: unrecognized option '${arg}'`);
          return;
        }

        if (parsingOptions && arg.startsWith("-") && arg !== "-") {
          for (let j = 1; j < arg.length; j += 1) {
            const flag = arg[j];
            if (!flag) {
              continue;
            }
            if (flag === "p") {
              parents = true;
              continue;
            }
            if (flag === "v") {
              verbose = true;
              continue;
            }
            if (flag === "m") {
              const inline = arg.slice(j + 1);
              const nextValue = inline.length > 0 ? inline : args[i + 1];
              if (!nextValue) {
                sys.write("mkdir: option requires an argument -- 'm'");
                return;
              }
              const parsed = parseMode(nextValue);
              if (parsed === null) {
                sys.write(`mkdir: invalid mode '${nextValue}'`);
                return;
              }
              modeOverride = parsed;
              if (inline.length === 0) {
                i += 1;
              }
              break;
            }

            sys.write(`mkdir: invalid option -- '${flag}'`);
            return;
          }
          continue;
        }

        targets.push(arg);
      }

      if (targets.length === 0) {
        sys.write("mkdir: missing operand");
        return;
      }

      for (const target of targets) {
        const absoluteTarget = sys.fs.toAbsolute(target);
        const existing = sys.fs.stat(absoluteTarget);

        if (existing) {
          if (existing.kind === "dir") {
            if (!parents) {
              sys.write(`mkdir: cannot create directory '${target}': File exists`);
            }
            continue;
          }
          sys.write(`mkdir: cannot create directory '${target}': File exists`);
          continue;
        }

        if (!parents) {
          const parentPath = parentDirectory(absoluteTarget);
          const parent = sys.fs.stat(parentPath);
          if (!parent) {
            sys.write(`mkdir: cannot create directory '${target}': No such file or directory`);
            continue;
          }
          if (parent.kind !== "dir") {
            sys.write(`mkdir: cannot create directory '${target}': Not a directory`);
            continue;
          }
        }

        const mkdirResult = sys.fs.mkdir(absoluteTarget);
        if (!mkdirResult.ok) {
          sys.write(mkdirResult.error.replace(/^mkdir:/, "mkdir:"));
          continue;
        }

        if (modeOverride !== null) {
          const chmodResult = sys.fs.chmodMode(absoluteTarget, modeOverride);
          if (!chmodResult.ok) {
            sys.write(chmodResult.error);
            continue;
          }
        }

        if (verbose) {
          sys.write(`mkdir: created directory '${target}'`);
        }
      }
    }
  });
};

