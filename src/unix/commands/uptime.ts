import type { UnixCommandInstaller } from "../types";

export const installUptime: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "uptime",
        description: "show how long the system has been running",
        source: makeSyscallSource("uptime", ["sys.write('up ...');"]),
        run: ({ args, sys }) => {
          let prettyOnly = false;
          let since = false;

          for (const arg of args) {
            if (arg === "-p" || arg === "--pretty") {
              prettyOnly = true;
              continue;
            }
            if (arg === "-s" || arg === "--since") {
              since = true;
              continue;
            }
            if (arg.startsWith("-")) {
              sys.write(`uptime: invalid option -- '${arg}'`);
              return;
            }
            sys.write(`uptime: extra operand '${arg}'`);
            return;
          }

          const now = sys.now();
          const uptimeSeconds = sys.helpers.shellUptimeSeconds();
          const pretty = sys.helpers.formatDurationCompact(uptimeSeconds);

          if (since) {
            const bootAt = new Date(now.getTime() - uptimeSeconds * 1000);
            sys.write(bootAt.toISOString().replace("T", " ").slice(0, 19));
            return;
          }

          if (prettyOnly) {
            sys.write(`up ${pretty}`);
            return;
          }

          const usersOnline = 1;
          const base = uptimeSeconds / 300;
          const load1 = sys.helpers.clamp(0.12 + Math.sin(base) * 0.1 + Math.random() * 0.05, 0, 4);
          const load5 = sys.helpers.clamp(0.1 + Math.cos(base / 2) * 0.08 + Math.random() * 0.04, 0, 4);
          const load15 = sys.helpers.clamp(0.08 + Math.sin(base / 3) * 0.06 + Math.random() * 0.03, 0, 4);
          sys.write(
            `${now.toTimeString().slice(0, 8)} up ${pretty},  ${usersOnline} user${usersOnline === 1 ? "" : "s"},  load average: ${load1.toFixed(2)}, ${load5.toFixed(2)}, ${load15.toFixed(2)}`
          );
        }
      });
};
