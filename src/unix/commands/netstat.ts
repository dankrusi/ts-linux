import type { UnixCommandInstaller } from "../types";

export const installNetstat: UnixCommandInstaller = (ctx): void => {
  const { core, runtime, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "netstat",
        description: "network statistics",
        source: makeSyscallSource("netstat", [
          "// runtime supports: netstat [-tulpan]"
        ]),
        run: ({ args, sys }) => {
          let includeTcp = false;
          let includeUdp = false;
          let showListeningOnly = false;
          let showAll = false;
          let numeric = false;
          let showProgram = false;
  
          for (const arg of args) {
            if (!arg.startsWith("-") || arg === "-") {
              sys.write(`netstat: unexpected argument '${arg}'`);
              return;
            }
            for (const flag of arg.slice(1)) {
              if (flag === "t") {
                includeTcp = true;
                continue;
              }
              if (flag === "u") {
                includeUdp = true;
                continue;
              }
              if (flag === "l") {
                showListeningOnly = true;
                continue;
              }
              if (flag === "a") {
                showAll = true;
                continue;
              }
              if (flag === "n") {
                numeric = true;
                continue;
              }
              if (flag === "p") {
                showProgram = true;
                continue;
              }
              if (flag === "r" || flag === "s") {
                continue;
              }
              sys.write(`netstat: invalid option -- '${flag}'`);
              return;
            }
          }
  
          if (!includeTcp && !includeUdp) {
            includeTcp = true;
            includeUdp = true;
          }
  
          const rows = [
            {
              proto: "tcp",
              recvq: 0,
              sendq: 0,
              local: numeric ? "0.0.0.0:22" : "0.0.0.0:ssh",
              foreign: "0.0.0.0:*",
              state: "LISTEN",
              program: "1/init"
            },
            {
              proto: "tcp",
              recvq: 0,
              sendq: 0,
              local: numeric ? "10.0.2.15:47218" : `${runtime.host}:47218`,
              foreign: numeric ? "93.184.216.34:443" : "example.com:https",
              state: "ESTABLISHED",
              program: "2/bash"
            },
            {
              proto: "udp",
              recvq: 0,
              sendq: 0,
              local: numeric ? "0.0.0.0:68" : "0.0.0.0:bootpc",
              foreign: "0.0.0.0:*",
              state: "",
              program: "1/init"
            }
          ].filter((row) => {
            if (row.proto === "tcp" && !includeTcp) {
              return false;
            }
            if (row.proto === "udp" && !includeUdp) {
              return false;
            }
            if (showListeningOnly && row.state !== "LISTEN") {
              return false;
            }
            return showAll || row.state === "LISTEN" || row.state === "ESTABLISHED";
          });
  
          sys.write("Active Internet connections (w/o servers)");
          sys.write(
            `Proto Recv-Q Send-Q Local Address           Foreign Address         State${showProgram ? "       PID/Program name" : ""}`
          );
          for (const row of rows) {
            const state = row.state.padEnd(11, " ");
            const base =
              `${row.proto.padEnd(5, " ")} ${String(row.recvq).padStart(6, " ")} ${String(row.sendq).padStart(6, " ")} ${row.local.padEnd(22, " ")} ${row.foreign.padEnd(22, " ")} ${state}`;
            sys.write(showProgram ? `${base} ${row.program}` : base);
          }
        }
      });
};
