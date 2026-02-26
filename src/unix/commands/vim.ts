import type { UnixCommandInstaller } from "../types";

export const installVim: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "vim",
        description: "improved vi editor compatibility wrapper",
        run: async ({ args, sys }) => {
          await sys.helpers.runTextEditorCommand("vi", "vim", args, (message = "") => {
            sys.write(message);
          });
        }
      });
};
