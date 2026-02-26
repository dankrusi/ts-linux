import type { UnixCommandInstaller } from "../types";

export const installExit: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "exit",
        description: "exit the shell",
        run: ({ args, sys }) => {
          let exitCode = 0;
  
          if (args.length > 1) {
            sys.write("exit: too many arguments");
            return;
          }
  
          const rawCode = args[0];
          if (rawCode) {
            if (!/^[+-]?\d+$/.test(rawCode)) {
              sys.write(`exit: ${rawCode}: numeric argument required`);
              exitCode = 2;
            } else {
              const parsed = Number.parseInt(rawCode, 10);
              exitCode = ((parsed % 256) + 256) % 256;
            }
          }
  
          sys.write("exit");
          const exited = sys.helpers.exitInteractiveShell(exitCode);
          if (!exited) {
            sys.write("logout");
            sys.runtime.bridge.disconnect(`Connection to ${sys.runtime.host} closed.`);
          }
        }
      });
};
