import type { ProgramDefinition, RegisterExecutableOptions } from "../terminal/shell";
import type { BrowserTerminal } from "../terminal/terminal";
import type { TuiContext } from "../terminal/tui";

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;
const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

const sparkline = (values: number[]): string => {
  return values
    .map((value) => {
      const index = clamp(Math.round(value * (SPARK_CHARS.length - 1)), 0, SPARK_CHARS.length - 1);
      return SPARK_CHARS[index] ?? SPARK_CHARS[0];
    })
    .join("");
};

export const registerCustomApps = (
  terminal: BrowserTerminal,
  options?: RegisterExecutableOptions
): void => {
  const materializeFile = options?.materializeFile ?? true;
  const system = terminal.getSystemConfig();
  const platformName = system.platformName;

  const register = (program: ProgramDefinition): void => {
    terminal.registerProgram({
      ...program,
      showInHelp: false
    }, { materializeFile });
  };
    register({
      name: "countdown",
      description: "animated output demo program",
      run: async ({ args, sys }) => {
        const rawSeconds = Number.parseInt(args[0] ?? "3", 10);
        const seconds = Number.isNaN(rawSeconds) ? 3 : clamp(rawSeconds, 1, 20);

        sys.console.write(`starting countdown from ${seconds}`);
        for (let i = seconds; i > 0; i -= 1) {
          sys.console.write(`  ${i}...`);
          await sys.time.sleep(350);
        }
        sys.console.write("launch complete");
      }
    });

    register({
      name: "demo-ui",
      description: "blessed-style dashboard demo (q to quit)",
      run: async ({ args, sys }) => {
        void args;
        await sys.tui.run((ui: TuiContext) => {
          let ticks = 0;
          let selected = 0;
          const tabs = ["overview", "logs", "network"];
          const logLines: string[] = [
            "boot complete",
            "services online",
            "user shell ready",
            "theme engine: blessed-ish"
          ];
          const cpuHistory = Array.from({ length: 28 }, (_, i) => 0.48 + Math.sin(i / 5) * 0.15);
          const latencyHistory = Array.from({ length: 28 }, (_, i) => 0.4 + Math.cos(i / 4) * 0.12);

          const pushHistory = (history: number[], value: number): void => {
            history.push(clamp(value, 0, 1));
            if (history.length > 28) {
              history.shift();
            }
          };

          const pushLog = (line: string): void => {
            logLines.push(line);
            if (logLines.length > 120) {
              logLines.shift();
            }
          };

          const draw = (): void => {
            const spinner = SPINNER_FRAMES[ticks % SPINNER_FRAMES.length] ?? "|";
            const cpu = (Math.sin(ticks / 4.2) + 1) / 2;
            const mem = (Math.cos(ticks / 6.3 + 0.8) + 1) / 2;
            const net = (Math.sin(ticks / 8.7 + 1.2) + 1) / 2;

            const leftWidth = clamp(Math.floor(ui.width * 0.58), 18, Math.max(18, ui.width - 18));
            const rightX = leftWidth + 3;
            const rightWidth = Math.max(12, ui.width - rightX - 2);
            const statusHeight = clamp(Math.floor(ui.height * 0.34), 8, 11);
            const metersY = statusHeight + 3;
            const metersHeight = Math.max(6, ui.height - metersY - 2);

            ui.clear(" ", { fg: "default" });
            ui.box(0, 0, ui.width, ui.height, {
              title: `${platformName} dashboard ${spinner}`,
              border: "double",
              style: { fg: "cyan" },
              titleStyle: { fg: "green", bold: true }
            });

            ui.window({
              x: 2,
              y: 2,
              width: leftWidth,
              height: ui.height - 4,
              title: "activity feed",
              border: "rounded",
              style: { fg: "blue" },
              titleStyle: { fg: "magenta", bold: true },
              lineStyle: { fg: "white" },
              lines: logLines.slice(-Math.max(1, ui.height - 6))
            });

            ui.window({
              x: rightX,
              y: 2,
              width: rightWidth,
              height: statusHeight,
              title: "status",
              border: "heavy",
              style: { fg: "magenta" },
              titleStyle: { fg: "yellow", bold: true },
              lineStyle: { fg: "white" },
              lines: [
                `mode: ${tabs[selected]}`,
                `uptime ticks: ${ticks}`,
                `spinner: ${spinner}`,
                "",
                "controls: \u2190/\u2192 switch tab, q quit"
              ]
            });

            let tabX = rightX + 2;
            const tabY = 6;
            for (let i = 0; i < tabs.length; i += 1) {
              const active = i === selected;
              const label = active ? `[${tabs[i]?.toUpperCase() ?? ""}]` : ` ${tabs[i]} `;
              ui.write(tabX, tabY, label, {
                fg: active ? "black" : "cyan",
                bg: active ? "green" : "default",
                bold: active
              });
              tabX += label.length + 1;
            }

            ui.window({
              x: rightX,
              y: metersY,
              width: rightWidth,
              height: metersHeight,
              title: "live meters",
              border: "rounded",
              style: { fg: "cyan" },
              titleStyle: { fg: "green", bold: true },
              lineStyle: { fg: "gray", dim: true },
              lines: ["cpu", "memory", "network", "latency", "", "cpu trend", "latency trend"]
            });

            const meterX = rightX + 5;
            const meterWidth = Math.max(5, rightWidth - 11);
            ui.progress(meterX, metersY + 2, meterWidth, cpu, `${Math.round(cpu * 100)}%`, {
              style: { fg: "green", bold: true },
              emptyStyle: { fg: "gray", dim: true },
              labelStyle: { fg: "green", bold: true },
              charset: "blocks"
            });
            ui.progress(meterX, metersY + 3, meterWidth, mem, `${Math.round(mem * 100)}%`, {
              style: { fg: "yellow", bold: true },
              emptyStyle: { fg: "gray", dim: true },
              labelStyle: { fg: "yellow", bold: true },
              charset: "blocks"
            });
            ui.progress(meterX, metersY + 4, meterWidth, net, `${Math.round(net * 100)}%`, {
              style: { fg: "cyan", bold: true },
              emptyStyle: { fg: "gray", dim: true },
              labelStyle: { fg: "cyan", bold: true },
              charset: "blocks"
            });

            const latency = (Math.cos(ticks / 3.9 + 2.2) + 1) / 2;
            ui.progress(meterX, metersY + 5, meterWidth, latency, `${Math.round(12 + latency * 90)}ms`, {
              style: { fg: "magenta", bold: true },
              emptyStyle: { fg: "gray", dim: true },
              labelStyle: { fg: "magenta", bold: true },
              charset: "ascii"
            });

            ui.write(rightX + 2, metersY + 7, sparkline(cpuHistory), { fg: "cyan", bold: true });
            ui.write(rightX + 2, metersY + 8, sparkline(latencyHistory), { fg: "magenta" });

            ui.write(3, ui.height - 2, "demo-ui: \u2190/\u2192 switch tab  q or Esc exit", {
              fg: "yellow",
              bold: true
            });
            ui.render();
          };

          const stop = ui.interval(180, () => {
            ticks += 1;
            if (ticks % 4 === 0) {
              const spinner = SPINNER_FRAMES[ticks % SPINNER_FRAMES.length] ?? "|";
              pushLog(`[${spinner}] tick ${ticks}: scheduler heartbeat ok`);
            }
            pushHistory(cpuHistory, (Math.sin(ticks / 4.2) + 1) / 2);
            pushHistory(latencyHistory, (Math.cos(ticks / 3.9 + 2.2) + 1) / 2);
            draw();
          });

          ui.onKey((key) => {
            if (key.key === "q" || key.key === "Escape") {
              stop();
              ui.exit("demo-ui closed");
              return;
            }

            if (key.key === "ArrowRight") {
              selected = (selected + 1) % tabs.length;
              draw();
            }

            if (key.key === "ArrowLeft") {
              selected = (selected - 1 + tabs.length) % tabs.length;
              draw();
            }
          });

          draw();
        });
      }
    });

    register({
      name: "sysmon",
      description: "blessed-style system monitor (q to quit)",
      run: async ({ args, sys }) => {
        void args;
        await sys.tui.run((ui: TuiContext) => {
          let ticks = 0;
          let cpu = 0.44;
          let mem = 0.61;
          let disk = 0.38;
          let net = 0.27;
          const cpuHistory = Array.from({ length: 32 }, (_, i) => 0.45 + Math.sin(i / 4) * 0.15);
          const netHistory = Array.from({ length: 32 }, (_, i) => 0.35 + Math.cos(i / 4) * 0.2);
          const procCpu = [0.12, 0.08, 0.22, 0.05];
          const procMem = [0.04, 0.02, 0.11, 0.03];
          const procNames = ["kernel_task", "renderd", "net-agent", "scheduler"];

          const drift = (value: number, span: number): number => {
            return clamp(value + (Math.random() - 0.5) * span, 0.04, 0.98);
          };

          const pushHistory = (history: number[], value: number): void => {
            history.push(clamp(value, 0, 1));
            if (history.length > 32) {
              history.shift();
            }
          };

          const draw = (): void => {
            const spinner = SPINNER_FRAMES[ticks % SPINNER_FRAMES.length] ?? "|";
            const leftWidth = clamp(Math.floor(ui.width * 0.54), 20, Math.max(20, ui.width - 18));
            const rightX = leftWidth + 3;
            const rightWidth = Math.max(12, ui.width - rightX - 2);
            const metricsY = 11;
            const metricsHeight = Math.max(6, ui.height - metricsY - 2);

            ui.clear(" ");
            ui.box(0, 0, ui.width, ui.height, {
              title: `sysmon ${spinner}`,
              border: "heavy",
              style: { fg: "magenta" },
              titleStyle: { fg: "yellow", bold: true }
            });

            ui.window({
              x: 2,
              y: 2,
              width: leftWidth,
              height: 7,
              title: "host",
              border: "rounded",
              style: { fg: "blue" },
              titleStyle: { fg: "cyan", bold: true },
              lineStyle: { fg: "white" },
              lines: [
                `kernel: ${system.kernelName} ${system.kernelRelease}`,
                "session: browser tty1",
                `load avg: ${(cpu * 1.2).toFixed(2)} ${(mem * 0.9).toFixed(2)} ${(disk * 1.1).toFixed(2)}`,
                `network i/o: ${(net * 280).toFixed(0)}KB/s`
              ]
            });

            ui.window({
              x: rightX,
              y: 2,
              width: rightWidth,
              height: 7,
              title: "processes",
              border: "rounded",
              style: { fg: "green" },
              titleStyle: { fg: "yellow", bold: true },
              lineStyle: { fg: "white" },
              lines: procNames.map((name, index) => {
                const cpuPct = `${(procCpu[index] * 100).toFixed(1).padStart(5)}%`;
                const memPct = `${(procMem[index] * 100).toFixed(1).padStart(4)}%`;
                return `${name.padEnd(10)} ${cpuPct} ${memPct}`;
              })
            });

            ui.window({
              x: 2,
              y: metricsY,
              width: ui.width - 4,
              height: metricsHeight,
              title: "resources",
              border: "double",
              style: { fg: "cyan" },
              titleStyle: { fg: "green", bold: true },
              lineStyle: { fg: "gray", dim: true },
              lines: ["cpu", "memory", "disk", "network", "", "cpu history", "net history"]
            });

            const barX = 6;
            const barWidth = Math.max(6, ui.width - 18);
            ui.progress(barX, metricsY + 2, barWidth, cpu, `${Math.round(cpu * 100)}%`, {
              style: { fg: "green", bold: true },
              emptyStyle: { fg: "gray", dim: true },
              labelStyle: { fg: "green", bold: true },
              charset: "blocks"
            });
            ui.progress(barX, metricsY + 3, barWidth, mem, `${Math.round(mem * 100)}%`, {
              style: { fg: "yellow", bold: true },
              emptyStyle: { fg: "gray", dim: true },
              labelStyle: { fg: "yellow", bold: true },
              charset: "blocks"
            });
            ui.progress(barX, metricsY + 4, barWidth, disk, `${Math.round(disk * 100)}%`, {
              style: { fg: "magenta", bold: true },
              emptyStyle: { fg: "gray", dim: true },
              labelStyle: { fg: "magenta", bold: true },
              charset: "blocks"
            });
            ui.progress(barX, metricsY + 5, barWidth, net, `${Math.round(net * 100)}%`, {
              style: { fg: "cyan", bold: true },
              emptyStyle: { fg: "gray", dim: true },
              labelStyle: { fg: "cyan", bold: true },
              charset: "ascii"
            });

            ui.write(4, metricsY + 7, sparkline(cpuHistory), { fg: "cyan", bold: true });
            ui.write(4, metricsY + 8, sparkline(netHistory), { fg: "blue" });
            ui.write(3, ui.height - 2, "sysmon: q or Esc exit", { fg: "yellow", bold: true });

            ui.render();
          };

          const stop = ui.interval(220, () => {
            ticks += 1;
            cpu = drift(cpu, 0.13);
            mem = drift(mem, 0.1);
            disk = drift(disk, 0.08);
            net = drift(net, 0.2);

            for (let i = 0; i < procCpu.length; i += 1) {
              procCpu[i] = drift(procCpu[i] ?? 0.1, 0.08);
              procMem[i] = drift(procMem[i] ?? 0.03, 0.03);
            }

            pushHistory(cpuHistory, cpu);
            pushHistory(netHistory, net);
            draw();
          });

          ui.onKey((key) => {
            if (key.key === "q" || key.key === "Escape") {
              stop();
              ui.exit("sysmon closed");
            }
          });

          draw();
        });
      }
    });

    register({
      name: "ui-lab",
      description: "extended tui widget lab (q to quit)",
      run: async ({ args, sys }) => {
        void args;
        await sys.tui.run((ui: TuiContext) => {
          let tick = 0;
          let selectedSection = 0;
          let selectedService = 0;
          let banner = "new widgets: fillRect line text list table sparkline";

          const sections = [
            "overview",
            "deployments",
            "runtime",
            "jobs",
            "storage",
            "network",
            "alerts"
          ];

          const services: Array<{ name: string; status: string; latency: number; uptime: number }> = [
            { name: "gateway", status: "online", latency: 16, uptime: 99.99 },
            { name: "renderer", status: "online", latency: 23, uptime: 99.93 },
            { name: "queue", status: "degraded", latency: 84, uptime: 98.7 },
            { name: "cache", status: "online", latency: 8, uptime: 99.97 },
            { name: "search", status: "online", latency: 31, uptime: 99.62 },
            { name: "metrics", status: "online", latency: 19, uptime: 99.9 }
          ];

          const throughputHistory = Array.from(
            { length: 72 },
            (_, i) => 0.5 + Math.sin(i / 7.4) * 0.28
          );
          const errorHistory = Array.from(
            { length: 72 },
            (_, i) => 0.08 + Math.max(0, Math.cos(i / 9.5) * 0.16)
          );

          const draw = (): void => {
            const spinner = SPINNER_FRAMES[tick % SPINNER_FRAMES.length] ?? "|";
            const leftWidth = clamp(Math.floor(ui.width * 0.28), 18, 26);
            const rightX = leftWidth + 3;
            const rightWidth = Math.max(10, ui.width - rightX - 2);
            const tableY = 11;
            const tableHeight = Math.max(7, ui.height - 17);
            const chartY = tableY + tableHeight + 1;
            const chartHeight = Math.max(4, ui.height - chartY - 1);
            const selected = services[selectedService] ?? services[0];

            if (!selected) {
              return;
            }

            const health = clamp(1 - selected.latency / 220, 0.05, 0.99);
            const load = clamp(0.36 + Math.sin(tick / 6 + selectedSection / 2) * 0.24, 0.04, 0.98);

            ui.clear(" ");
            ui.fillRect(0, 0, ui.width, 1, " ", { bg: "blue" });
            ui.text(1, 0, ` ${platformName} ui-lab ${spinner} `, {
              style: { fg: "white", bg: "blue", bold: true }
            });
            ui.text(Math.max(1, ui.width - 33), 0, "↑↓ section  j/k service  q exit", {
              style: { fg: "cyan", bg: "blue" }
            });

            ui.box(0, 1, ui.width, ui.height - 1, {
              title: "widget playground",
              border: "double",
              style: { fg: "cyan" },
              titleStyle: { fg: "green", bold: true }
            });

            ui.line(rightX - 1, 2, rightX - 1, ui.height - 2, "│", { fg: "gray", dim: true });

            ui.list({
              x: 2,
              y: 3,
              width: leftWidth,
              height: ui.height - 5,
              title: "sections",
              border: "rounded",
              style: { fg: "blue" },
              titleStyle: { fg: "yellow", bold: true },
              items: sections,
              selectedIndex: selectedSection,
              marker: "▸",
              itemStyle: { fg: "white" },
              selectedStyle: { fg: "black", bg: "green", bold: true }
            });

            ui.window({
              x: rightX,
              y: 3,
              width: rightWidth,
              height: 7,
              title: "section status",
              border: "rounded",
              style: { fg: "magenta" },
              titleStyle: { fg: "yellow", bold: true }
            });

            ui.text(rightX + 2, 5, `active section: ${sections[selectedSection] ?? "unknown"}`, {
              width: rightWidth - 4,
              style: { fg: "white" }
            });
            ui.progress(rightX + 2, 6, rightWidth - 10, load, `${Math.round(load * 100)}%`, {
              style: { fg: "cyan", bold: true },
              emptyStyle: { fg: "gray", dim: true },
              labelStyle: { fg: "cyan", bold: true },
              charset: "blocks"
            });
            ui.progress(rightX + 2, 7, rightWidth - 10, health, `${Math.round(health * 100)}%`, {
              style: { fg: "green", bold: true },
              emptyStyle: { fg: "gray", dim: true },
              labelStyle: { fg: "green", bold: true },
              charset: "ascii"
            });

            ui.table({
              x: rightX,
              y: tableY,
              width: rightWidth,
              height: tableHeight,
              title: "services",
              border: "heavy",
              style: { fg: "cyan" },
              titleStyle: { fg: "green", bold: true },
              headerStyle: { fg: "yellow", bold: true },
              columns: [
                { title: "service", width: 13 },
                { title: "status", width: 9 },
                { title: "lat(ms)", width: 8, align: "right" },
                { title: "uptime", width: 8, align: "right" }
              ],
              rows: services.map((service) => [
                service.name,
                service.status,
                service.latency.toFixed(0),
                `${service.uptime.toFixed(2)}%`
              ]),
              selectedRow: selectedService,
              rowStyle: { fg: "white" },
              selectedStyle: { fg: "black", bg: "cyan", bold: true },
              zebra: true
            });

            ui.window({
              x: rightX,
              y: chartY,
              width: rightWidth,
              height: chartHeight,
              title: "history",
              border: "rounded",
              style: { fg: "blue" },
              titleStyle: { fg: "magenta", bold: true },
              lines: ["throughput", "errors"]
            });

            if (chartHeight >= 4) {
              ui.sparkline(rightX + 3, chartY + 2, rightWidth - 6, throughputHistory, {
                style: { fg: "cyan", bold: true },
                charset: "bars",
                min: 0,
                max: 1
              });
              ui.sparkline(rightX + 3, chartY + 3, rightWidth - 6, errorHistory, {
                style: { fg: "magenta" },
                charset: "ascii",
                min: 0,
                max: 1
              });
            }

            ui.text(3, ui.height - 2, banner, {
              width: ui.width - 6,
              style: { fg: "yellow", bold: true },
              ellipsis: true
            });

            ui.render();
          };

          const hideBanner = ui.timeout(3500, () => {
            banner = "";
            draw();
          });

          const stop = ui.interval(220, () => {
            tick += 1;

            for (let i = 0; i < services.length; i += 1) {
              const service = services[i];
              if (!service) {
                continue;
              }

              service.latency = clamp(service.latency + (Math.random() - 0.5) * 8, 4, 180);

              if (Math.random() < 0.02) {
                service.status = service.status === "online" ? "degraded" : "online";
              }

              service.uptime = clamp(service.uptime + (Math.random() - 0.49) * 0.03, 97.5, 99.999);
            }

            const throughput = clamp(0.5 + Math.sin(tick / 8) * 0.24 + (Math.random() - 0.5) * 0.08, 0, 1);
            const errors = clamp(0.08 + Math.max(0, Math.cos(tick / 10) * 0.15) + Math.random() * 0.03, 0, 1);

            throughputHistory.push(throughput);
            errorHistory.push(errors);
            if (throughputHistory.length > 72) {
              throughputHistory.shift();
            }
            if (errorHistory.length > 72) {
              errorHistory.shift();
            }

            draw();
          });

          ui.onKey((key) => {
            if (key.key === "q" || key.key === "Escape") {
              hideBanner();
              stop();
              ui.exit("ui-lab closed");
              return;
            }

            if (key.key === "ArrowUp") {
              selectedSection = (selectedSection - 1 + sections.length) % sections.length;
              draw();
              return;
            }

            if (key.key === "ArrowDown") {
              selectedSection = (selectedSection + 1) % sections.length;
              draw();
              return;
            }

            if (key.key === "j" || key.key === "ArrowRight") {
              selectedService = (selectedService + 1) % services.length;
              draw();
              return;
            }

            if (key.key === "k" || key.key === "ArrowLeft") {
              selectedService = (selectedService - 1 + services.length) % services.length;
              draw();
            }
          });

          draw();
        });
      }
    });
};
