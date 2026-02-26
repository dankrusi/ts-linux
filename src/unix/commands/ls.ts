import type { UnixCommandInstaller } from "../types";

type VNode = any;

export const installLs: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "ls",
        description: "list files and directories",
        run: ({ args, sys }) => {
          let showAll = false;
          let longFormat = false;
          let onePerLine = false;
          let classify = false;
          let humanReadable = false;
          let directoryAsEntry = false;
          let colorMode: "auto" | "always" | "never" = "auto";
  
          const targets: string[] = [];
          let parsingOptions = true;
  
          for (const arg of args) {
            if (parsingOptions && arg === "--") {
              parsingOptions = false;
              continue;
            }
  
            if (parsingOptions && arg.startsWith("--")) {
              if (arg === "--all") {
                showAll = true;
                continue;
              }
              if (arg === "--long") {
                longFormat = true;
                continue;
              }
              if (arg === "--human-readable") {
                humanReadable = true;
                continue;
              }
              if (arg === "--classify") {
                classify = true;
                continue;
              }
              if (arg === "--directory") {
                directoryAsEntry = true;
                continue;
              }
              if (arg === "--color") {
                colorMode = "always";
                continue;
              }
              if (arg.startsWith("--color=")) {
                const value = arg.slice("--color=".length);
                if (value === "always" || value === "yes" || value === "force") {
                  colorMode = "always";
                  continue;
                }
                if (value === "never" || value === "no" || value === "none") {
                  colorMode = "never";
                  continue;
                }
                if (value === "auto" || value === "tty" || value === "if-tty") {
                  colorMode = "auto";
                  continue;
                }
                sys.write(`ls: invalid argument '${value}' for '--color'`);
                return;
              }
              sys.write(`ls: unrecognized option '${arg}'`);
              return;
            }
  
            if (parsingOptions && arg.startsWith("-") && arg !== "-") {
              for (const flag of arg.slice(1)) {
                if (flag === "a") {
                  showAll = true;
                  continue;
                }
                if (flag === "l") {
                  longFormat = true;
                  continue;
                }
                if (flag === "1") {
                  onePerLine = true;
                  continue;
                }
                if (flag === "F") {
                  classify = true;
                  continue;
                }
                if (flag === "h") {
                  humanReadable = true;
                  continue;
                }
                if (flag === "d") {
                  directoryAsEntry = true;
                  continue;
                }
                sys.write(`ls: invalid option -- '${flag}'`);
                return;
              }
              continue;
            }
  
            targets.push(arg);
          }
  
          const listTargets = targets.length > 0 ? targets : ["."];
          const multipleTargets = listTargets.length > 1;
          const colorizeOutput = colorMode === "always" || (colorMode === "auto" && sys.process.isTTY);
  
          for (let index = 0; index < listTargets.length; index += 1) {
            const target = listTargets[index] ?? ".";
            const entries: Array<{
              name: string;
              node: Pick<VNode, "kind"> & { executable?: boolean; owner: number; mode: number };
              size: number;
            }> = [];
  
            if (directoryAsEntry) {
              const stat = sys.runtime.fs.stat(target);
              if (!stat) {
                sys.write(`ls: cannot access '${target}': no such file or directory`);
                continue;
              }
  
              let size = 4096;
              if (stat.kind === "file") {
                const content = sys.runtime.fs.readFile(target);
                size = "error" in content ? 0 : content.content.length;
              }
  
              entries.push({
                name: target,
                node: {
                  kind: stat.kind,
                  executable: stat.executable,
                  owner: stat.owner,
                  mode: stat.mode
                },
                size
              });
            } else {
              const result = sys.runtime.fs.list(target === "." ? undefined : target);
              if (result.error) {
                sys.write(result.error);
                continue;
              }
  
              if (result.singleFile) {
                const single = result.items[0];
                if (!single) {
                  continue;
                }
  
                const size = single.node.kind === "file" ? single.node.content.length : 4096;
                entries.push({
                  name: single.name,
                  node: {
                    kind: single.node.kind,
                    executable: single.node.kind === "file" ? single.node.executable : false,
                    owner: single.node.owner,
                    mode: single.node.mode
                  },
                  size
                });
              } else {
                for (const item of result.items) {
                  if (!showAll && item.name.startsWith(".")) {
                    continue;
                  }
                  const size = item.node.kind === "file" ? item.node.content.length : 4096;
                  entries.push({
                    name: item.name,
                    node: {
                      kind: item.node.kind,
                      executable: item.node.kind === "file" ? item.node.executable : false,
                      owner: item.node.owner,
                      mode: item.node.mode
                    },
                    size
                  });
                }
              }
            }
  
            if (multipleTargets) {
              sys.write(`${target}:`);
            }
  
            if (longFormat) {
              for (const entry of entries) {
                const displayName = sys.helpers.colorizeLsName(entry.name, entry.node, classify, colorizeOutput);
                const owner = sys.helpers.usernameForUid(entry.node.owner);
                sys.write(sys.helpers.formatLsLongLine(displayName, entry.node, entry.size, owner, humanReadable));
              }
            } else if (onePerLine) {
              for (const entry of entries) {
                const displayName = sys.helpers.colorizeLsName(entry.name, entry.node, classify, colorizeOutput);
                sys.write(displayName);
              }
            } else {
              const names = entries.map((entry) =>
                sys.helpers.colorizeLsName(entry.name, entry.node, classify, colorizeOutput)
              );
              sys.write(names.join("  "));
            }
  
            if (multipleTargets && index < listTargets.length - 1) {
              sys.write("");
            }
          }
        }
      });
};
