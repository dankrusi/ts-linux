import type { UnixCommandInstaller } from "../types";

export const installCpp: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "cpp",
        description: "copy files and directories (cp alias)",
        run: async ({ args, sys }) => {
          const actor = sys.runtime.getUser(sys.process.user) ?? sys.runtime.getActiveUser();
          await sys.runtime.runCommandByArgv(["cp", ...args], {
            stdin: sys.process.stdin,
            stdout: (message = "") => {
              sys.write(message);
            },
            runAsUser: actor,
            isTTY: sys.process.isTTY
          });
        }
      });
};
