import type { UnixCommandInstaller } from "../types";

export const installMv: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
    name: "mv",
    description: "move (rename) files and directories",
    source: makeSyscallSource("mv", [
      "// runtime supports: mv [-f] [-n] [-v] source... destination"
    ]),
    run: ({ args, sys }) => {
      let force = false;
      let noClobber = false;
      let verbose = false;
      const operands: string[] = [];
      let parsingOptions = true;

      for (const arg of args) {
        if (parsingOptions && arg === "--") {
          parsingOptions = false;
          continue;
        }

        if (parsingOptions && arg.startsWith("--")) {
          if (arg === "--force") {
            force = true;
            continue;
          }
          if (arg === "--no-clobber") {
            noClobber = true;
            continue;
          }
          if (arg === "--verbose") {
            verbose = true;
            continue;
          }
          sys.write(`mv: unrecognized option '${arg}'`);
          return;
        }

        if (parsingOptions && arg.startsWith("-") && arg !== "-") {
          for (const flag of arg.slice(1)) {
            if (flag === "f") {
              force = true;
              continue;
            }
            if (flag === "n") {
              noClobber = true;
              continue;
            }
            if (flag === "v") {
              verbose = true;
              continue;
            }
            sys.write(`mv: invalid option -- '${flag}'`);
            return;
          }
          continue;
        }

        operands.push(arg);
      }

      if (operands.length < 2) {
        sys.write("mv: missing file operand");
        return;
      }

      const destination = operands[operands.length - 1] ?? "";
      const sources = operands.slice(0, -1);
      const destinationAbs = sys.fs.toAbsolute(destination);
      const destinationStat = sys.fs.stat(destinationAbs);
      const destinationIsDirectory = destinationStat?.kind === "dir";

      if (sources.length > 1 && !destinationIsDirectory) {
        sys.write(`mv: target '${destination}' is not a directory`);
        return;
      }

      const actor = sys.runtime.getUser(sys.process.user) ?? sys.runtime.getActiveUser();

      const copyTree = (sourceAbs: string, targetAbs: string): boolean => {
        const sourceStat = sys.fs.stat(sourceAbs);
        if (!sourceStat) {
          sys.write(`mv: cannot stat '${sourceAbs}': No such file or directory`);
          return false;
        }

        if (sourceStat.kind === "dir") {
          if (targetAbs === sourceAbs || targetAbs.startsWith(`${sourceAbs}/`)) {
            sys.write(`mv: cannot move '${sourceAbs}' to a subdirectory of itself, '${targetAbs}'`);
            return false;
          }

          const existingTarget = sys.fs.stat(targetAbs);
          if (existingTarget?.kind === "file") {
            sys.write(`mv: cannot overwrite non-directory '${targetAbs}' with directory '${sourceAbs}'`);
            return false;
          }

          if (!existingTarget) {
            const mkdirResult = sys.fs.mkdir(targetAbs);
            if (!mkdirResult.ok) {
              sys.write(mkdirResult.error.replace(/^mkdir:/, "mv:"));
              return false;
            }
          }

          const chmodResult = sys.fs.chmodMode(targetAbs, sourceStat.mode);
          if (!chmodResult.ok && !force) {
            sys.write(chmodResult.error.replace(/^chmod:/, "mv:"));
            return false;
          }
          if (actor.uid === 0) {
            const chownResult = sys.fs.chown(targetAbs, sourceStat.owner, sourceStat.group);
            if (!chownResult.ok && !force) {
              sys.write(chownResult.error.replace(/^chown:/, "mv:"));
              return false;
            }
          }

          const listing = sys.fs.list(sourceAbs);
          if (listing.error) {
            sys.write(listing.error.replace(/^ls:/, "mv:"));
            return false;
          }

          for (const item of listing.items) {
            const childSource = sys.helpers.joinPath(sourceAbs, item.name);
            const childTarget = sys.helpers.joinPath(targetAbs, item.name);
            if (!copyTree(childSource, childTarget)) {
              return false;
            }
          }
          return true;
        }

        const sourceFile = sys.fs.readFile(sourceAbs);
        if ("error" in sourceFile) {
          sys.write(sourceFile.error.replace(/^cat:/, "mv:"));
          return false;
        }

        const existingTarget = sys.fs.stat(targetAbs);
        if (existingTarget) {
          if (noClobber) {
            return true;
          }

          if (existingTarget.kind === "dir") {
            sys.write(`mv: cannot overwrite directory '${targetAbs}' with non-directory '${sourceAbs}'`);
            return false;
          }

          const removeResult = sys.fs.remove(targetAbs, { recursive: false, force });
          if (!removeResult.ok) {
            sys.write(removeResult.error.replace(/^rm:/, "mv:"));
            return false;
          }
        }

        const writeResult = sys.fs.writeFile(targetAbs, sourceFile.content, {
          executable: Boolean(sourceStat.executable)
        });
        if (!writeResult.ok) {
          sys.write(writeResult.error.replace(/^write:/, "mv:"));
          return false;
        }

        const chmodResult = sys.fs.chmodMode(targetAbs, sourceStat.mode);
        if (!chmodResult.ok && !force) {
          sys.write(chmodResult.error.replace(/^chmod:/, "mv:"));
          return false;
        }
        if (actor.uid === 0) {
          const chownResult = sys.fs.chown(targetAbs, sourceStat.owner, sourceStat.group);
          if (!chownResult.ok && !force) {
            sys.write(chownResult.error.replace(/^chown:/, "mv:"));
            return false;
          }
        }
        return true;
      };

      for (const source of sources) {
        const sourceAbs = sys.fs.toAbsolute(source);
        const sourceStat = sys.fs.stat(sourceAbs);
        if (!sourceStat) {
          sys.write(`mv: cannot stat '${source}': No such file or directory`);
          continue;
        }

        let targetAbs = destinationAbs;
        if (destinationIsDirectory) {
          targetAbs = sys.helpers.joinPath(destinationAbs, sys.helpers.basename(sourceAbs));
        }

        if (sourceAbs === targetAbs) {
          if (verbose) {
            sys.write(`'${source}' -> '${destination}'`);
          }
          continue;
        }

        const targetStat = sys.fs.stat(targetAbs);
        if (noClobber && targetStat) {
          continue;
        }
        if (sourceStat.kind === "dir" && targetStat?.kind === "file") {
          sys.write(`mv: cannot overwrite non-directory '${targetAbs}' with directory '${source}'`);
          continue;
        }
        if (sourceStat.kind === "dir" && targetStat?.kind === "dir") {
          sys.write(`mv: cannot overwrite directory '${targetAbs}'`);
          continue;
        }

        if (!copyTree(sourceAbs, targetAbs)) {
          continue;
        }

        const removeResult = sys.fs.remove(sourceAbs, { recursive: true, force });
        if (!removeResult.ok) {
          sys.write(removeResult.error.replace(/^rm:/, "mv:"));
          continue;
        }

        if (verbose) {
          sys.write(`'${source}' -> '${targetAbs}'`);
        }
      }
    }
  });
};
