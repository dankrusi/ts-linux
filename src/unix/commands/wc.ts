import type { UnixCommandInstaller } from "../types";

interface WcCounts {
  lines: number;
  words: number;
  bytes: number;
  chars: number;
}

export const installWc: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
    name: "wc",
    description: "print newline, word, and byte counts",
    run: ({ args, sys }) => {
      let showLines = false;
      let showWords = false;
      let showBytes = false;
      let showChars = false;
      const targets: string[] = [];
      let parsingOptions = true;

      for (const arg of args) {
        if (parsingOptions && arg === "--") {
          parsingOptions = false;
          continue;
        }

        if (parsingOptions && arg.startsWith("--")) {
          if (arg === "--lines") {
            showLines = true;
            continue;
          }
          if (arg === "--words") {
            showWords = true;
            continue;
          }
          if (arg === "--bytes") {
            showBytes = true;
            continue;
          }
          if (arg === "--chars") {
            showChars = true;
            continue;
          }
          sys.write(`wc: unrecognized option '${arg}'`);
          return;
        }

        if (parsingOptions && arg.startsWith("-") && arg !== "-") {
          for (const flag of arg.slice(1)) {
            if (flag === "l") {
              showLines = true;
              continue;
            }
            if (flag === "w") {
              showWords = true;
              continue;
            }
            if (flag === "c") {
              showBytes = true;
              continue;
            }
            if (flag === "m") {
              showChars = true;
              continue;
            }
            sys.write(`wc: invalid option -- '${flag}'`);
            return;
          }
          continue;
        }

        targets.push(arg);
      }

      if (!showLines && !showWords && !showBytes && !showChars) {
        showLines = true;
        showWords = true;
        showBytes = true;
      }

      const selected: Array<keyof WcCounts> = [];
      if (showLines) {
        selected.push("lines");
      }
      if (showWords) {
        selected.push("words");
      }
      if (showBytes) {
        selected.push("bytes");
      }
      if (showChars) {
        selected.push("chars");
      }

      const sources = targets.length > 0 ? targets : ["-"];
      const rows: Array<{ label: string; counts: WcCounts; showLabel: boolean }> = [];

      const computeCounts = (content: string): WcCounts => {
        const normalized = content.replace(/\r\n/g, "\n");
        return {
          lines: (normalized.match(/\n/g) ?? []).length,
          words: (normalized.match(/\S+/g) ?? []).length,
          bytes: new TextEncoder().encode(content).length,
          chars: Array.from(content).length
        };
      };

      for (const source of sources) {
        if (source === "-") {
          rows.push({
            label: source,
            counts: computeCounts(sys.process.stdin),
            showLabel: targets.length > 0
          });
          continue;
        }

        const readResult = sys.fs.readFile(source);
        if ("error" in readResult) {
          sys.write(readResult.error.replace(/^cat:/, "wc:"));
          continue;
        }
        rows.push({
          label: source,
          counts: computeCounts(readResult.content),
          showLabel: true
        });
      }

      if (rows.length === 0) {
        return;
      }

      const totals: WcCounts = {
        lines: 0,
        words: 0,
        bytes: 0,
        chars: 0
      };

      const formatRow = (counts: WcCounts, label?: string): string => {
        const values = selected.map((key) => String(counts[key]).padStart(8, " "));
        return label ? `${values.join("")} ${label}` : values.join("");
      };

      for (const row of rows) {
        totals.lines += row.counts.lines;
        totals.words += row.counts.words;
        totals.bytes += row.counts.bytes;
        totals.chars += row.counts.chars;
        const label = row.showLabel ? row.label : undefined;
        sys.write(formatRow(row.counts, label));
      }

      if (rows.length > 1) {
        sys.write(formatRow(totals, "total"));
      }
    }
  });
};

