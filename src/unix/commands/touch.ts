import type { UnixCommandInstaller } from "../types";

export const installTouch: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "touch",
        description: "create files or update file timestamps",
        source: makeSyscallSource("touch", [
          "let noCreate = false;",
          "const paths = [];",
          "for (const arg of args) {",
          "  if (arg === '-c' || arg === '--no-create') { noCreate = true; continue; }",
          "  if (arg === '-a' || arg === '-m') { continue; }",
          "  paths.push(arg);",
          "}",
          "if (paths.length === 0) { sys.write('touch: missing file operand'); return; }",
          "for (const path of paths) {",
          "  const result = fs.touch(path, { noCreate });",
          "  if (!result.ok) sys.write(result.error);",
          "}"
        ]),
        run: ({ args, sys, fs }) => {
          let noCreate = false;
          const targets: string[] = [];
          let parsingOptions = true;
  
          for (const arg of args) {
            if (parsingOptions && arg === "--") {
              parsingOptions = false;
              continue;
            }
  
            if (parsingOptions && arg === "--no-create") {
              noCreate = true;
              continue;
            }
  
            if (parsingOptions && arg.startsWith("-") && arg !== "-") {
              for (const flag of arg.slice(1)) {
                if (flag === "c") {
                  noCreate = true;
                  continue;
                }
                if (flag === "a" || flag === "m") {
                  continue;
                }
                sys.write(`touch: invalid option -- '${flag}'`);
                return;
              }
              continue;
            }
  
            targets.push(arg);
          }
  
          if (targets.length === 0) {
            sys.write("touch: missing file operand");
            return;
          }
  
          for (const target of targets) {
            const result = fs.touch(target, { noCreate });
            if (!result.ok) {
              sys.write(result.error);
            }
          }
        }
      });
};
