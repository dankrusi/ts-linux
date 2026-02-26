import type { UnixCommandInstaller } from "../types";

export const installHelp: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "help",
        description: "show available commands",
        source: makeSyscallSource("help", [
          "sys.write('commands in $PATH:');",
          "for (const executable of sys.listExecutables()) {",
          "  sys.write(`  ${executable.name.padEnd(12, ' ')} ${executable.description} (${executable.path})`);",
          "}"
        ]),
        run: ({ args, sys }) => {
          void args;
          sys.write("commands in $PATH:");
          for (const executable of sys.listExecutables()) {
            sys.write(`  ${executable.name.padEnd(12, " ")} ${executable.description} (${executable.path})`);
          }
        }
      });
};
