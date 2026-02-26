import type { UnixCommandInstaller } from "../types";

export const installClear: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "clear",
        description: "clear terminal output",
        source: makeSyscallSource("clear", ["sys.clear();"]),
        run: ({ sys }) => {
          sys.clear();
        }
      });
};
