import type { UnixCommandInstaller } from "../types";

export const installEnv: UnixCommandInstaller = (ctx): void => {
  const { core, runtime, helpers } = ctx;
  const { makeSyscallSource, currentEnvMap, isValidEnvName } = helpers;

  core({
        name: "env",
        description: "print or run with modified environment",
        source: makeSyscallSource("env", [
          "const entries = Object.entries(process.env || {});",
          "// runtime supports: env, env -u NAME, env NAME=VALUE ... [command]"
        ]),
        run: async ({ args, sys, stdin, user, isTTY }) => {
          const scoped = currentEnvMap();
          const applyUnset = (name: string): boolean => {
            if (!isValidEnvName(name)) {
              sys.write(`env: invalid variable name '${name}'`);
              return false;
            }
            scoped.delete(name);
            return true;
          };
  
          const applyAssignment = (assignment: string): boolean => {
            const index = assignment.indexOf("=");
            if (index <= 0) {
              return false;
            }
            const name = assignment.slice(0, index);
            const value = assignment.slice(index + 1);
            if (!isValidEnvName(name)) {
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
  
            const actor = runtime.getUser(user) ?? runtime.getActiveUser();
            const previous = currentEnvMap();
            runtime.replaceEnvironment(scoped);
            try {
              await runtime.runCommandByArgv(commandArgs, {
                stdin,
                stdout: (message = "") => {
                  sys.write(message);
                },
                runAsUser: actor,
                isTTY
              });
            } finally {
              runtime.replaceEnvironment(previous);
              runtime.syncEnvironmentForActiveUser();
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
