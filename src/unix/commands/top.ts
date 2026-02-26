import type { UnixCommandInstaller } from "../types";

type TuiContext = any;
type VirtualProcess = any;

export const installTop: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "top",
        description: "display Linux processes",
        run: async ({ args, sys }) => {
          void args;
          await sys.tui.run((ui: TuiContext) => {
            let tick = 0;
            const formatProcTime = (process: VirtualProcess): string => {
              const end = process.endedAt ?? Date.now();
              const seconds = Math.max(0, Math.floor((end - process.startedAt) / 1000));
              const minutes = Math.floor(seconds / 60);
              const secs = seconds % 60;
              return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
            };
  
            const draw = (): void => {
              const uptime = sys.helpers.formatDurationCompact(sys.helpers.shellUptimeSeconds());
              const processes = [...sys.runtime.processes.values()].sort((a, b) => a.pid - b.pid);
              const running = processes.filter((process) => process.state === "R").length;
              const sleeping = processes.filter((process) => process.state === "S").length;
              const stopped = processes.filter((process) => process.state === "T").length;
              const zombie = processes.filter((process) => process.state === "Z").length;
              const load1 = sys.helpers.clamp(0.2 + Math.sin(tick / 8) * 0.15 + Math.random() * 0.05, 0, 4);
              const load5 = sys.helpers.clamp(0.15 + Math.cos(tick / 10) * 0.1 + Math.random() * 0.04, 0, 4);
              const load15 = sys.helpers.clamp(0.1 + Math.sin(tick / 12) * 0.08 + Math.random() * 0.03, 0, 4);
  
              ui.clear(" ");
              ui.box(0, 0, ui.width, ui.height, {
                title: "top",
                border: "single",
                style: { fg: "green" },
                titleStyle: { fg: "yellow", bold: true }
              });
  
              ui.text(2, 1, `${new Date().toTimeString().slice(0, 8)} up ${uptime},  load average: ${load1.toFixed(2)}, ${load5.toFixed(2)}, ${load15.toFixed(2)}`, {
                width: Math.max(1, ui.width - 4),
                ellipsis: true
              });
              ui.text(2, 2, `Tasks: ${processes.length} total, ${running} running, ${sleeping} sleeping, ${stopped} stopped, ${zombie} zombie`, {
                width: Math.max(1, ui.width - 4),
                ellipsis: true
              });
              ui.text(2, 3, "PID    USER      S   %CPU %MEM   TIME COMMAND", {
                width: Math.max(1, ui.width - 4),
                style: { fg: "cyan", bold: true }
              });
  
              const rows = Math.max(1, ui.height - 7);
              const visible = processes.slice(-rows);
              for (let i = 0; i < visible.length; i += 1) {
                const process = visible[i];
                if (!process) {
                  continue;
                }
                const cpu = sys.helpers.clamp((process.pid % 17) * 2 + (tick % 7), 0, 99);
                const mem = sys.helpers.clamp((process.pid % 11) * 1.3 + ((tick + i) % 4), 0, 99);
                const row =
                  `${String(process.pid).padStart(5, " ")}  ${process.user.padEnd(8, " ")} ${process.state} ${cpu.toFixed(1).padStart(6, " ")} ${mem.toFixed(1).padStart(5, " ")} ${formatProcTime(process).padStart(6, " ")} ${process.command}`;
                ui.text(2, 4 + i, row, {
                  width: Math.max(1, ui.width - 4),
                  ellipsis: true,
                  style: process.state === "Z" ? { fg: "gray", dim: true } : undefined
                });
              }
  
              ui.text(2, ui.height - 2, "q to quit", {
                width: Math.max(1, ui.width - 4),
                style: { fg: "yellow", bold: true }
              });
  
              ui.render();
            };
  
            const stop = ui.interval(700, () => {
              tick += 1;
              draw();
            });
  
            ui.onKey((key: any) => {
              if (key.key === "q" || key.key === "Escape") {
                stop();
                ui.exit("top closed");
              }
            });
  
            draw();
          });
        }
      });
};
