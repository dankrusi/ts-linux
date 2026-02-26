import type { UnixCommandInstaller } from "../types";

export const installClear: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "clear",
        description: "clear terminal output",
        run: ({ args, sys }) => {
          void args;
          sys.clear();
        }
      });
};
