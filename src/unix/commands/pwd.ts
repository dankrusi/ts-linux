import type { UnixCommandInstaller } from "../types";

export const installPwd: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "pwd",
        description: "print working directory",
        source: makeSyscallSource("pwd", [
          "for (const arg of args) {",
          "  if (arg === '-L' || arg === '--logical' || arg === '-P' || arg === '--physical') {",
          "    continue;",
          "  }",
          "  sys.write(`pwd: invalid option: ${arg}`);",
          "  return;",
          "}",
          "sys.write(sys.pwd());"
        ]),
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
