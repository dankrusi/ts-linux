import type { UnixCommandInstaller } from "../types";

export const installKill: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "kill",
        description: "send a signal to a process",
        run: ({ args, sys }) => {
          if (args.length === 0) {
            sys.write("kill: usage: kill [-s sigspec | -signum | -sigspec] pid");
            return;
          }

          const signalByNumber: Record<string, string> = {
            "1": "HUP",
            "2": "INT",
            "3": "QUIT",
            "9": "KILL",
            "10": "USR1",
            "12": "USR2",
            "15": "TERM",
            "18": "CONT",
            "19": "STOP"
          };
          const signalExitCode: Record<string, number> = {
            HUP: 129,
            INT: 130,
            QUIT: 131,
            KILL: 137,
            USR1: 138,
            USR2: 140,
            TERM: 143
          };
          const parseSignal = (value: string): string | null => {
            const normalized = value.replace(/^SIG/i, "").toUpperCase();
            return signalByNumber[normalized] ?? (signalExitCode[normalized] ? normalized : null);
          };

          let signal = "TERM";
          const targets: string[] = [];

          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i] ?? "";
            if (arg === "-l" || arg === "--list") {
              sys.write("HUP INT QUIT KILL TERM STOP CONT USR1 USR2");
              return;
            }

            if (arg === "-s") {
              const explicit = args[i + 1];
              if (!explicit) {
                sys.write("kill: option requires an argument -- 's'");
                return;
              }
              const parsed = parseSignal(explicit);
              if (!parsed) {
                sys.write(`kill: invalid signal specification '${explicit}'`);
                return;
              }
              signal = parsed;
              i += 1;
              continue;
            }

            if (arg.startsWith("-") && targets.length === 0) {
              const parsed = parseSignal(arg.slice(1));
              if (!parsed) {
                sys.write(`kill: invalid signal specification '${arg}'`);
                return;
              }
              signal = parsed;
              continue;
            }

            targets.push(arg);
          }
  
          if (targets.length === 0) {
            sys.write("kill: usage: kill [-s sigspec | -signum | -sigspec] pid");
            return;
          }
  
          const actor = sys.runtime.getUser(sys.process.user) ?? sys.runtime.getActiveUser();
          for (const rawPid of targets) {
            const pid = Number.parseInt(rawPid, 10);
            if (!Number.isFinite(pid) || pid <= 0) {
              sys.write(`kill: ${rawPid}: arguments must be process ids`);
              continue;
            }
  
            const process = sys.runtime.processes.get(pid);
            if (!process || process.state === "Z") {
              sys.write(`kill: (${pid}) - No such process`);
              continue;
            }

            if (pid === 1 || (pid === sys.runtime.shellPid && actor.uid !== 0)) {
              sys.write(`kill: (${pid}) - Operation not permitted`);
              continue;
            }

            if (actor.uid !== 0 && process.user !== actor.username) {
              sys.write(`kill: (${pid}) - Operation not permitted`);
              continue;
            }

            if (signal === "STOP") {
              process.state = "T";
              process.signal = signal;
              process.endedAt = undefined;
              process.exitCode = undefined;
              continue;
            }

            if (signal === "CONT") {
              if (process.state !== "Z") {
                process.state = "S";
              }
              process.signal = signal;
              continue;
            }

            process.state = "Z";
            process.signal = signal;
            process.exitCode = signalExitCode[signal] ?? 128;
            process.endedAt = Date.now();
          }
        }
      });
};
