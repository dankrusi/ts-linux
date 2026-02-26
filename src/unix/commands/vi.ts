import type { UnixCommandInstaller } from "../types";

export const installVi: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource, runTextEditorCommand } = helpers;

  core({
        name: "vi",
        description: "modal text editor",
        source: makeSyscallSource("vi", [
          "// runtime supports: vi [+line] [file]",
          "// controls: i insert, Esc normal, :w :q :wq"
        ]),
        run: async ({ args, sys }) => {
          await runTextEditorCommand("vi", "vi", args, (message = "") => {
            sys.write(message);
          });
        }
      });
};
