import type { UnixCommandInstaller } from "../types";

export const installDate: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "date",
        description: "print current date/time",
        source: makeSyscallSource("date", ["// runtime supports: date [-u] [+FORMAT] [-R]"]),
        run: ({ args, sys }) => {
          const pad2 = (value: number): string => String(value).padStart(2, "0");
          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          let useUtc = false;
          let rfc2822 = false;
          let format: string | null = null;

          for (const arg of args) {
            if (arg === "-u" || arg === "--utc" || arg === "--universal") {
              useUtc = true;
              continue;
            }
            if (arg === "-R" || arg === "--rfc-email") {
              rfc2822 = true;
              continue;
            }
            if (arg.startsWith("+")) {
              if (format !== null) {
                sys.write("date: multiple output formats specified");
                return;
              }
              format = arg.slice(1);
              continue;
            }
            if (arg.startsWith("-")) {
              sys.write(`date: invalid option -- '${arg}'`);
              return;
            }
            sys.write(`date: extra operand '${arg}'`);
            return;
          }

          const now = sys.now();
          if (rfc2822) {
            const year = useUtc ? now.getUTCFullYear() : now.getFullYear();
            const monthIndex = useUtc ? now.getUTCMonth() : now.getMonth();
            const day = useUtc ? now.getUTCDate() : now.getDate();
            const weekday = useUtc ? now.getUTCDay() : now.getDay();
            const hour = useUtc ? now.getUTCHours() : now.getHours();
            const minute = useUtc ? now.getUTCMinutes() : now.getMinutes();
            const second = useUtc ? now.getUTCSeconds() : now.getSeconds();
            const timezoneOffsetMinutes = -now.getTimezoneOffset();
            const tzSign = timezoneOffsetMinutes >= 0 ? "+" : "-";
            const tzHours = Math.floor(Math.abs(timezoneOffsetMinutes) / 60);
            const tzMinutes = Math.abs(timezoneOffsetMinutes) % 60;
            const timezoneNum = `${tzSign}${pad2(tzHours)}${pad2(tzMinutes)}`;
            sys.write(
              `${dayNames[weekday] ?? "Sun"}, ${pad2(day)} ${monthNames[monthIndex] ?? "Jan"} ${year} ${pad2(hour)}:${pad2(minute)}:${pad2(second)} ${useUtc ? "+0000" : timezoneNum}`
            );
            return;
          }

          if (format !== null) {
            const year = useUtc ? now.getUTCFullYear() : now.getFullYear();
            const monthIndex = useUtc ? now.getUTCMonth() : now.getMonth();
            const month = monthIndex + 1;
            const day = useUtc ? now.getUTCDate() : now.getDate();
            const weekday = useUtc ? now.getUTCDay() : now.getDay();
            const hour = useUtc ? now.getUTCHours() : now.getHours();
            const minute = useUtc ? now.getUTCMinutes() : now.getMinutes();
            const second = useUtc ? now.getUTCSeconds() : now.getSeconds();
            const timezoneOffsetMinutes = -now.getTimezoneOffset();
            const tzSign = timezoneOffsetMinutes >= 0 ? "+" : "-";
            const tzHours = Math.floor(Math.abs(timezoneOffsetMinutes) / 60);
            const tzMinutes = Math.abs(timezoneOffsetMinutes) % 60;
            const timezoneNum = `${tzSign}${pad2(tzHours)}${pad2(tzMinutes)}`;
            const timezoneName = useUtc ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local";

            const replacements: Record<string, string> = {
              "%Y": String(year),
              "%m": pad2(month),
              "%d": pad2(day),
              "%e": String(day).padStart(2, " "),
              "%H": pad2(hour),
              "%M": pad2(minute),
              "%S": pad2(second),
              "%a": dayNames[weekday] ?? "",
              "%b": monthNames[monthIndex] ?? "",
              "%F": `${year}-${pad2(month)}-${pad2(day)}`,
              "%T": `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`,
              "%z": useUtc ? "+0000" : timezoneNum,
              "%Z": timezoneName,
              "%%": "%"
            };

            const rendered = format.replace(/%[YmdHeMSabFTzZ%]/g, (token) => {
              return replacements[token] ?? token;
            });
            sys.write(rendered);
            return;
          }

          if (useUtc) {
            sys.write(now.toUTCString());
            return;
          }

          sys.console.write(now.toString());
        }
      });
};
