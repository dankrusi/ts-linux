import type { UnixCommandInstaller } from "../types";

export const installHelp: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "help",
        description: "show available commands",
        run: ({ args, sys }) => {
          const query = args[0]?.trim();
          if (query) {
            const matches = sys.listExecutables().filter((entry) => entry.name === query);
            if (matches.length === 0) {
              sys.write(`help: no help topics match '${query}'`);
              return;
            }
            for (const entry of matches) {
              sys.write(`${entry.name} - ${entry.description}`);
              sys.write(`  path: ${entry.path}`);
            }
            return;
          }

          sys.write("commands in $PATH:");
          for (const executable of sys.listExecutables()) {
            sys.write(`  ${executable.name.padEnd(12, " ")} ${executable.description} (${executable.path})`);
          }
        }
      });
};
