import type { UnixCommandInstaller } from "../types";

export const installRm: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource, expandWildcardOperand } = helpers;

  core({
        name: "rm",
        description: "remove files or directories",
        source: makeSyscallSource("rm", [
          "let recursive = false;",
          "let force = false;",
          "const targets = [];",
          "for (const arg of args) {",
          "  if (arg === '--rf' || arg === '--fr') { recursive = true; force = true; continue; }",
          "  if (arg === '-r' || arg === '-R' || arg === '--recursive') recursive = true;",
          "  else if (arg === '-f' || arg === '--force') force = true;",
          "  else targets.push(arg);",
          "}",
          "if (targets.length === 0 && !force) { sys.write('rm: missing operand'); return; }",
          "for (const target of targets) {",
          "  const result = fs.remove(target, { recursive, force });",
          "  if (!result.ok) sys.write(result.error);",
          "}"
        ]),
        run: ({ args, sys, fs }) => {
          let recursive = false;
          let force = false;
          let verbose = false;
          const rawTargets: string[] = [];
          let parsingOptions = true;
  
          for (const arg of args) {
            if (parsingOptions && arg === "--") {
              parsingOptions = false;
              continue;
            }
  
            if (parsingOptions && arg.startsWith("--")) {
              if (arg === "--rf" || arg === "--fr") {
                recursive = true;
                force = true;
                continue;
              }
              if (arg === "--recursive") {
                recursive = true;
                continue;
              }
              if (arg === "--force") {
                force = true;
                continue;
              }
              if (arg === "--verbose") {
                verbose = true;
                continue;
              }
              sys.write(`rm: unrecognized option '${arg}'`);
              return;
            }
  
            if (parsingOptions && arg.startsWith("-") && arg !== "-") {
              for (const flag of arg.slice(1)) {
                if (flag === "r" || flag === "R") {
                  recursive = true;
                  continue;
                }
                if (flag === "f") {
                  force = true;
                  continue;
                }
                if (flag === "v") {
                  verbose = true;
                  continue;
                }
                sys.write(`rm: invalid option -- '${flag}'`);
                return;
              }
              continue;
            }
  
            rawTargets.push(arg);
          }
  
          if (rawTargets.length === 0) {
            if (!force) {
              sys.write("rm: missing operand");
            }
            return;
          }
  
          for (const rawTarget of rawTargets) {
            const targets = expandWildcardOperand(rawTarget);
            for (const target of targets) {
              const result = fs.remove(target, { recursive, force });
              if (!result.ok) {
                sys.write(result.error);
                continue;
              }
              if (verbose) {
                sys.write(`removed '${target}'`);
              }
            }
          }
        }
      });
};
