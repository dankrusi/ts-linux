import type { UnixCommandInstaller } from "../types";

export const installTail: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
    name: "tail",
    description: "output the last part of files",
    source: makeSyscallSource("tail", [
      "// runtime supports: tail [-n LINES] [file ...]"
    ]),
    run: ({ args, sys }) => {
      let lineCount = 10;
      let fromStart = false;
      const targets: string[] = [];
      let parsingOptions = true;

      const parseCount = (value: string): number | null => {
        if (!/^[+-]?\d+$/.test(value)) {
          return null;
        }
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) {
          return null;
        }
        fromStart = parsed > 0 && value.startsWith("+");
        return Math.max(0, Math.abs(parsed));
      };

      for (let i = 0; i < args.length; i += 1) {
        const arg = args[i] ?? "";
        if (parsingOptions && arg === "--") {
          parsingOptions = false;
          continue;
        }

        if (parsingOptions && (arg === "-n" || arg === "--lines")) {
          const value = args[i + 1];
          if (!value) {
            sys.write(`tail: option '${arg}' requires an argument`);
            return;
          }
          const parsed = parseCount(value);
          if (parsed === null) {
            sys.write(`tail: invalid number of lines: '${value}'`);
            return;
          }
          lineCount = parsed;
          i += 1;
          continue;
        }

        if (parsingOptions && /^-n[+-]?\d+$/.test(arg)) {
          const parsed = parseCount(arg.slice(2));
          if (parsed === null) {
            sys.write(`tail: invalid number of lines: '${arg.slice(2)}'`);
            return;
          }
          lineCount = parsed;
          continue;
        }

        if (parsingOptions && arg.startsWith("--lines=")) {
          const raw = arg.slice("--lines=".length);
          const parsed = parseCount(raw);
          if (parsed === null) {
            sys.write(`tail: invalid number of lines: '${raw}'`);
            return;
          }
          lineCount = parsed;
          continue;
        }

        if (parsingOptions && arg.startsWith("-") && arg !== "-") {
          sys.write(`tail: invalid option -- '${arg}'`);
          return;
        }

        targets.push(arg);
      }

      const sources = targets.length > 0 ? targets : ["-"];
      const multiple = sources.length > 1;

      for (let i = 0; i < sources.length; i += 1) {
        const target = sources[i] ?? "-";

        let content = "";
        if (target === "-") {
          content = sys.process.stdin;
        } else {
          const readResult = sys.fs.readFile(target);
          if ("error" in readResult) {
            sys.write(readResult.error.replace(/^cat:/, "tail:"));
            continue;
          }
          content = readResult.content;
        }

        if (multiple) {
          const label = target === "-" ? "standard input" : target;
          sys.write(`==> ${label} <==`);
        }

        const normalized = content.replace(/\r\n/g, "\n");
        const lines = normalized.length === 0 ? [] : normalized.split("\n");
        const outputLines = fromStart
          ? lines.slice(Math.max(0, lineCount - 1))
          : lines.slice(Math.max(0, lines.length - lineCount));
        if (outputLines.length > 0) {
          sys.write(outputLines.join("\n"));
        }

        if (multiple && i < sources.length - 1) {
          sys.write("");
        }
      }
    }
  });
};
