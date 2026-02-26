import type { UnixCommandInstaller } from "../types";

export const installCpp: UnixCommandInstaller = (ctx): void => {
  const { core, runtime, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "cpp",
        description: "copy files and directories (cp alias)",
        source: makeSyscallSource("cpp", [
          "const command = ['cp', ...args];",
          "// runtime forwards to cp with identical arguments"
        ]),
        run: async ({ args, sys, stdin, user, isTTY }) => {
          const actor = runtime.getUser(user) ?? runtime.getActiveUser();
          await runtime.runCommandByArgv(["cp", ...args], {
            stdin,
            stdout: (message = "") => {
              sys.write(message);
            },
            runAsUser: actor,
            isTTY
          });
        }
      });
};
