import type { UnixCommandInstaller } from "../types";

export const installCd: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "cd",
        description: "change directory",
        run: ({ args, sys }) => {
          const target = args[0] ?? sys.runtime.getActiveUser().home;
          const result = sys.cd(target);
          if (!result.ok) {
            sys.write(result.error);
          }
        }
      });
};
