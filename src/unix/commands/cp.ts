import type { UnixCommandInstaller } from "../types";

export const installCp: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "cp",
        description: "copy files and directories",
        run: ({ args, sys }) => {
          let recursive = false;
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
              if (arg === "--recursive") {
                recursive = true;
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
              if (arg === "--force") {
                continue;
              }
              if (arg === "--archive") {
                recursive = true;
                continue;
              }
              sys.write(`cp: unrecognized option '${arg}'`);
              return;
            }
  
            if (parsingOptions && arg.startsWith("-") && arg !== "-") {
              for (const flag of arg.slice(1)) {
                if (flag === "r" || flag === "R") {
                  recursive = true;
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
                if (flag === "f" || flag === "a") {
                  if (flag === "a") {
                    recursive = true;
                  }
                  continue;
                }
                sys.write(`cp: invalid option -- '${flag}'`);
                return;
              }
              continue;
            }
  
            operands.push(arg);
          }
  
          if (operands.length < 2) {
            sys.write("cp: missing file operand");
            return;
          }
  
          const destination = operands[operands.length - 1] ?? "";
          const sources = operands.slice(0, -1);
          const destinationStat = sys.fs.stat(destination);
          const destinationIsDirectory = destinationStat?.kind === "dir";
          const destinationAbs = sys.fs.toAbsolute(destination);
  
          if (sources.length > 1 && !destinationIsDirectory) {
            sys.write(`cp: target '${destination}' is not a directory`);
            return;
          }
  
          const copyEntry = (sourceAbs: string, targetAbs: string): boolean => {
            const sourceStat = sys.fs.stat(sourceAbs);
            if (!sourceStat) {
              sys.write(`cp: cannot stat '${sourceAbs}': No such file or directory`);
              return false;
            }
  
            if (sourceStat.kind === "dir") {
              if (!recursive) {
                sys.write(`cp: -r not specified; omitting directory '${sourceAbs}'`);
                return false;
              }
  
              if (targetAbs === sourceAbs || targetAbs.startsWith(`${sourceAbs}/`)) {
                sys.write(`cp: cannot copy a directory, '${sourceAbs}', into itself, '${targetAbs}'`);
                return false;
              }
  
              const mkdirResult = sys.fs.mkdir(targetAbs);
              if (!mkdirResult.ok) {
                sys.write(`cp: cannot create directory '${targetAbs}': ${mkdirResult.error}`);
                return false;
              }
  
              const listing = sys.fs.list(sourceAbs);
              if (listing.error) {
                sys.write(listing.error.replace(/^ls:/, "cp:"));
                return false;
              }
  
              let ok = true;
              for (const item of listing.items) {
                const childSource = sys.helpers.joinPath(sourceAbs, item.name);
                const childTarget = sys.helpers.joinPath(targetAbs, item.name);
                if (!copyEntry(childSource, childTarget)) {
                  ok = false;
                }
              }
  
              if (verbose) {
                sys.write(`'${sourceAbs}' -> '${targetAbs}'`);
              }
              return ok;
            }
  
            let finalTarget = targetAbs;
            const targetStat = sys.fs.stat(finalTarget);
            if (targetStat?.kind === "dir") {
              finalTarget = sys.helpers.joinPath(finalTarget, sys.helpers.basename(sourceAbs));
            }
  
            if (noClobber && sys.fs.exists(finalTarget)) {
              return true;
            }
  
            const sourceFile = sys.fs.readFile(sourceAbs);
            if ("error" in sourceFile) {
              sys.write(sourceFile.error.replace(/^cat:/, "cp:"));
              return false;
            }
  
            const writeResult = sys.fs.writeFile(finalTarget, sourceFile.content, {
              executable: Boolean(sourceStat.executable)
            });
            if (!writeResult.ok) {
              sys.write(`cp: cannot copy '${sourceAbs}' to '${finalTarget}': ${writeResult.error}`);
              return false;
            }
  
            if (verbose) {
              sys.write(`'${sourceAbs}' -> '${finalTarget}'`);
            }
            return true;
          };
  
          let hadError = false;
          for (const source of sources) {
            const sourceAbs = sys.fs.toAbsolute(source);
            const sourceStat = sys.fs.stat(sourceAbs);
  
            if (!sourceStat) {
              sys.write(`cp: cannot stat '${source}': No such file or directory`);
              hadError = true;
              continue;
            }
  
            let targetAbs = destinationAbs;
            if (destinationIsDirectory) {
              targetAbs = sys.helpers.joinPath(destinationAbs, sys.helpers.basename(sourceAbs));
            }
  
            if (
              sourceStat.kind === "dir" &&
              !destinationIsDirectory &&
              sys.fs.stat(destinationAbs)?.kind === "file"
            ) {
              sys.write(
                `cp: cannot overwrite non-directory '${destination}' with directory '${source}'`
              );
              hadError = true;
              continue;
            }
  
            if (!copyEntry(sourceAbs, targetAbs)) {
              hadError = true;
            }
          }
  
          if (hadError) {
            return;
          }
        }
      });
};
