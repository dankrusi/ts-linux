import "./styles.css";
import { BrowserTerminal } from "./terminal/terminal";
import { registerCustomApps } from "./apps";

const systemConfig = {
  distributionName: "Ubuntu",
  distributionVersion: "24.04 LTS",
  platformName: "Ubuntu",
  platformVersion: "24.04",
  hostName: "ubuntu",
  kernelName: "Linux",
  kernelRelease: "3.48",
  kernelVersion: "#1 SMP PREEMPT",
  machine: "x86_64",
  operatingSystem: "GNU/Linux",
  shellPath: "/bin/bash",
  initPath: "/sbin/init"
} as const;

const parseStartupCommandFromHash = (hash: string): string | null => {
  if (!hash || hash === "#") {
    return null;
  }

  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  if (fragment.trim().length === 0) {
    return null;
  }

  try {
    return decodeURIComponent(fragment).trim();
  } catch {
    return fragment.trim();
  }
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("#app mount not found");
}

app.innerHTML = `
  <section class="terminal-mount" id="terminal-mount"></section>
`;

const mount = document.querySelector<HTMLElement>("#terminal-mount");

if (!mount) {
  throw new Error("terminal mount not found");
}

const url = new URL(window.location.href);
const shouldResetFilesystem = url.searchParams.has("reset");
const startupCommand = parseStartupCommandFromHash(url.hash);
if (shouldResetFilesystem) {
  url.searchParams.delete("reset");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

const terminal = new BrowserTerminal(mount, {
  resetFilesystem: shouldResetFilesystem,
  system: systemConfig
});
const shouldSeedHostDefaults = terminal.shouldSeedHostDefaults();

if (shouldSeedHostDefaults) {
  terminal.addDirectory("/opt/tools");
  terminal.addFile(
    "/home/guest/notes.txt",
    ["# notes", "- virtual fs is central", "- executables live in /bin style paths"].join("\n")
  );
}

terminal.registerExecutable({
  name: "hello",
  path: "/usr/local/bin/hello",
  description: "example custom command",
  source: [
    "#!/usr/bin/env jlinux",
    "// hello executable",
    "export default async function main(ctx) {",
    "  ctx.sys.console.write('hello from source file');",
    "}"
  ].join("\n"),
  run: async ({ args, sys }) => {
    const name = args[0] ?? "developer";
    sys.console.write(`initializing custom command for ${name}...`);
    await sys.time.sleep(250);
    sys.console.write("hello from a dynamically registered program");
  }
}, { materializeFile: shouldSeedHostDefaults });

registerCustomApps(terminal, { materializeFile: shouldSeedHostDefaults });
terminal.loadExecutablesIntoVfs();

const boot = async (): Promise<void> => {
  await terminal.boot();
  if (startupCommand) {
    await terminal.runCommand(startupCommand);
  }
};

void boot();
