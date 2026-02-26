import type { UnixCommandInstaller } from "../types";

export const installPwd: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "pwd",
        description: "print working directory",
        run: ({ args, sys }) => {
          for (const arg of args) {
            if (arg === "-L" || arg === "--logical" || arg === "-P" || arg === "--physical") {
              continue;
            }
            sys.write(`pwd: invalid option: ${arg}`);
            return;
          }
          sys.write(sys.pwd());
        }
      });
};
