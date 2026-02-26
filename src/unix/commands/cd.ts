import type { UnixCommandInstaller } from "../types";

export const installCd: UnixCommandInstaller = (ctx): void => {
  const { core, runtime, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "cd",
        description: "change directory",
        source: makeSyscallSource("cd", [
          "const target = args[0] ?? '/home/current-user';",
          "const result = sys.cd(target);",
          "if (!result.ok) {",
          "  sys.write(result.error);",
          "}"
        ]),
        run: ({ args, sys }) => {
          const target = args[0] ?? runtime.getActiveUser().home;
          const result = sys.cd(target);
          if (!result.ok) {
            sys.write(result.error);
          }
        }
      });
};
