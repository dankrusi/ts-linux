import type { UnixCommandInstaller } from "../types";

export const installChown: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
    name: "chown",
    description: "change file owner and group",
    source: makeSyscallSource("chown", [
      "// runtime supports: chown [-R] [owner][:group] FILE..."
    ]),
    run: ({ args, sys }) => {
      let recursive = false;
      let verbose = false;
      let ownerGroupSpec: string | null = null;
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
          sys.write(`chown: unrecognized option '${arg}'`);
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
            sys.write(`chown: invalid option -- '${flag}'`);
            return;
          }
          continue;
        }

        if (ownerGroupSpec === null) {
          ownerGroupSpec = arg;
          continue;
        }

        targets.push(arg);
      }

      if (!ownerGroupSpec) {
        sys.write("chown: missing operand");
        return;
      }
      if (targets.length === 0) {
        sys.write(`chown: missing operand after '${ownerGroupSpec}'`);
        return;
      }

      const split = ownerGroupSpec.indexOf(":");
      const ownerPartRaw = split >= 0 ? ownerGroupSpec.slice(0, split) : ownerGroupSpec;
      const groupPartRaw = split >= 0 ? ownerGroupSpec.slice(split + 1) : "";
      const ownerPart = ownerPartRaw.length > 0 ? ownerPartRaw : null;
      const groupPart = split >= 0 && groupPartRaw.length > 0 ? groupPartRaw : null;

      if (!ownerPart && !groupPart) {
        sys.write(`chown: invalid spec: '${ownerGroupSpec}'`);
        return;
      }

      const resolveUid = (value: string | null): number | null | undefined => {
        if (value === null) {
          return null;
        }
        if (/^\d+$/.test(value)) {
          return Number.parseInt(value, 10);
        }
        const user = sys.runtime.getUser(value);
        if (!user) {
          return undefined;
        }
        return user.uid;
      };

      const resolveGid = (value: string | null): number | null | undefined => {
        if (value === null) {
          return null;
        }
        if (/^\d+$/.test(value)) {
          return Number.parseInt(value, 10);
        }
        const user = sys.runtime.getUser(value);
        if (!user) {
          return undefined;
        }
        return user.gid;
      };

      const ownerUid = resolveUid(ownerPart);
      if (ownerUid === undefined) {
        sys.write(`chown: invalid user: '${ownerPart ?? ""}'`);
        return;
      }
      const groupGid = resolveGid(groupPart);
      if (groupGid === undefined) {
        sys.write(`chown: invalid group: '${groupPart ?? ""}'`);
        return;
      }

      const collectTargets = (root: string, out: string[]): boolean => {
        const stat = sys.fs.stat(root);
        if (!stat) {
          sys.write(`chown: cannot access '${root}': No such file or directory`);
          return false;
        }

        out.push(root);
        if (!recursive || stat.kind !== "dir") {
          return true;
        }

        const listing = sys.fs.list(root);
        if (listing.error) {
          sys.write(listing.error.replace(/^ls:/, "chown:"));
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
            sys.write(`chown: cannot access '${applyPath}': No such file or directory`);
            continue;
          }

          const nextUid = ownerUid ?? stat.owner;
          const nextGid = groupGid ?? stat.group;
          const result = sys.fs.chown(applyPath, nextUid, nextGid);
          if (!result.ok) {
            sys.write(result.error);
            continue;
          }

          if (verbose) {
            sys.write(`changed ownership of '${applyPath}' to ${nextUid}:${nextGid}`);
          }
        }
      }
    }
  });
};

