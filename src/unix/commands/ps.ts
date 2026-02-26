import type { UnixCommandInstaller } from "../types";

type VirtualProcessState = any;
type VirtualProcess = any;

export const installPs: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "ps",
        description: "report process status",
        source: makeSyscallSource("ps", [
          "// runtime supports: ps, ps -ef"
        ]),
        run: ({ args, sys }) => {
          let showAll = false;
          let full = false;
          const colorize = (text: string, sgr: string): string => {
            if (!sys.process.isTTY) {
              return text;
            }
            return `${sgr}${text}${sys.helpers.ANSI_RESET}`;
          };
          const colorizeProcessLine = (line: string, state: VirtualProcessState): string => {
            if (state === "R") {
              return colorize(line, sys.helpers.ANSI_BOLD_GREEN);
            }
            if (state === "T") {
              return colorize(line, sys.helpers.ANSI_BOLD_YELLOW);
            }
            if (state === "Z") {
              return colorize(line, sys.helpers.ANSI_DIM_RED);
            }
            return line;
          };
  
          for (const arg of args) {
            if (arg.startsWith("-") && arg !== "-") {
              for (const flag of arg.slice(1)) {
                if (flag === "e" || flag === "a" || flag === "x") {
                  showAll = true;
                  continue;
                }
                if (flag === "f") {
                  full = true;
                  continue;
                }
                sys.write(`ps: invalid option -- '${flag}'`);
                return;
              }
            } else if (arg.length > 0) {
              sys.write(`ps: unsupported operand '${arg}'`);
              return;
            }
          }
  
          const actor = sys.runtime.getUser(sys.process.user) ?? sys.runtime.getActiveUser();
          const rows = [...sys.runtime.processes.values()]
            .filter((process) => {
              if (showAll) {
                return true;
              }
              if (process.pid <= 2) {
                return true;
              }
              if (process.user !== actor.username) {
                return false;
              }
              return process.state !== "Z";
            })
            .sort((a, b) => a.pid - b.pid);
  
          const processTime = (process: VirtualProcess): string => {
            const end = process.endedAt ?? Date.now();
            const seconds = Math.max(0, Math.floor((end - process.startedAt) / 1000));
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
          };
  
          if (full) {
            sys.write(colorize("UID        PID  PPID C STIME TTY          TIME CMD", sys.helpers.ANSI_BOLD_CYAN));
            for (const process of rows) {
              const start = new Date(process.startedAt).toTimeString().slice(0, 5);
              const tty = process.pid <= 1 ? "?" : "pts/0";
              const cpu = process.state === "R" ? "1" : "0";
              const line = `${process.user.padEnd(8, " ")} ${String(process.pid).padStart(5, " ")} ${String(process.ppid).padStart(5, " ")} ${cpu} ${start} ${tty.padEnd(8, " ")} ${processTime(process).padStart(8, " ")} ${process.command}`;
              sys.write(colorizeProcessLine(line, process.state));
            }
            return;
          }
  
          sys.write(colorize("  PID TTY          STAT   TIME COMMAND", sys.helpers.ANSI_BOLD_CYAN));
          for (const process of rows) {
            const tty = process.pid <= 1 ? "?" : "pts/0";
            const line = `${String(process.pid).padStart(5, " ")} ${tty.padEnd(12, " ")} ${process.state.padEnd(4, " ")} ${processTime(process).padStart(6, " ")} ${process.command}`;
            sys.write(colorizeProcessLine(line, process.state));
          }
        }
      });
};
