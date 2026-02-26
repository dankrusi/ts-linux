import type { UnixCommandInstaller } from "../types";

export const installUptime: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "uptime",
        description: "show how long the system has been running",
        source: makeSyscallSource("uptime", ["sys.write('up ...');"]),
        run: ({ args, sys }) => {
          if (args.some((arg) => arg.startsWith("-") && arg !== "-p" && arg !== "--pretty")) {
            sys.write(`uptime: invalid option -- '${args[0] ?? ""}'`);
            return;
          }
  
          const now = sys.now();
          const uptimeSeconds = sys.helpers.shellUptimeSeconds();
          const pretty = sys.helpers.formatDurationCompact(uptimeSeconds);
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
