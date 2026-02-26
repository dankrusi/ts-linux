import type { UnixCommandInstaller } from "../types";

export const installCat: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "cat",
        description: "print file contents",
        source: makeSyscallSource("cat", [
          "let numberAll = false;",
          "let numberNonBlank = false;",
          "let squeezeBlank = false;",
          "const targets = [];",
          "for (const arg of args) {",
          "  if (arg.startsWith('-') && arg !== '-') {",
          "    for (const flag of arg.slice(1)) {",
          "      if (flag === 'n') numberAll = true;",
          "      else if (flag === 'b') numberNonBlank = true;",
          "      else if (flag === 's') squeezeBlank = true;",
          "      else { sys.write(`cat: invalid option -- '${flag}'`); return; }",
          "    }",
          "    continue;",
          "  }",
          "  targets.push(arg);",
          "}",
          "if (targets.length === 0) targets.push('-');",
          "let lineNo = 1;",
          "let previousBlank = false;",
          "const output = [];",
          "for (const target of targets) {",
          "  const result = target === '-' ? { content: sys.process.stdin } : sys.readFile(target);",
          "  if ('error' in result) { sys.write(result.error); continue; }",
          "  for (const line of result.content.split('\\n')) {",
          "    const blank = line.length === 0;",
          "    if (squeezeBlank && blank && previousBlank) continue;",
          "    previousBlank = blank;",
          "    let rendered = line;",
          "    if (numberNonBlank) { if (!blank) rendered = `${String(lineNo++).padStart(6)}\\t${line}`; }",
          "    else if (numberAll) rendered = `${String(lineNo++).padStart(6)}\\t${line}`;",
          "    output.push(rendered);",
          "  }",
          "}",
          "if (output.length > 0) sys.write(output.join('\\n'));"
        ]),
        run: ({ args, sys }) => {
          let numberAll = false;
          let numberNonBlank = false;
          let squeezeBlank = false;
          let showEnds = false;
          const targets: string[] = [];
          let parsingOptions = true;
  
          for (const arg of args) {
            if (parsingOptions && arg === "--") {
              parsingOptions = false;
              continue;
            }
  
            if (parsingOptions && arg.startsWith("--")) {
              if (arg === "--number") {
                numberAll = true;
                continue;
              }
              if (arg === "--number-nonblank") {
                numberNonBlank = true;
                continue;
              }
              if (arg === "--squeeze-blank") {
                squeezeBlank = true;
                continue;
              }
              if (arg === "--show-ends") {
                showEnds = true;
                continue;
              }
              sys.write(`cat: unrecognized option '${arg}'`);
              return;
            }
  
            if (parsingOptions && arg.startsWith("-") && arg !== "-") {
              for (const flag of arg.slice(1)) {
                if (flag === "n") {
                  numberAll = true;
                  continue;
                }
                if (flag === "b") {
                  numberNonBlank = true;
                  continue;
                }
                if (flag === "s") {
                  squeezeBlank = true;
                  continue;
                }
                if (flag === "E") {
                  showEnds = true;
                  continue;
                }
                sys.write(`cat: invalid option -- '${flag}'`);
                return;
              }
              continue;
            }
  
            targets.push(arg);
          }
  
          if (targets.length === 0) {
            targets.push("-");
          }
  
          let lineNo = 1;
          let previousBlank = false;
          const outputLines: string[] = [];
  
          const consumeContent = (content: string): void => {
            const lines = content.replace(/\r\n/g, "\n").split("\n");
            for (const line of lines) {
              const blank = line.length === 0;
              if (squeezeBlank && blank && previousBlank) {
                continue;
              }
              previousBlank = blank;
  
              let rendered = showEnds ? `${line}$` : line;
              if (numberNonBlank) {
                if (!blank) {
                  rendered = `${String(lineNo).padStart(6)}\t${rendered}`;
                  lineNo += 1;
                }
              } else if (numberAll) {
                rendered = `${String(lineNo).padStart(6)}\t${rendered}`;
                lineNo += 1;
              }
              outputLines.push(rendered);
            }
          };
  
          for (const target of targets) {
            if (target === "-") {
              consumeContent(sys.process.stdin);
              continue;
            }
  
            const result = sys.runtime.fs.readFile(target);
            if ("error" in result) {
              sys.write(result.error);
              continue;
            }
            consumeContent(result.content);
          }
  
          if (outputLines.length > 0) {
            sys.write(outputLines.join("\n"));
          }
        }
      });
};
