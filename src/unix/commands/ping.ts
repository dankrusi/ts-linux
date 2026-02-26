import type { UnixCommandInstaller } from "../types";

export const installPing: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "ping",
        description: "send ping probes to a network host",
        source: makeSyscallSource("ping", [
          "let count = 4;",
          "let interval = 1;",
          "let timeout = 2;",
          "let target;",
          "// runtime implementation supports: ping [-c count] [-i interval] [-W timeout] host"
        ]),
        run: async ({ args, sys }) => {
          let count = 4;
          let intervalSeconds = 1;
          let timeoutSeconds = 2;
          let payloadSize = 56;
          let quiet = false;
          let target: string | undefined;
          let parsingOptions = true;
  
          const readNumberValue = (flag: string, value: string | undefined): number | null => {
            if (!value) {
              sys.write(`ping: option ${flag} requires an argument`);
              return null;
            }
  
            const parsed = Number.parseFloat(value);
            if (!Number.isFinite(parsed) || parsed < 0) {
              sys.write(`ping: invalid numeric value '${value}'`);
              return null;
            }
            return parsed;
          };
  
          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i];
            if (!arg) {
              continue;
            }
  
            if (parsingOptions && arg === "--") {
              parsingOptions = false;
              continue;
            }
  
            if (parsingOptions && arg.startsWith("--")) {
              if (arg === "--quiet") {
                quiet = true;
                continue;
              }
              if (arg === "--numeric" || arg === "--ipv4" || arg === "--ipv6") {
                continue;
              }
              if (arg === "--count" || arg === "--interval" || arg === "--timeout" || arg === "--size") {
                const parsed = readNumberValue(arg, args[i + 1]);
                if (parsed === null) {
                  return;
                }
                if (arg === "--count") {
                  count = Math.max(1, Math.floor(parsed));
                } else if (arg === "--interval") {
                  intervalSeconds = parsed;
                } else if (arg === "--timeout") {
                  timeoutSeconds = parsed;
                } else {
                  payloadSize = Math.max(0, Math.floor(parsed));
                }
                i += 1;
                continue;
              }
  
              sys.write(`ping: unknown option '${arg}'`);
              return;
            }
  
            if (parsingOptions && arg.startsWith("-") && arg !== "-") {
              if (arg === "-q") {
                quiet = true;
                continue;
              }
              if (arg === "-4" || arg === "-6" || arg === "-n") {
                continue;
              }
  
              if (/^-c\d+$/.test(arg)) {
                count = Math.max(1, Number.parseInt(arg.slice(2), 10));
                continue;
              }
              if (/^-i\d+(\.\d+)?$/.test(arg)) {
                intervalSeconds = Number.parseFloat(arg.slice(2));
                continue;
              }
              if (/^-W\d+(\.\d+)?$/.test(arg)) {
                timeoutSeconds = Number.parseFloat(arg.slice(2));
                continue;
              }
              if (/^-s\d+$/.test(arg)) {
                payloadSize = Math.max(0, Number.parseInt(arg.slice(2), 10));
                continue;
              }
  
              if (arg === "-c" || arg === "-i" || arg === "-W" || arg === "-s") {
                const parsed = readNumberValue(arg, args[i + 1]);
                if (parsed === null) {
                  return;
                }
                if (arg === "-c") {
                  count = Math.max(1, Math.floor(parsed));
                } else if (arg === "-i") {
                  intervalSeconds = parsed;
                } else if (arg === "-W") {
                  timeoutSeconds = parsed;
                } else {
                  payloadSize = Math.max(0, Math.floor(parsed));
                }
                i += 1;
                continue;
              }
  
              for (const flag of arg.slice(1)) {
                if (flag === "q" || flag === "4" || flag === "6" || flag === "n") {
                  if (flag === "q") {
                    quiet = true;
                  }
                  continue;
                }
                sys.write(`ping: invalid option -- '${flag}'`);
                return;
              }
              continue;
            }
  
            if (!target) {
              target = arg;
              continue;
            }
  
            sys.write(`ping: extra operand '${arg}'`);
            return;
          }
  
          if (!target) {
            sys.write("ping: usage error: Destination address required");
            return;
          }
  
          const resolved = sys.helpers.resolvePingTarget(target);
          if ("error" in resolved) {
            sys.write(resolved.error);
            return;
          }
  
          count = sys.helpers.clamp(count, 1, 32);
          const intervalMs = Math.max(0, intervalSeconds * 1000);
          const timeoutMs = Math.max(100, timeoutSeconds * 1000);
  
          if (!quiet) {
            sys.write(
              `PING ${resolved.label} (${resolved.host}) ${payloadSize}(${payloadSize + 28}) bytes of data.`
            );
          }
  
          let transmitted = 0;
          let received = 0;
          let latencySum = 0;
          let latencyMin = Number.POSITIVE_INFINITY;
          let latencyMax = 0;
          const startedAt = performance.now();
  
          for (let seq = 1; seq <= count; seq += 1) {
            transmitted += 1;
            const probe = await sys.helpers.runPingProbe(resolved.url, timeoutMs);
  
            if (probe.ok) {
              received += 1;
              latencySum += probe.latencyMs;
              latencyMin = Math.min(latencyMin, probe.latencyMs);
              latencyMax = Math.max(latencyMax, probe.latencyMs);
              if (!quiet) {
                sys.write(
                  `${payloadSize + 8} bytes from ${resolved.host}: icmp_seq=${seq} ttl=64 time=${probe.latencyMs.toFixed(1)} ms`
                );
              }
            } else if (!quiet) {
              sys.write(`Request timeout for icmp_seq ${seq}`);
            }
  
            if (seq < count) {
              await sys.time.sleep(intervalMs);
            }
          }
  
          const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
          const packetLoss = transmitted === 0 ? 0 : Math.round(((transmitted - received) / transmitted) * 100);
  
          if (!quiet) {
            sys.write("");
          }
          sys.write(`--- ${resolved.label} ping statistics ---`);
          sys.write(
            `${transmitted} packets transmitted, ${received} received, ${packetLoss}% packet loss, time ${elapsedMs}ms`
          );
          if (received > 0) {
            const latencyAvg = latencySum / received;
            sys.write(
              `rtt min/avg/max = ${latencyMin.toFixed(1)}/${latencyAvg.toFixed(1)}/${latencyMax.toFixed(1)} ms`
            );
          }
        }
      });
};
