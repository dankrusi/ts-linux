import type { UnixCommandInstaller } from "../types";

export const installWhoami: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "whoami",
        description: "print current user",
        source: makeSyscallSource("whoami", ["sys.write(ctx.user);"]),
        run: ({ user, println }) => {
          println(user);
        }
      });
};
