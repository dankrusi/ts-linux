import type { UnixCommandInstaller } from "../types";

export const installVi: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "vi",
        description: "modal text editor",
        run: async ({ args, sys }) => {
          await sys.helpers.runTextEditorCommand("vi", "vi", args, (message = "") => {
            sys.write(message);
          });
        }
      });
};
