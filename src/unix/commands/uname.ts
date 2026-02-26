import type { UnixCommandInstaller } from "../types";

export const installUname: UnixCommandInstaller = (ctx): void => {
  const { core, runtime, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "uname",
        description: "print system info",
        source: makeSyscallSource("uname", [
          "const fields = {",
          `  s: '${runtime.system.kernelName}',`,
          "  n: ctx.host,",
          `  r: '${runtime.system.kernelRelease}',`,
          `  v: '${runtime.system.kernelVersion}',`,
          `  m: '${runtime.system.machine}',`,
          `  o: '${runtime.system.operatingSystem}'`,
          "};",
          "const selected = args.length === 0 ? ['s'] : args;",
          "if (selected.includes('-a')) {",
          "  sys.write(`${fields.s} ${fields.n} ${fields.r} ${fields.v} ${fields.m} ${fields.o}`);",
          "  return;",
          "}",
          "const map = { '-s': fields.s, '-n': fields.n, '-r': fields.r, '-v': fields.v, '-m': fields.m, '-o': fields.o };",
          "const out = selected.map((flag) => map[flag]).filter(Boolean);",
          "if (out.length === 0) { sys.write(`uname: invalid option: ${selected[0]}`); return; }",
          "sys.write(out.join(' '));"
        ]),
        run: ({ args, println, host }) => {
          const fields = {
            s: runtime.system.kernelName,
            n: host,
            r: runtime.system.kernelRelease,
            v: runtime.system.kernelVersion,
            m: runtime.system.machine,
            o: runtime.system.operatingSystem
          } as const;
  
          if (args.length === 0) {
            println(fields.s);
            return;
          }
  
          if (args.includes("-a") || args.includes("--all")) {
            println(`${fields.s} ${fields.n} ${fields.r} ${fields.v} ${fields.m} ${fields.o}`);
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
            println(`uname: invalid option: ${arg}`);
            return;
          }
  
          println(values.join(" "));
        }
      });
};
