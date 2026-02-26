import type { UnixCommandInstaller } from "../types";

export const installExit: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource, exitInteractiveShell } = helpers;

  core({
        name: "exit",
        description: "exit the shell",
        source: makeSyscallSource("exit", [
          "const code = Number(args[0] ?? 0);",
          "sys.write('exit');",
          "// runtime exits current shell context when nested"
        ]),
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
          const exited = exitInteractiveShell(exitCode);
          if (!exited) {
            sys.write("logout");
            sys.runtime.bridge.disconnect(`Connection to ${sys.runtime.host} closed.`);
          }
        }
      });
};
