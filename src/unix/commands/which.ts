import type { UnixCommandInstaller } from "../types";

export const installWhich: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "which",
        description: "show command path from $PATH",
        run: ({ args, sys }) => {
          let showAll = false;
          const names: string[] = [];
  
          for (const arg of args) {
            if (arg === "-a") {
              showAll = true;
              continue;
            }
            names.push(arg);
          }
  
          if (names.length === 0) {
            sys.write("which: missing command name");
            return;
          }
  
          for (const name of names) {
            const matches = sys.runtime.resolveAllExecutables(name);
            if (matches.length === 0) {
              continue;
            }
  
            if (showAll) {
              for (const match of matches) {
                sys.write(match);
              }
              continue;
            }
  
            sys.write(matches[0] ?? "");
          }
        }
      });
};
