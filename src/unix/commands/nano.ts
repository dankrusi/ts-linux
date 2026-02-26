import type { UnixCommandInstaller } from "../types";

export const installNano: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource, runTextEditorCommand } = helpers;

  core({
        name: "nano",
        description: "simple full-screen text editor",
        source: makeSyscallSource("nano", [
          "// runtime supports: nano [file]",
          "// controls: Ctrl+O write, Ctrl+X exit, arrows move"
        ]),
        run: async ({ args, sys }) => {
          await runTextEditorCommand("nano", "nano", args, (message = "") => {
            sys.write(message);
          });
        }
      });
};
