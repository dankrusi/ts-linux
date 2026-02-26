import type { UnixCommandInstaller } from "../types";

export const installWhoami: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "whoami",
        description: "print current user",
        run: ({ args, sys }) => {
          void args;
          sys.console.write(sys.process.user);
        }
      });
};
