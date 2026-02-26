import { unixCommandInstallers } from "./commands";
import type { UnixToolHelpers } from "./types";
import type { ExecutableProgramDefinition } from "../terminal/shell";

export type { UnixToolHelpers } from "./types";

export const installUnixTools = (
  runtime: any,
  materializeFiles = true,
  helpers: UnixToolHelpers
): void => {
  const core = (program: Omit<ExecutableProgramDefinition, "path">): void => {
    runtime.registerExecutable({
      ...program,
      path: `/bin/${program.name}`
    }, { materializeFile: materializeFiles });
  };

  const context = { runtime, helpers, core } as const;
  for (const installCommand of unixCommandInstallers) {
    installCommand(context);
  }
};
