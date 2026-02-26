import type { UnixCommandInstaller } from "../types";

export const installUname: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "uname",
        description: "print system info",
        run: ({ args, sys }) => {
          const fields = {
            s: sys.runtime.system.kernelName,
            n: sys.process.host,
            r: sys.runtime.system.kernelRelease,
            v: sys.runtime.system.kernelVersion,
            m: sys.runtime.system.machine,
            o: sys.runtime.system.operatingSystem
          } as const;
  
          if (args.length === 0) {
            sys.console.write(fields.s);
            return;
          }
  
          if (args.includes("-a") || args.includes("--all")) {
            sys.console.write(`${fields.s} ${fields.n} ${fields.r} ${fields.v} ${fields.m} ${fields.o}`);
            return;
          }
  
          const values: string[] = [];
          for (const arg of args) {
            if (arg === "-s" || arg === "--kernel-name") {
              values.push(fields.s);
              continue;
            }
            if (arg === "-n" || arg === "--nodename") {
              values.push(fields.n);
              continue;
            }
            if (arg === "-r" || arg === "--kernel-release") {
              values.push(fields.r);
              continue;
            }
            if (arg === "-v" || arg === "--kernel-version") {
              values.push(fields.v);
              continue;
            }
            if (arg === "-m" || arg === "--machine") {
              values.push(fields.m);
              continue;
            }
            if (arg === "-o" || arg === "--operating-system") {
              values.push(fields.o);
              continue;
            }
            sys.console.write(`uname: invalid option: ${arg}`);
            return;
          }
  
          sys.console.write(values.join(" "));
        }
      });
};
