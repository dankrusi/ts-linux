import type { UnixCommandInstaller } from "../types";

interface GrepInput {
  label: string;
  content: string;
}

export const installGrep: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
    name: "grep",
    description: "print lines matching a pattern",
    source: makeSyscallSource("grep", [
      "// runtime supports: grep [-invc] [-r] pattern [file ...]"
    ]),
    run: ({ args, sys }) => {
      let ignoreCase = false;
      let invert = false;
      let lineNumber = false;
      let countOnly = false;
      let recursive = false;
      let fixedString = false;
      let alwaysFilename = false;
      let suppressFilename = false;
      let suppressErrors = false;
      let parsingOptions = true;
      let pattern: string | null = null;
      const operands: string[] = [];

      for (const arg of args) {
        if (parsingOptions && arg === "--") {
          parsingOptions = false;
          continue;
        }

        if (parsingOptions && arg.startsWith("--")) {
          if (arg === "--ignore-case") {
            ignoreCase = true;
            continue;
          }
          if (arg === "--invert-match") {
            invert = true;
            continue;
          }
          if (arg === "--line-number") {
            lineNumber = true;
            continue;
          }
          if (arg === "--count") {
            countOnly = true;
            continue;
          }
          if (arg === "--recursive") {
            recursive = true;
            continue;
          }
          if (arg === "--fixed-strings") {
            fixedString = true;
            continue;
          }
          if (arg === "--with-filename") {
            alwaysFilename = true;
            continue;
          }
          if (arg === "--no-filename") {
            suppressFilename = true;
            continue;
          }
          if (arg === "--no-messages") {
            suppressErrors = true;
            continue;
          }

          sys.write(`grep: unrecognized option '${arg}'`);
          return;
        }

        if (parsingOptions && arg.startsWith("-") && arg !== "-") {
          for (const flag of arg.slice(1)) {
            if (flag === "i") {
              ignoreCase = true;
              continue;
            }
            if (flag === "v") {
              invert = true;
              continue;
            }
            if (flag === "n") {
              lineNumber = true;
              continue;
            }
            if (flag === "c") {
              countOnly = true;
              continue;
            }
            if (flag === "r" || flag === "R") {
              recursive = true;
              continue;
            }
            if (flag === "F") {
              fixedString = true;
              continue;
            }
            if (flag === "H") {
              alwaysFilename = true;
              continue;
            }
            if (flag === "h") {
              suppressFilename = true;
              continue;
            }
            if (flag === "s") {
              suppressErrors = true;
              continue;
            }

            sys.write(`grep: invalid option -- '${flag}'`);
            return;
          }
          continue;
        }

        if (pattern === null) {
          pattern = arg;
          continue;
        }
        operands.push(arg);
      }

      if (pattern === null) {
        sys.write("usage: grep [OPTION]... PATTERN [FILE]...");
        return;
      }

      const normalize = (value: string): string => {
        return ignoreCase ? value.toLocaleLowerCase() : value;
      };

      let regex: RegExp | null = null;
      if (!fixedString) {
        try {
          regex = new RegExp(pattern, ignoreCase ? "i" : "");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sys.write(`grep: invalid regular expression: ${message}`);
          return;
        }
      }
      const normalizedPattern = normalize(pattern);

      const collectRecursive = (root: string, files: string[]): boolean => {
        const listing = sys.fs.list(root);
        if (listing.error) {
          if (!suppressErrors) {
            sys.write(listing.error.replace(/^ls:/, "grep:"));
          }
          return false;
        }

        for (const item of listing.items) {
          const childPath = sys.helpers.joinPath(root, item.name);
          if (item.node.kind === "dir") {
            if (!collectRecursive(childPath, files)) {
              return false;
            }
            continue;
          }
          files.push(childPath);
        }
        return true;
      };

      const inputs: GrepInput[] = [];
      if (operands.length === 0) {
        inputs.push({
          label: "(standard input)",
          content: sys.process.stdin
        });
      } else {
        for (const operand of operands) {
          if (operand === "-") {
            inputs.push({
              label: "(standard input)",
              content: sys.process.stdin
            });
            continue;
          }

          const stat = sys.fs.stat(operand);
          if (!stat) {
            if (!suppressErrors) {
              sys.write(`grep: ${operand}: No such file or directory`);
            }
            continue;
          }

          if (stat.kind === "dir") {
            if (!recursive) {
              if (!suppressErrors) {
                sys.write(`grep: ${operand}: Is a directory`);
              }
              continue;
            }

            const recursiveFiles: string[] = [];
            if (!collectRecursive(operand, recursiveFiles)) {
              continue;
            }
            for (const filePath of recursiveFiles) {
              const content = sys.fs.readFile(filePath);
              if ("error" in content) {
                if (!suppressErrors) {
                  sys.write(content.error.replace(/^cat:/, "grep:"));
                }
                continue;
              }
              inputs.push({
                label: filePath,
                content: content.content
              });
            }
            continue;
          }

          const content = sys.fs.readFile(operand);
          if ("error" in content) {
            if (!suppressErrors) {
              sys.write(content.error.replace(/^cat:/, "grep:"));
            }
            continue;
          }
          inputs.push({
            label: operand,
            content: content.content
          });
        }
      }

      const showFilename = alwaysFilename || (!suppressFilename && inputs.length > 1);

      for (const input of inputs) {
        const lines = input.content.replace(/\r\n/g, "\n").split("\n");
        const matchedLines: string[] = [];

        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index] ?? "";
          const rawMatch = fixedString
            ? normalize(line).includes(normalizedPattern)
            : Boolean(regex?.test(line));
          const isMatch = invert ? !rawMatch : rawMatch;
          if (!isMatch) {
            continue;
          }

          if (countOnly) {
            matchedLines.push("");
            continue;
          }

          const prefixParts: string[] = [];
          if (showFilename) {
            prefixParts.push(input.label);
          }
          if (lineNumber) {
            prefixParts.push(String(index + 1));
          }
          if (prefixParts.length > 0) {
            sys.write(`${prefixParts.join(":")}:${line}`);
          } else {
            sys.write(line);
          }
        }

        if (countOnly) {
          const prefix = showFilename ? `${input.label}:` : "";
          sys.write(`${prefix}${matchedLines.length}`);
        }
      }
    }
  });
};

