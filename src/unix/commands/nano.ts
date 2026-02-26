import type { UnixCommandInstaller } from "../types";

export const installNano: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "nano",
        description: "simple full-screen text editor",
        source: makeSyscallSource("nano", [
          "// runtime supports: nano [file]",
          "// controls: Ctrl+O write, Ctrl+X exit, arrows move"
        ]),
        run: async function (input) {
          const args = input && Array.isArray(input.args) ? input.args : [];
          const sys = input ? input.sys : undefined;
          if (!sys || !sys.helpers || typeof sys.helpers.runTextEditorCommand !== "function") {
            throw new Error("nano runtime is unavailable");
          }

          await sys.helpers.runTextEditorCommand("nano", "nano", args, function (message?: string) {
            if (typeof sys.write === "function") {
              sys.write(typeof message === "string" ? message : "");
            }
          });
        }
      });
};
