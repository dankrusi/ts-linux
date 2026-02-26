import type { UnixCommandInstaller } from "../types";

export const installVim: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource, runTextEditorCommand } = helpers;

  core({
        name: "vim",
        description: "improved vi editor compatibility wrapper",
        source: makeSyscallSource("vim", [
          "// runtime supports: vim [+line] [file]",
          "// controls: i insert, Esc normal, :w :q :wq"
        ]),
        run: async ({ args, sys }) => {
          await runTextEditorCommand("vi", "vim", args, (message = "") => {
            sys.write(message);
          });
        }
      });
};
