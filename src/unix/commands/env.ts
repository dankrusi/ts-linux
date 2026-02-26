import type { UnixCommandInstaller } from "../types";

export const installEnv: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "env",
        description: "print or run with modified environment",
        run: async ({ args, sys }) => {
          const scoped = sys.helpers.currentEnvMap();
          const applyUnset = (name: string): boolean => {
            if (!sys.helpers.isValidEnvName(name)) {
              sys.write(`env: invalid variable name '${name}'`);
              return false;
            }
            scoped.delete(name);
            return true;
          };
  
          const applyAssignment = (assignment: string): boolean => {
            const index = assignment.indexOf("=");
            if (index < 0) {
              return false;
            }
            if (index === 0) {
              sys.write(`env: '${assignment}': invalid variable name`);
              return false;
            }
            const name = assignment.slice(0, index);
            const value = assignment.slice(index + 1);
            if (!sys.helpers.isValidEnvName(name)) {
              sys.write(`env: '${name}': invalid variable name`);
              return false;
            }
            scoped.set(name, value);
            return true;
          };
  
          let commandIndex = -1;
          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i];
            if (!arg) {
              continue;
            }
  
            if (arg === "--") {
              commandIndex = i + 1;
              break;
            }
  
            if (arg === "-i" || arg === "--ignore-environment") {
              scoped.clear();
              continue;
            }
  
            if (arg === "-u") {
              const value = args[i + 1];
              if (!value) {
                sys.write("env: option '-u' requires an argument");
                return;
              }
              if (!applyUnset(value)) {
                return;
              }
              i += 1;
              continue;
            }
  
            if (arg.startsWith("-u") && arg.length > 2) {
              if (!applyUnset(arg.slice(2))) {
                return;
              }
              continue;
            }
  
            if (arg.startsWith("-")) {
              sys.write(`env: invalid option -- '${arg}'`);
              return;
            }
  
            if (arg.includes("=")) {
              if (!applyAssignment(arg)) {
                return;
              }
              continue;
            }
  
            commandIndex = i;
            break;
          }
  
          if (commandIndex >= 0 && commandIndex < args.length) {
            const commandArgs = args.slice(commandIndex);
            if (commandArgs.length === 0) {
              return;
            }
  
            const actor = sys.runtime.getUser(sys.process.user) ?? sys.runtime.getActiveUser();
            const previous = sys.helpers.currentEnvMap();
            sys.runtime.replaceEnvironment(scoped);
            try {
              await sys.runtime.runCommandByArgv(commandArgs, {
                stdin: sys.process.stdin,
                stdout: (message = "") => {
                  sys.write(message);
                },
                runAsUser: actor,
                isTTY: sys.process.isTTY
              });
            } finally {
              sys.runtime.replaceEnvironment(previous);
              sys.runtime.syncEnvironmentForActiveUser();
            }
            return;
          }
  
          const entries = [...scoped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
          for (const [key, value] of entries) {
            sys.write(`${key}=${value}`);
          }
        }
      });
};
