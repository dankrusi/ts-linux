import type { UnixCommandInstaller } from "../types";

export const installExport: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "export",
        description: "set exported environment variables",
        source: makeSyscallSource("export", [
          "// runtime supports: export NAME=value, export NAME, export -p, export -n NAME",
        ]),
        run: ({ args, sys }) => {
          const printEntries = (): void => {
            const entries = [...sys.helpers.currentEnvMap().entries()].sort((a, b) => a[0].localeCompare(b[0]));
            for (const [key, value] of entries) {
              const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
              sys.write(`declare -x ${key}="${escaped}"`);
            }
          };
  
          if (args.length === 0) {
            printEntries();
            return;
          }
  
          let unexport = false;
          let pendingPrint = false;
  
          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i];
            if (!arg) {
              continue;
            }
  
            if (arg === "--") {
              continue;
            }
  
            if (arg === "-p") {
              pendingPrint = true;
              continue;
            }
  
            if (arg === "-n") {
              unexport = true;
              continue;
            }
  
            if (arg.startsWith("-")) {
              sys.write(`export: invalid option -- '${arg}'`);
              return;
            }
  
            const equalsIndex = arg.indexOf("=");
            const name = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
            const value = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : undefined;
  
            if (!sys.helpers.isValidEnvName(name)) {
              sys.write(`export: \`${arg}\`: not a valid identifier`);
              return;
            }
  
            if (unexport) {
              sys.runtime.envVars.delete(name);
              continue;
            }
  
            if (value !== undefined) {
              sys.runtime.envVars.set(name, value);
            } else if (!sys.runtime.envVars.has(name)) {
              sys.runtime.envVars.set(name, "");
            }
          }
  
          sys.runtime.syncEnvironmentForActiveUser();
          if (pendingPrint) {
            printEntries();
          }
        }
      });
};
