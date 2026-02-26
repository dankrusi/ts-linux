import type { UnixCommandInstaller } from "../types";

export const installEcho: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "echo",
        description: "print text",
        source: makeSyscallSource("echo", [
          "let noNewline = false;",
          "let interpretEscapes = false;",
          "let parsingOptions = true;",
          "const words = [];",
          "for (const arg of args) {",
          "  if (parsingOptions && arg === '--') { parsingOptions = false; continue; }",
          "  if (parsingOptions && /^-[eEn]+$/.test(arg)) {",
          "    for (const flag of arg.slice(1)) {",
          "      if (flag === 'n') noNewline = true;",
          "      if (flag === 'e') interpretEscapes = true;",
          "      if (flag === 'E') interpretEscapes = false;",
          "    }",
          "    continue;",
          "  }",
          "  parsingOptions = false;",
          "  words.push(arg);",
          "}",
          "const text = words.join(' ');",
          "const output = interpretEscapes ? text.replace(/\\\\n/g, '\\n').replace(/\\\\t/g, '\\t') : text;",
          "sys.write(noNewline ? output : `${output}\\n`);"
        ]),
        run: ({ args, sys }) => {
          let noNewline = false;
          let interpretEscapes = false;
          let parsingOptions = true;
          const words: string[] = [];
  
          for (const arg of args) {
            if (parsingOptions && arg === "--") {
              parsingOptions = false;
              continue;
            }
  
            if (parsingOptions && /^-[eEn]+$/.test(arg)) {
              for (const flag of arg.slice(1)) {
                if (flag === "n") {
                  noNewline = true;
                }
                if (flag === "e") {
                  interpretEscapes = true;
                }
                if (flag === "E") {
                  interpretEscapes = false;
                }
              }
              continue;
            }
  
            parsingOptions = false;
            words.push(arg);
          }
  
          const text = words.join(" ");
          const output = interpretEscapes ? sys.helpers.parseEchoEscapes(text) : text;
          sys.write(noNewline ? output : `${output}\n`);
        }
      });
};
