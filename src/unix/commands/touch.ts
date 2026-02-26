import type { UnixCommandInstaller } from "../types";

export const installTouch: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "touch",
        description: "create files or update file timestamps",
        run: ({ args, sys }) => {
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
            const result = sys.fs.touch(target, { noCreate });
            if (!result.ok) {
              sys.write(result.error);
            }
          }
        }
      });
};
