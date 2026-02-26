import type { UnixCommandInstaller } from "../types";

export const installBash: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "bash",
        description: "GNU Bourne-Again SHell",
        run: async ({ args, sys }) => {
          let loginShell = false;
          let commandText: string | null = null;
          let parsingOptions = true;
          const operands: string[] = [];
  
          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i];
            if (!arg) {
              continue;
            }
  
            if (parsingOptions && arg === "--") {
              parsingOptions = false;
              continue;
            }
  
            if (parsingOptions && (arg === "-l" || arg === "--login")) {
              loginShell = true;
              continue;
            }
  
            if (parsingOptions && arg === "-i") {
              continue;
            }
  
            if (parsingOptions && arg === "-c") {
              const value = args[i + 1];
              if (!value) {
                sys.write("bash: option requires an argument -- c");
                return;
              }
              commandText = value;
              i += 1;
              continue;
            }
  
            if (
              parsingOptions &&
              (arg === "--norc" || arg === "--noprofile" || arg === "--posix" || arg === "--restricted")
            ) {
              continue;
            }
  
            if (parsingOptions && arg.startsWith("-")) {
              sys.write(`bash: invalid option '${arg}'`);
              return;
            }
  
            operands.push(arg);
          }
  
          if (operands.length > 0) {
            sys.write(`bash: ${operands[0]}: No such file or directory`);
            return;
          }
  
          const actor = sys.runtime.getUser(sys.process.user) ?? sys.runtime.getActiveUser();
          const spawnedPid = sys.helpers.enterInteractiveShell({
            user: actor,
            loginShell
          });
  
          if (!commandText) {
            return;
          }
  
          try {
            await sys.runtime.execute(commandText);
          } finally {
            if (sys.runtime.shellPid === spawnedPid) {
              sys.helpers.exitInteractiveShell(0);
            }
          }
        }
      });
};
