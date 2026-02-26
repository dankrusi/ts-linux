import type { UnixCommandInstaller } from "../types";

export const installKill: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "kill",
        description: "send a signal to a process",
        source: makeSyscallSource("kill", [
          "// runtime supports: kill [-SIGNAL] pid ..."
        ]),
        run: ({ args, sys }) => {
          if (args.length === 0) {
            sys.write("kill: usage: kill [-s sigspec | -signum | -sigspec] pid");
            return;
          }
  
          let signal = "TERM";
          const targets: string[] = [];
  
          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i] ?? "";
            if (arg === "-l" || arg === "--list") {
              sys.write("HUP INT QUIT KILL TERM STOP CONT");
              return;
            }
  
            if (arg.startsWith("-") && targets.length === 0) {
              const normalized = arg.slice(1).toUpperCase();
              if (normalized === "9" || normalized === "KILL" || normalized === "SIGKILL") {
                signal = "KILL";
                continue;
              }
              if (normalized === "15" || normalized === "TERM" || normalized === "SIGTERM") {
                signal = "TERM";
                continue;
              }
              if (normalized === "STOP" || normalized === "SIGSTOP") {
                signal = "STOP";
                continue;
              }
              sys.write(`kill: invalid signal specification '${arg}'`);
              return;
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
  
            if (signal === "STOP") {
              process.state = "T";
              process.signal = signal;
              continue;
            }
  
            process.state = "Z";
            process.signal = signal;
            process.exitCode = 128;
            process.endedAt = Date.now();
          }
        }
      });
};
