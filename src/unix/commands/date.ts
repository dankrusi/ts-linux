import type { UnixCommandInstaller } from "../types";

export const installDate: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "date",
        description: "print current date/time",
        source: makeSyscallSource("date", ["sys.write(sys.now().toString());"]),
        run: ({ args, sys }) => {
          void args;
          sys.console.write(sys.now().toString());
        }
      });
};
