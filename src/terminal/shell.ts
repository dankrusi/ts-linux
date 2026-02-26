import { FrameBuffer, TuiContext, TuiProgram } from "./tui";
import { FsResult, VNode, VirtualFS, VirtualFSState } from "./virtualFs";
import { installUnixTools } from "../unix";

const HOME_PATH = "/home/guest";
const ROOT_UID = 0;
const GUEST_UID = 1000;
const GUEST_GID = 1000;
const OPERATOR_UID = 1001;
const OPERATOR_GID = 1001;
const SHELL_STORAGE_KEY = "jlinux:shell-state:v1";
const SHELL_STATE_VERSION = 1;
const DEFAULT_EXECUTABLE_SHEBANG = "#!/usr/bin/env jlinux";
const RUNTIME_SOURCE_MARKER = "// @generated-by:jlinux-runtime";

const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const HELPER_SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;
const HELPER_SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

const helperSparkline = (values: number[]): string => {
  return values
    .map((value) => {
      const index = clamp(
        Math.round(value * (HELPER_SPARK_CHARS.length - 1)),
        0,
        HELPER_SPARK_CHARS.length - 1
      );
      return HELPER_SPARK_CHARS[index] ?? HELPER_SPARK_CHARS[0];
    })
    .join("");
};

const makeSyscallSource = (name: string, bodyLines: string[]): string => {
  return [
    DEFAULT_EXECUTABLE_SHEBANG,
    `// /bin/${name}`,
    "export default async function main(ctx) {",
    "  const { sys, args, stdin } = ctx;",
    ...bodyLines.map((line) => `  ${line}`),
    "}"
  ].join("\n");
};

const joinPath = (base: string, name: string): string => {
  if (base === "/") {
    return `/${name}`;
  }
  return `${base}/${name}`;
};

const basename = (path: string): string => {
  if (path === "/") {
    return "/";
  }

  const normalized = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
};

const formatPermissionBits = (
  node: Pick<VNode, "kind"> & { executable?: boolean; mode?: number }
): string => {
  if (node.mode === undefined) {
    if (node.kind === "dir") {
      return "drwxr-xr-x";
    }
    return node.executable ? "-rwxr-xr-x" : "-rw-r--r--";
  }

  const mode = node.mode & 0o777;
  const prefix = node.kind === "dir" ? "d" : "-";
  const bit = (mask: number, char: string): string => ((mode & mask) !== 0 ? char : "-");
  return [
    prefix,
    bit(0o400, "r"),
    bit(0o200, "w"),
    bit(0o100, "x"),
    bit(0o040, "r"),
    bit(0o020, "w"),
    bit(0o010, "x"),
    bit(0o004, "r"),
    bit(0o002, "w"),
    bit(0o001, "x")
  ].join("");
};

const formatByteSize = (bytes: number, humanReadable: boolean): string => {
  if (!humanReadable) {
    return String(bytes);
  }

  const units = ["B", "K", "M", "G", "T"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${value}${units[unitIndex] ?? "B"}`;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)}${units[unitIndex] ?? "B"}`;
};

const formatLsLongLine = (
  name: string,
  node: Pick<VNode, "kind"> & { executable?: boolean; mode?: number },
  sizeBytes: number,
  owner: string,
  humanReadable: boolean
): string => {
  const mode = formatPermissionBits(node);
  const size = formatByteSize(sizeBytes, humanReadable);
  return `${mode} 1 ${owner} ${owner} ${size.padStart(7)} ${name}`;
};

const classifyLsName = (
  name: string,
  node: Pick<VNode, "kind"> & { executable?: boolean },
  classify: boolean
): string => {
  if (!classify) {
    return name;
  }
  if (node.kind === "dir") {
    return `${name}/`;
  }
  if (node.executable) {
    return `${name}*`;
  }
  return name;
};

const ANSI_RESET = "\u001B[0m";
const ANSI_BOLD_BLUE = "\u001B[1;34m";
const ANSI_BOLD_GREEN = "\u001B[1;32m";
const ANSI_BOLD_CYAN = "\u001B[1;36m";
const ANSI_BOLD_YELLOW = "\u001B[1;33m";
const ANSI_DIM_RED = "\u001B[2;31m";

const colorizeLsName = (
  name: string,
  node: Pick<VNode, "kind"> & { executable?: boolean },
  classify: boolean,
  colorize: boolean
): string => {
  const decorated = classifyLsName(name, node, classify);
  if (!colorize) {
    return decorated;
  }
  if (node.kind === "dir") {
    return `${ANSI_BOLD_BLUE}${decorated}${ANSI_RESET}`;
  }
  if (node.executable) {
    return `${ANSI_BOLD_GREEN}${decorated}${ANSI_RESET}`;
  }
  return decorated;
};

const parseEchoEscapes = (input: string): string => {
  return input
    .replace(/\\a/g, "\x07")
    .replace(/\\b/g, "\b")
    .replace(/\\e/g, "\x1B")
    .replace(/\\f/g, "\f")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\v/g, "\v")
    .replace(/\\\\/g, "\\");
};

const PASSWORD_HASH_VERSION = "twx2";
const textEncoder = new TextEncoder();

const decodePepper = (encoded: number[]): string => {
  return encoded
    .map((value, index) => {
      return String.fromCharCode(value ^ ((index * 41 + 73) & 0xff));
    })
    .join("");
};

const PEPPER_A = decodePepper([
  61, 5, 238, 173, 192, 102, 87, 9, 226, 223, 206, 109, 89, 46, 239, 209, 244, 116, 25
]);
const PEPPER_B = decodePepper([
  61, 5, 238, 173, 192, 102, 87, 9, 226, 223, 206, 110, 80, 42, 230, 157, 175, 48
]);
const PEPPER_C = decodePepper([
  61, 5, 238, 173, 192, 102, 87, 9, 226, 223, 206, 107, 84, 51, 234, 209, 244, 116, 25
]);

interface VirtualUser {
  username: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
  passwordHash: string;
  sudo: boolean;
}

const VIRTUAL_USER_SEED: VirtualUser[] = [
  {
    username: "root",
    uid: 0,
    gid: 0,
    home: "/root",
    shell: "/bin/bash",
    passwordHash:
      "twx2$50f2a4c71e3d9984a4f95d4bc38af6f0$b8376ffdb6a22dd564716785a6a679c4e56103139c7aa84169fdf615482ea92c",
    sudo: true
  },
  {
    username: "guest",
    uid: 1000,
    gid: 1000,
    home: "/home/guest",
    shell: "/bin/bash",
    passwordHash:
      "twx2$8c2da3187f09b642a68d11f5937ce2a1$7da4b27b7265869cfbd4fb888599c4bda7690628c9cce06f625c2a250176a208",
    sudo: true
  },
  {
    username: "operator",
    uid: 1001,
    gid: 1001,
    home: "/home/operator",
    shell: "/bin/bash",
    passwordHash:
      "twx2$6ab91a7e2f4c8ad0913f75347f2ae6c2$bfb0510ef648d23c5d893fe9a620016df267f5236b007b8c10d7240ea8c20e65",
    sudo: false
  }
];

const toHex = (bytes: Uint8Array): string => {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
};

const fromHex = (value: string): Uint8Array => {
  if (!/^[\da-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error("invalid hex");
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) {
    bytes[i / 2] = Number.parseInt(value.slice(i, i + 2), 16);
  }
  return bytes;
};

const joinBytes = (...chunks: Uint8Array[]): Uint8Array => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  return new Uint8Array(bytes).buffer;
};

const rotateLeft8 = (value: number, amount: number): number => {
  const shift = amount % 8;
  return ((value << shift) | (value >> (8 - shift))) & 0xff;
};

const shaDigest = async (algorithm: "SHA-256" | "SHA-512", payload: Uint8Array): Promise<Uint8Array> => {
  const buffer = await crypto.subtle.digest(algorithm, asArrayBuffer(payload));
  return new Uint8Array(buffer);
};

const mixPhase = (input: Uint8Array, reference: Uint8Array, salt: Uint8Array): Uint8Array => {
  const mixed = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const left = input[i] ?? 0;
    const right = reference[i % reference.length] ?? 0;
    const saltByte = salt[(i * 7) % salt.length] ?? 0;
    const spun = rotateLeft8((left ^ right ^ saltByte ^ ((i * 17 + 31) & 0xff)) & 0xff, (i % 7) + 1);
    mixed[i] = spun;
  }
  return mixed;
};

const timingSafeEqual = (left: string, right: string): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
};

const hashVirtualPasswordWithSalt = async (password: string, saltHex: string): Promise<string> => {
  const salt = fromHex(saltHex.toLowerCase());
  const normalized = password.normalize("NFKC");
  const passwordBytes = textEncoder.encode(normalized);

  const phaseA = await shaDigest(
    "SHA-256",
    joinBytes(textEncoder.encode(PEPPER_A), salt, passwordBytes, textEncoder.encode(String(passwordBytes.length)))
  );

  const phaseBSeed = await shaDigest(
    "SHA-512",
    joinBytes(textEncoder.encode(PEPPER_B), phaseA, salt, passwordBytes)
  );
  const phaseB = mixPhase(phaseBSeed, phaseA, salt);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    asArrayBuffer(joinBytes(phaseB.slice(0, 48), passwordBytes, salt)),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const iterations = 75000 + (salt[0] ?? 0) * 97 + (salt[1] ?? 0) * 53;
  const pbkdfBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asArrayBuffer(joinBytes(salt, phaseA.slice(0, 8), phaseB.slice(0, 8))),
      iterations
    },
    keyMaterial,
    256
  );
  const phaseC = new Uint8Array(pbkdfBits);

  const braid = new Uint8Array(96);
  for (let i = 0; i < braid.length; i += 1) {
    const a = phaseA[i % phaseA.length] ?? 0;
    const b = phaseB[i % phaseB.length] ?? 0;
    const c = phaseC[i % phaseC.length] ?? 0;
    const d = salt[i % salt.length] ?? 0;
    const value = a ^ b ^ c ^ d ^ ((i * 29 + 19) & 0xff);
    braid[i] = rotateLeft8(value & 0xff, (i % 5) + 1);
  }

  const digest = await shaDigest(
    "SHA-256",
    joinBytes(textEncoder.encode(PEPPER_C), braid, phaseC, salt, phaseA.slice(0, 16))
  );

  return `${PASSWORD_HASH_VERSION}$${saltHex.toLowerCase()}$${toHex(digest)}`;
};

const verifyVirtualPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const parsed = storedHash.match(/^([a-z0-9]+)\$([a-f0-9]+)\$([a-f0-9]+)$/i);
  if (!parsed) {
    return false;
  }

  const version = parsed[1]?.toLowerCase();
  const salt = parsed[2]?.toLowerCase();
  if (version !== PASSWORD_HASH_VERSION || !salt) {
    return false;
  }

  try {
    const computed = await hashVirtualPasswordWithSalt(password, salt);
    return timingSafeEqual(computed, storedHash.toLowerCase());
  } catch {
    return false;
  }
};

interface Syscalls {
  // Legacy flat syscall surface.
  pwd(): string;
  cd(path: string): { ok: true } | { ok: false; error: string };
  ls(path?: string): ReturnType<VirtualFS["list"]>;
  readFile(path: string): ReturnType<VirtualFS["readFile"]>;
  write(message?: string): void;
  clear(): void;
  which(command: string): { path: string } | { error: string };
  listExecutables(): Array<{ name: string; path: string; description: string }>;
  invokeRuntimeExecutable(path: string, context: ProgramContext): Promise<void>;
  now(): Date;
  // Namespaced runtime APIs.
  console: {
    write(message?: string): void;
    clear(): void;
    readSecret(prompt: string): Promise<string | null>;
    disconnect(message?: string): void;
  };
  fs: VirtualFS;
  process: {
    stdin: string;
    isTTY: boolean;
    user: string;
    host: string;
    cwd: string;
  };
  time: {
    now(): Date;
    sleep(ms: number): Promise<void>;
  };
  tui: {
    run(program: TuiProgram): Promise<void>;
  };
  exec: {
    which(command: string): { path: string } | { error: string };
    resolveAll(command: string): string[];
    listExecutables(): Array<{ name: string; path: string; description: string }>;
    runArgv(
      argv: string[],
      options?: {
        stdin?: string;
        stdout?: (message?: string) => void;
        runAsUser?: VirtualUser;
        isTTY?: boolean;
      }
    ): Promise<boolean>;
    runLine(line: string): Promise<void>;
  };
  runtime: any;
  helpers: Record<string, unknown>;
}

export interface ProgramContext {
  args: string[];
  sys: Syscalls;
  // Legacy context aliases retained for compatibility.
  stdin: string;
  isTTY: boolean;
  fs: VirtualFS;
  cwd: string;
  user: string;
  host: string;
  println(message?: string): void;
  clear(): void;
  runTui(program: TuiProgram): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface ProgramDefinition {
  name: string;
  description: string;
  showInHelp?: boolean;
  run(context: ProgramContext): Promise<void> | void;
}

export interface ExecutableProgramDefinition extends ProgramDefinition {
  path: string;
  source?: string;
}

export interface RegisterExecutableOptions {
  materializeFile?: boolean;
}

export interface ShellSystemConfig {
  distributionName: string;
  distributionVersion: string;
  platformName: string;
  platformVersion: string;
  hostName: string;
  kernelName: string;
  kernelRelease: string;
  kernelVersion: string;
  machine: string;
  operatingSystem: string;
  shellPath: string;
  initPath: string;
}

export interface ShellOptions {
  resetStorage?: boolean;
  system?: Partial<ShellSystemConfig>;
}

interface ShellPersistedState {
  version: 1;
  activeUsername: string;
  fs: VirtualFSState;
}

export interface ShellBridge {
  println(message?: string): void;
  clear(): void;
  runTui(program: TuiProgram): Promise<void>;
  readSecret(prompt: string): Promise<string | null>;
  disconnect(message?: string): void;
}

type ShellOperator = "|" | ">" | ">>";

interface ParsedCommand {
  argv: string[];
  stdoutRedirect?: {
    mode: "truncate" | "append";
    path: string;
  };
}

type SourceProgramLoadResult =
  | { ok: true; program: ProgramDefinition }
  | { ok: false; error: string };

const DEFAULT_SYSTEM_CONFIG: ShellSystemConfig = {
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
};

const isShellOperator = (value: string): value is ShellOperator => {
  return value === "|" || value === ">" || value === ">>";
};

const tokenizeShellInput = (input: string): string[] => {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  const pushCurrent = (): void => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] ?? "";

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "|") {
      pushCurrent();
      tokens.push("|");
      continue;
    }

    if (char === ">") {
      pushCurrent();
      const next = input[i + 1];
      if (next === ">") {
        tokens.push(">>");
        i += 1;
      } else {
        tokens.push(">");
      }
      continue;
    }

    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += "\\";
  }

  pushCurrent();

  return tokens;
};

const parseCommandLine = (input: string): { commands: ParsedCommand[] } | { error: string } => {
  const tokens = tokenizeShellInput(input);
  if (tokens.length === 0) {
    return { commands: [] };
  }

  const commands: ParsedCommand[] = [];
  let current: ParsedCommand = { argv: [] };

  const pushCommand = (): { error: string } | null => {
    if (current.argv.length === 0) {
      return { error: "syntax error near unexpected token `|`" };
    }

    commands.push(current);
    current = { argv: [] };
    return null;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? "";

    if (token === "|") {
      const parseError = pushCommand();
      if (parseError) {
        return parseError;
      }
      continue;
    }

    if (token === ">" || token === ">>") {
      if (current.stdoutRedirect) {
        return { error: "syntax error: multiple output redirects in command" };
      }

      const redirectPath = tokens[i + 1];
      if (!redirectPath || isShellOperator(redirectPath)) {
        return { error: `syntax error near unexpected token \`${redirectPath ?? "newline"}\`` };
      }

      current.stdoutRedirect = {
        mode: token === ">>" ? "append" : "truncate",
        path: redirectPath
      };
      i += 1;
      continue;
    }

    current.argv.push(token);
  }

  if (current.argv.length === 0) {
    return { error: "syntax error near unexpected token `newline`" };
  }

  commands.push(current);
  return { commands };
};

type CurlResolvedTarget =
  | { kind: "remote"; url: string }
  | { kind: "virtual-file"; path: string }
  | { error: string };

type PingResolvedTarget =
  | { label: string; host: string; url: string }
  | { error: string };

type NslookupRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SOA" | "PTR";

interface NslookupAnswer {
  name?: string;
  type?: number;
  TTL?: number;
  data?: string;
}

interface NslookupResponse {
  Status?: number;
  Answer?: NslookupAnswer[];
  Authority?: NslookupAnswer[];
  Comment?: string;
}

interface NslookupProviderResult {
  providerName: string;
  providerAddress: string;
  statusCode: number;
  answers: NslookupAnswer[];
  authority: NslookupAnswer[];
  comment?: string;
}

type VirtualProcessState = "R" | "S" | "Z" | "T";

interface VirtualProcess {
  pid: number;
  ppid: number;
  user: string;
  command: string;
  state: VirtualProcessState;
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  signal?: string;
}

interface ShellContextFrame {
  pid: number;
  username: string;
  cwd: string;
  env: Map<string, string>;
}

const NSLOOKUP_TYPE_CODE: Record<NslookupRecordType, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28
};

const NSLOOKUP_CODE_TYPE: Record<number, string> = Object.entries(NSLOOKUP_TYPE_CODE).reduce(
  (map, [name, code]) => {
    map[code] = name;
    return map;
  },
  {} as Record<number, string>
);

const NSLOOKUP_STATUS_TEXT: Record<number, string> = {
  0: "NOERROR",
  1: "FORMERR",
  2: "SERVFAIL",
  3: "NXDOMAIN",
  4: "NOTIMP",
  5: "REFUSED"
};

const NSLOOKUP_PROVIDERS = [
  {
    name: "dns.google",
    address: "8.8.8.8",
    url: (host: string, type: NslookupRecordType): string => {
      return `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${NSLOOKUP_TYPE_CODE[type]}`;
    }
  },
  {
    name: "cloudflare-dns.com",
    address: "1.1.1.1",
    url: (host: string, type: NslookupRecordType): string => {
      return `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${NSLOOKUP_TYPE_CODE[type]}`;
    }
  }
] as const;

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6_PATTERN =
  /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|::1|([0-9a-f]{1,4}:){1,7}:|:([0-9a-f]{1,4}:){1,7}[0-9a-f]{1,4})$/i;

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

const resolveCurlTarget = (rawTarget: string, fs: VirtualFS): CurlResolvedTarget => {
  const target = rawTarget.trim();
  if (target.length === 0) {
    return { error: "curl: missing URL" };
  }

  if (target.startsWith("file://")) {
    const filePath = target.slice("file://".length);
    if (!filePath.startsWith("/")) {
      return { error: "curl: file:// URLs must use absolute paths" };
    }
    return { kind: "virtual-file", path: filePath };
  }

  if (URL_SCHEME_PATTERN.test(target)) {
    return { kind: "remote", url: target };
  }

  if (target.startsWith("//")) {
    return { kind: "remote", url: `http:${target}` };
  }

  const looksLikePath =
    target.startsWith("/") ||
    target.startsWith("./") ||
    target.startsWith("../") ||
    target.startsWith("~/");

  if (looksLikePath || fs.exists(target)) {
    return { error: `curl: (3) URL rejected: '${target}' looks like a local path` };
  }

  return { kind: "remote", url: `http://${target}` };
};

const resolvePingTarget = (rawTarget: string): PingResolvedTarget => {
  const target = rawTarget.trim();
  if (target.length === 0) {
    return { error: "ping: usage error: Destination address required" };
  }

  const looksLikePath =
    target.startsWith("/") ||
    target.startsWith("./") ||
    target.startsWith("../") ||
    target.startsWith("~/");
  if (looksLikePath || target.includes("/")) {
    return { error: `ping: ${target}: Name or service not known` };
  }

  if (URL_SCHEME_PATTERN.test(target)) {
    try {
      const parsed = new URL(target);
      if (!parsed.hostname) {
        return { error: `ping: ${target}: Name or service not known` };
      }
      return {
        label: parsed.hostname,
        host: parsed.hostname,
        url: parsed.toString()
      };
    } catch {
      return { error: `ping: ${target}: Name or service not known` };
    }
  }

  const useHttp = target === "localhost" || target.startsWith("127.") || target === "[::1]";
  return {
    label: target,
    host: target,
    url: `${useHttp ? "http" : "https"}://${target}/`
  };
};

const runPingProbe = async (
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; latencyMs: number }> => {
  const start = performance.now();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, Math.max(1, timeoutMs));

  try {
    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    return { ok: true, latencyMs: performance.now() - start };
  } catch {
    return { ok: false, latencyMs: performance.now() - start };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const normalizeNslookupHost = (rawHost: string): string | null => {
  const target = rawHost.trim();
  if (target.length === 0) {
    return null;
  }

  const looksLikePath =
    target.startsWith("/") ||
    target.startsWith("./") ||
    target.startsWith("../") ||
    target.startsWith("~/");
  if (looksLikePath) {
    return null;
  }

  if (URL_SCHEME_PATTERN.test(target)) {
    try {
      const parsed = new URL(target);
      if (!parsed.hostname) {
        return null;
      }
      return parsed.hostname.replace(/\.$/, "");
    } catch {
      return null;
    }
  }

  if (target.includes("/")) {
    return null;
  }

  return target.replace(/\.$/, "");
};

const parseNslookupRecordType = (value: string): NslookupRecordType | null => {
  const normalized = value.trim().toUpperCase();
  if (normalized in NSLOOKUP_TYPE_CODE) {
    return normalized as NslookupRecordType;
  }
  return null;
};

const isIpAddress = (value: string): boolean => {
  return IPV4_PATTERN.test(value) || IPV6_PATTERN.test(value);
};

const queryNslookupProvider = async (
  provider: (typeof NSLOOKUP_PROVIDERS)[number],
  host: string,
  type: NslookupRecordType,
  timeoutMs: number
): Promise<NslookupProviderResult | null> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, Math.max(200, timeoutMs));

  try {
    const response = await fetch(provider.url(host, type), {
      method: "GET",
      headers: {
        accept: "application/dns-json"
      },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as NslookupResponse;
    return {
      providerName: provider.name,
      providerAddress: provider.address,
      statusCode: payload.Status ?? 2,
      answers: Array.isArray(payload.Answer) ? payload.Answer : [],
      authority: Array.isArray(payload.Authority) ? payload.Authority : [],
      comment: payload.Comment
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const queryNslookup = async (
  host: string,
  type: NslookupRecordType,
  timeoutMs: number
): Promise<NslookupProviderResult | null> => {
  for (const provider of NSLOOKUP_PROVIDERS) {
    const result = await queryNslookupProvider(provider, host, type, timeoutMs);
    if (result) {
      return result;
    }
  }
  return null;
};

const stripTrailingDot = (value: string): string => value.replace(/\.$/, "");

const nslookupAnswerType = (answer: NslookupAnswer): string => {
  if (typeof answer.type === "number") {
    return NSLOOKUP_CODE_TYPE[answer.type] ?? `TYPE${answer.type}`;
  }
  return "UNKNOWN";
};

const filenameFromUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname.trim();
    if (path.length === 0 || path.endsWith("/")) {
      return "index.html";
    }
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "index.html";
  } catch {
    return "index.html";
  }
};

export class Shell {
  private readonly fs = new VirtualFS(HOME_PATH);
  private readonly executables = new Map<string, ProgramDefinition>();
  private readonly sourceProgramCache = new Map<string, { source: string; program: ProgramDefinition }>();
  private readonly users = new Map<string, VirtualUser>();
  private readonly pathDirs = ["/bin", "/usr/bin", "/usr/local/bin"];
  private readonly system: ShellSystemConfig;
  private host: string;
  private readonly bootedFromPersistedState: boolean;
  private readonly bootedAtMs = Date.now();
  private persistenceSuspended = false;
  private readonly envVars = new Map<string, string>();
  private readonly processes = new Map<number, VirtualProcess>();
  private readonly shellFrames: ShellContextFrame[] = [];
  private shellPid = 2;
  private nextPid = 100;
  private activeUsername = "guest";

  constructor(
    private readonly bridge: ShellBridge,
    options?: ShellOptions
  ) {
    this.system = {
      ...DEFAULT_SYSTEM_CONFIG,
      ...(options?.system ?? {})
    };
    this.host = this.system.hostName;

    this.fs.setMutationListener(() => {
      this.persistState();
    });

    if (options?.resetStorage) {
      this.clearPersistedState();
    }

    let restored = false;
    this.withPersistenceSuspended(() => {
      restored = this.restorePersistedState();
      if (!restored) {
        this.seedLinuxFilesystem();
      }

      this.seedVirtualUsers({ ensureHomeDirectories: !restored });
      this.installCoreExecutables(false);
      this.loadExecutablesIntoVfs({ overwriteGeneratedSources: !restored });
    });

    this.initializeRuntimeState();
    this.bootedFromPersistedState = restored;
    this.persistState();
  }

  public getPrompt(): string {
    const user = this.getActiveUser();
    const cwd = this.fs.pwd();
    const prettyCwd = cwd.startsWith(user.home) ? `~${cwd.slice(user.home.length) || ""}` : cwd;
    return `${user.username}@${this.host}:${prettyCwd}$ `;
  }

  public getSystemConfig(): ShellSystemConfig {
    return {
      ...this.system,
      hostName: this.host
    };
  }

  public shouldSeedHostDefaults(): boolean {
    return !this.bootedFromPersistedState;
  }

  public mkdir(path: string): void {
    this.withUserFsCredentials(this.getRootUser(), () => {
      this.fs.mkdir(path);
    });
  }

  public writeFile(path: string, content: string): void {
    this.withUserFsCredentials(this.getRootUser(), () => {
      this.fs.writeFile(path, content);
    });
  }

  public registerExecutable(
    program: ExecutableProgramDefinition,
    options?: RegisterExecutableOptions
  ): void {
    const materializeFile = options?.materializeFile ?? true;

    this.withUserFsCredentials(this.getRootUser(), () => {
      const absolutePath = this.fs.toAbsolute(program.path);
      this.executables.set(absolutePath, {
        name: this.commandNameFromPath(absolutePath),
        description: program.description,
        showInHelp: program.showInHelp,
        run: program.run
      });
      this.sourceProgramCache.delete(absolutePath);

      if (materializeFile) {
        const writeResult = this.materializeExecutableIntoVfs(absolutePath, {
          overwriteGeneratedSource: true
        });
        if (!writeResult.ok) {
          throw new Error(writeResult.error);
        }
      }
    });
  }

  public loadExecutablesIntoVfs(options?: { overwriteGeneratedSources?: boolean }): void {
    const overwriteGeneratedSources = options?.overwriteGeneratedSources ?? false;

    this.withUserFsCredentials(this.getRootUser(), () => {
      for (const path of this.executables.keys()) {
        const writeResult = this.materializeExecutableIntoVfs(path, {
          overwriteGeneratedSource: overwriteGeneratedSources
        });
        if (!writeResult.ok) {
          throw new Error(writeResult.error);
        }
      }
    });
  }

  public registerProgram(program: ProgramDefinition, options?: RegisterExecutableOptions): void {
    this.registerExecutable({
      ...program,
      path: `/usr/local/bin/${program.name}`
    }, options);
  }

  private materializeExecutableIntoVfs(
    path: string,
    options?: { overwriteGeneratedSource?: boolean }
  ): FsResult {
    const program = this.executables.get(path) ?? this.rehydrateRuntimeProgram(path);
    if (!program) {
      return { ok: false, error: `load: missing runtime executable for ${path}` };
    }

    const desiredSource = this.buildRuntimeExecutableSource(path, program);
    const stat = this.fs.stat(path);

    if (stat?.kind === "dir") {
      return { ok: false, error: `write: ${path}: Is a directory` };
    }

    if (stat?.kind === "file") {
      if (!stat.executable) {
        const chmodResult = this.fs.chmod(path, true);
        if (!chmodResult.ok) {
          return chmodResult;
        }
      }

      const readResult = this.fs.readFile(path);
      if ("error" in readResult) {
        return { ok: false, error: `load: unable to read '${path}' (${readResult.error})` };
      }

      const isGeneratedSource = readResult.content.includes(RUNTIME_SOURCE_MARKER);
      if (!(options?.overwriteGeneratedSource && isGeneratedSource)) {
        return { ok: true };
      }
    } else {
      const parentDir = this.parentDirectory(path);
      const mkdirResult = this.fs.mkdir(parentDir);
      if (!mkdirResult.ok) {
        return mkdirResult;
      }
    }

    const writeResult = this.fs.writeFile(path, desiredSource, { executable: true });
    if (!writeResult.ok) {
      return writeResult;
    }

    this.sourceProgramCache.delete(path);
    return { ok: true };
  }

  private buildRuntimeExecutableSource(path: string, program: ProgramDefinition): string {
    const runSource = this.formatRunFunctionSource(program.run);
    return [
      DEFAULT_EXECUTABLE_SHEBANG,
      RUNTIME_SOURCE_MARKER,
      `// path: ${path}`,
      `// command: ${program.name}`,
      `// description: ${program.description}`,
      "export default async function main(ctx) {",
      "  const args = Array.isArray(ctx?.args) ? ctx.args : [];",
      "  const sys = ctx?.sys;",
      "  if (!sys) {",
      "    throw new Error(\"runtime sys context is unavailable\");",
      "  }",
      "  const runtime = sys.runtime;",
      "  const helpers = sys.helpers ?? {};",
      "  const system = typeof runtime?.getSystemConfig === \"function\" ? runtime.getSystemConfig() : {};",
      "  const platformName = system?.platformName ?? \"\";",
      "  const fs = sys.fs;",
      "  const stdin = sys.process?.stdin ?? \"\";",
      "  const isTTY = Boolean(sys.process?.isTTY);",
      "  const user = sys.process?.user ?? \"\";",
      "  const host = sys.process?.host ?? \"\";",
      "  const runTui = sys.tui?.run;",
      "  const sleep = sys.time?.sleep;",
      "  const println = sys.console?.write;",
      "  const clear = sys.console?.clear;",
      "  const {",
      "    makeSyscallSource,",
      "    tokenizeShellInput,",
      "    normalizeNslookupHost,",
      "    parseNslookupRecordType,",
      "    queryNslookup,",
      "    isIpAddress,",
      "    NSLOOKUP_PROVIDERS,",
      "    NSLOOKUP_STATUS_TEXT,",
      "    stripTrailingDot,",
      "    nslookupAnswerType,",
      "    resolveCurlTarget,",
      "    basename,",
      "    filenameFromUrl,",
      "    resolvePingTarget,",
      "    runPingProbe,",
      "    joinPath,",
      "    formatLsLongLine,",
      "    colorizeLsName,",
      "    SPINNER_FRAMES,",
      "    SPARK_CHARS,",
      "    sparkline,",
      "    parseEchoEscapes,",
      "    clamp,",
      "    ANSI_RESET,",
      "    ANSI_BOLD_GREEN,",
      "    ANSI_BOLD_YELLOW,",
      "    ANSI_DIM_RED,",
      "    ANSI_BOLD_CYAN,",
      "    enterInteractiveShell,",
      "    exitInteractiveShell,",
      "    usernameForUid,",
      "    runTextEditorCommand,",
      "    expandWildcardOperand,",
      "    verifyUserPassword,",
      "    currentEnvMap,",
      "    isValidEnvName,",
      "    shellUptimeSeconds,",
      "    formatDurationCompact",
      "  } = helpers;",
      `  const __run = ${runSource};`,
      "  await __run({ args, sys });",
      "}"
    ].join("\n");
  }

  private formatRunFunctionSource(run: ProgramDefinition["run"]): string {
    const raw = run.toString().trim();
    const normalized = this.normalizeFunctionExpression(raw);
    return this.softFormatJavaScript(normalized);
  }

  private normalizeFunctionExpression(source: string): string {
    let normalized = source;
    if (/^async\s+[A-Za-z_$][\w$]*\s*\(/.test(normalized)) {
      normalized = normalized.replace(/^async\s+([A-Za-z_$][\w$]*)\s*\(/, "async function $1(");
    } else if (/^[A-Za-z_$][\w$]*\s*\(/.test(normalized)) {
      normalized = normalized.replace(/^([A-Za-z_$][\w$]*)\s*\(/, "function $1(");
    }

    if (!normalized.startsWith("(")) {
      normalized = `(${normalized})`;
    }
    return normalized;
  }

  private softFormatJavaScript(source: string): string {
    const normalized = source.replace(/\r\n/g, "\n").trim();
    if (normalized.includes("\n")) {
      return normalized;
    }

    let out = "";
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaping = false;

    for (let i = 0; i < normalized.length; i += 1) {
      const char = normalized[i] ?? "";
      const next = normalized[i + 1] ?? "";

      if (inLineComment) {
        out += char;
        if (char === "\n") {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        out += char;
        if (char === "*" && next === "/") {
          out += "/";
          i += 1;
          inBlockComment = false;
        }
        continue;
      }

      if (escaping) {
        out += char;
        escaping = false;
        continue;
      }

      if (char === "\\") {
        out += char;
        if (inSingle || inDouble || inTemplate) {
          escaping = true;
        }
        continue;
      }

      if (!inSingle && !inDouble && !inTemplate) {
        if (char === "/" && next === "/") {
          out += "//";
          i += 1;
          inLineComment = true;
          continue;
        }
        if (char === "/" && next === "*") {
          out += "/*";
          i += 1;
          inBlockComment = true;
          continue;
        }
      }

      if (char === "'" && !inDouble && !inTemplate) {
        inSingle = !inSingle;
        out += char;
        continue;
      }
      if (char === "\"" && !inSingle && !inTemplate) {
        inDouble = !inDouble;
        out += char;
        continue;
      }
      if (char === "`" && !inSingle && !inDouble) {
        inTemplate = !inTemplate;
        out += char;
        continue;
      }

      if (!inSingle && !inDouble && !inTemplate) {
        if (char === ";") {
          out += ";\n";
          continue;
        }
        if (char === "{") {
          out += "{\n";
          continue;
        }
        if (char === "}") {
          out += "\n}";
          continue;
        }
      }

      out += char;
    }

    return out.replace(/\n{3,}/g, "\n\n");
  }

  private parentDirectory(path: string): string {
    const normalized = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
    const slashIndex = normalized.lastIndexOf("/");
    if (slashIndex <= 0) {
      return "/";
    }
    return normalized.slice(0, slashIndex);
  }

  private seedVirtualUsers(options?: { ensureHomeDirectories?: boolean }): void {
    const ensureHomeDirectories = options?.ensureHomeDirectories ?? true;
    this.users.clear();

    for (const user of VIRTUAL_USER_SEED) {
      this.users.set(user.username, {
        ...user,
        shell: this.system.shellPath
      });
      if (ensureHomeDirectories) {
        this.fs.mkdir(user.home);
        this.fs.chown(user.home, user.uid, user.gid);
        this.fs.chmodMode(user.home, user.uid === ROOT_UID ? 0o700 : 0o755);
      }
    }

    if (!this.users.has(this.activeUsername)) {
      this.activeUsername = "guest";
    }

    this.syncFsCredentialsToActiveUser();
  }

  private initializeRuntimeState(): void {
    this.processes.clear();
    this.shellFrames.length = 0;

    const initProcess: VirtualProcess = {
      pid: 1,
      ppid: 0,
      user: "root",
      command: this.system.initPath,
      state: "S",
      startedAt: this.bootedAtMs
    };

    const shellProcess: VirtualProcess = {
      pid: 2,
      ppid: 1,
      user: this.getActiveUser().username,
      command: this.system.shellPath,
      state: "S",
      startedAt: this.bootedAtMs
    };

    this.processes.set(initProcess.pid, initProcess);
    this.processes.set(shellProcess.pid, shellProcess);
    this.shellPid = shellProcess.pid;
    this.nextPid = 100;

    this.initializeEnvironment();
    this.updatePwdEnvironment();
    this.shellFrames.push({
      pid: shellProcess.pid,
      username: this.getActiveUser().username,
      cwd: this.fs.pwd(),
      env: new Map(this.envVars)
    });
    this.syncCurrentShellFrame();
  }

  private initializeEnvironment(): void {
    this.envVars.clear();
    this.envVars.set("PATH", this.pathDirs.join(":"));
    this.envVars.set("LANG", "en_US.UTF-8");
    this.envVars.set("TERM", "xterm-256color");
    this.envVars.set("SHLVL", "1");
    this.syncEnvironmentForActiveUser();
  }

  private syncEnvironmentForActiveUser(): void {
    const user = this.getActiveUser();
    this.envVars.set("USER", user.username);
    this.envVars.set("LOGNAME", user.username);
    this.envVars.set("HOME", user.home);
    this.envVars.set("SHELL", user.shell);
    this.envVars.set("HOSTNAME", this.host);
    this.updatePwdEnvironment();
  }

  private updatePwdEnvironment(): void {
    this.envVars.set("PWD", this.fs.pwd());
  }

  private currentShellFrame(): ShellContextFrame | null {
    if (this.shellFrames.length === 0) {
      return null;
    }
    return this.shellFrames[this.shellFrames.length - 1] ?? null;
  }

  private syncCurrentShellFrame(): void {
    const frame = this.currentShellFrame();
    if (!frame) {
      return;
    }

    this.syncEnvironmentForActiveUser();
    this.envVars.set("SHLVL", String(Math.max(1, this.shellFrames.length)));

    frame.pid = this.shellPid;
    frame.username = this.activeUsername;
    frame.cwd = this.fs.pwd();
    frame.env = new Map(this.envVars);
  }

  private restoreShellFrame(frame: ShellContextFrame): void {
    const restoredUser = this.getUser(frame.username) ?? this.getActiveUser();
    this.activeUsername = restoredUser.username;
    this.fs.setCredentials(restoredUser.uid, restoredUser.gid);

    const targetCwd = frame.cwd.length > 0 ? frame.cwd : restoredUser.home;
    const cdResult = this.fs.cd(targetCwd);
    if (!cdResult.ok) {
      this.fs.mkdir(restoredUser.home);
      const fallback = this.fs.cd(restoredUser.home);
      if (!fallback.ok) {
        this.bridge.println(fallback.error);
      }
    }

    this.shellPid = frame.pid;
    const shellProcess = this.processes.get(this.shellPid);
    if (shellProcess) {
      shellProcess.user = restoredUser.username;
      if (shellProcess.state === "T") {
        shellProcess.state = "S";
      }
    }

    this.replaceEnvironment(new Map(frame.env));
    this.syncEnvironmentForActiveUser();
    this.envVars.set("SHLVL", String(Math.max(1, this.shellFrames.length)));
    this.syncCurrentShellFrame();
  }

  private enterInteractiveShell(options?: { user?: VirtualUser; loginShell?: boolean }): number {
    const targetUser = options?.user ?? this.getActiveUser();
    const loginShell = options?.loginShell ?? false;

    this.syncCurrentShellFrame();

    const pid = this.nextPid;
    this.nextPid += 1;
    const shellProcess: VirtualProcess = {
      pid,
      ppid: this.shellPid,
      user: targetUser.username,
      command: this.system.shellPath,
      state: "S",
      startedAt: Date.now()
    };
    this.processes.set(pid, shellProcess);

    this.activeUsername = targetUser.username;
    this.fs.setCredentials(targetUser.uid, targetUser.gid);
    if (loginShell) {
      this.fs.mkdir(targetUser.home);
      const cdResult = this.fs.cd(targetUser.home);
      if (!cdResult.ok) {
        this.bridge.println(cdResult.error);
      }
    }

    this.shellPid = pid;
    this.syncEnvironmentForActiveUser();
    this.envVars.set("SHLVL", String(Math.max(1, this.shellFrames.length + 1)));

    this.shellFrames.push({
      pid,
      username: targetUser.username,
      cwd: this.fs.pwd(),
      env: new Map(this.envVars)
    });
    this.syncCurrentShellFrame();
    this.persistState();

    return pid;
  }

  private exitInteractiveShell(exitCode: number): boolean {
    if (this.shellFrames.length <= 1) {
      return false;
    }

    const closing = this.shellFrames.pop();
    if (closing) {
      const process = this.processes.get(closing.pid);
      if (process) {
        process.state = "Z";
        process.endedAt = Date.now();
        process.exitCode = exitCode;
      }
    }

    const parent = this.currentShellFrame();
    if (!parent) {
      return false;
    }

    this.restoreShellFrame(parent);
    this.pruneProcessHistory();
    this.persistState();
    return true;
  }

  private createProcessRecord(actor: VirtualUser, argv: string[]): VirtualProcess {
    const pid = this.nextPid;
    this.nextPid += 1;

    const process: VirtualProcess = {
      pid,
      ppid: this.shellPid,
      user: actor.username,
      command: argv.join(" "),
      state: "R",
      startedAt: Date.now()
    };

    this.processes.set(pid, process);
    return process;
  }

  private finalizeProcessRecord(
    process: VirtualProcess,
    result: { state: VirtualProcessState; exitCode?: number; signal?: string }
  ): void {
    process.state = result.state;
    process.endedAt = Date.now();
    process.exitCode = result.exitCode;
    process.signal = result.signal;
    this.pruneProcessHistory();
  }

  private pruneProcessHistory(): void {
    const protectedPids = new Set(this.shellFrames.map((frame) => frame.pid));
    const dynamicProcesses = [...this.processes.values()]
      .filter((process) => process.pid >= 100 && process.state === "Z" && !protectedPids.has(process.pid))
      .sort((a, b) => (a.endedAt ?? a.startedAt) - (b.endedAt ?? b.startedAt));

    const maxHistory = 64;
    while (dynamicProcesses.length > maxHistory) {
      const oldest = dynamicProcesses.shift();
      if (!oldest) {
        break;
      }
      this.processes.delete(oldest.pid);
    }
  }

  private currentEnvMap(): Map<string, string> {
    this.syncEnvironmentForActiveUser();
    this.envVars.set("SHLVL", String(Math.max(1, this.shellFrames.length || 1)));
    return new Map(this.envVars);
  }

  private shellUptimeSeconds(): number {
    return Math.max(0, Math.floor((Date.now() - this.bootedAtMs) / 1000));
  }

  private formatDurationCompact(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) {
      return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  private isValidEnvName(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
  }

  private replaceEnvironment(next: Map<string, string>): void {
    this.envVars.clear();
    for (const [key, value] of next) {
      this.envVars.set(key, value);
    }
  }

  private withPersistenceSuspended<T>(fn: () => T): T {
    const previous = this.persistenceSuspended;
    this.persistenceSuspended = true;
    try {
      return fn();
    } finally {
      this.persistenceSuspended = previous;
    }
  }

  private clearPersistedState(): void {
    const storages = this.getPersistStorages();
    for (const storage of [storages.session, storages.local]) {
      if (!storage) {
        continue;
      }
      this.removeStoredState(storage);
    }
  }

  private restorePersistedState(): boolean {
    const storages = this.getPersistStorages();
    const sessionStorage = storages.session;
    const localStorage = storages.local;

    if (sessionStorage) {
      const fromSession = this.readStoredState(sessionStorage);
      if (fromSession) {
        const restored = this.applyPersistedState(fromSession);
        if (restored) {
          return true;
        }
        this.removeStoredState(sessionStorage);
      }
    }

    if (!localStorage) {
      return false;
    }

    const fromLocal = this.readStoredState(localStorage);
    if (!fromLocal) {
      return false;
    }

    const restored = this.applyPersistedState(fromLocal);
    if (!restored) {
      this.removeStoredState(localStorage);
      return false;
    }

    if (sessionStorage) {
      this.writeStoredState(sessionStorage, fromLocal);
    }
    return true;
  }

  private applyPersistedState(state: ShellPersistedState): boolean {
    const restoredFs = this.fs.importState(state.fs);
    if (!restoredFs) {
      return false;
    }

    this.activeUsername = state.activeUsername;
    return true;
  }

  private persistState(): void {
    if (this.persistenceSuspended) {
      return;
    }

    const state: ShellPersistedState = {
      version: SHELL_STATE_VERSION,
      activeUsername: this.activeUsername,
      fs: this.fs.exportState()
    };

    const storages = this.getPersistStorages();
    for (const storage of [storages.session, storages.local]) {
      if (!storage) {
        continue;
      }
      this.writeStoredState(storage, state);
    }
  }

  private getPersistStorages(): { session: Storage | null; local: Storage | null } {
    return {
      session: this.getStorage("sessionStorage"),
      local: this.getStorage("localStorage")
    };
  }

  private getStorage(type: "sessionStorage" | "localStorage"): Storage | null {
    try {
      return window[type];
    } catch {
      return null;
    }
  }

  private readStoredState(storage: Storage): ShellPersistedState | null {
    try {
      const encoded = storage.getItem(SHELL_STORAGE_KEY);
      if (!encoded) {
        return null;
      }

      const raw = JSON.parse(encoded) as Partial<ShellPersistedState>;
      if (raw.version !== SHELL_STATE_VERSION) {
        return null;
      }
      if (typeof raw.activeUsername !== "string" || !raw.fs) {
        return null;
      }

      return {
        version: SHELL_STATE_VERSION,
        activeUsername: raw.activeUsername,
        fs: raw.fs
      };
    } catch {
      return null;
    }
  }

  private writeStoredState(storage: Storage, state: ShellPersistedState): void {
    try {
      storage.setItem(SHELL_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore persistence errors (quota/private mode) and keep session usable.
    }
  }

  private removeStoredState(storage: Storage): void {
    try {
      storage.removeItem(SHELL_STORAGE_KEY);
    } catch {
      // Ignore persistence errors (quota/private mode) and keep session usable.
    }
  }

  private getActiveUser(): VirtualUser {
    const user = this.users.get(this.activeUsername);
    if (!user) {
      throw new Error(`active user '${this.activeUsername}' is not defined`);
    }
    return user;
  }

  private getUser(username: string): VirtualUser | null {
    return this.users.get(username) ?? null;
  }

  private getRootUser(): VirtualUser {
    const root = this.users.get("root");
    if (!root) {
      throw new Error("root user is not configured");
    }
    return root;
  }

  private syncFsCredentialsToActiveUser(): void {
    const user = this.getActiveUser();
    this.fs.setCredentials(user.uid, user.gid);
  }

  private withFsCredentials<T>(uid: number, gid: number, fn: () => T): T {
    const previous = this.fs.getCredentials();
    this.fs.setCredentials(uid, gid);
    try {
      return fn();
    } finally {
      this.fs.setCredentials(previous.uid, previous.gid);
    }
  }

  private async withFsCredentialsAsync<T>(uid: number, gid: number, fn: () => Promise<T>): Promise<T> {
    const previous = this.fs.getCredentials();
    this.fs.setCredentials(uid, gid);
    try {
      return await fn();
    } finally {
      this.fs.setCredentials(previous.uid, previous.gid);
    }
  }

  private withUserFsCredentials<T>(user: VirtualUser, fn: () => T): T {
    return this.withFsCredentials(user.uid, user.gid, fn);
  }

  private async withUserFsCredentialsAsync<T>(
    user: VirtualUser,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.withFsCredentialsAsync(user.uid, user.gid, fn);
  }

  private usernameForUid(uid: number): string {
    for (const user of this.users.values()) {
      if (user.uid === uid) {
        return user.username;
      }
    }
    return String(uid);
  }

  private async verifyUserPassword(user: VirtualUser, password: string): Promise<boolean> {
    return verifyVirtualPassword(password, user.passwordHash);
  }

  public completeCommand(prefix: string): string[] {
    this.syncFsCredentialsToActiveUser();
    return this.listCommands().filter((name) => name.startsWith(prefix));
  }

  public completePath(partial: string): string[] {
    this.syncFsCredentialsToActiveUser();
    const endsWithSlash = partial.endsWith("/");
    const hasSlash = partial.includes("/");
    const lastSlash = partial.lastIndexOf("/");

    let basePath = ".";
    let needle = partial;

    if (endsWithSlash) {
      basePath = partial === "/" ? "/" : partial.slice(0, -1) || ".";
      needle = "";
    } else if (hasSlash) {
      basePath = partial.slice(0, lastSlash) || (partial.startsWith("/") ? "/" : ".");
      needle = partial.slice(lastSlash + 1);
    }

    const listing = this.fs.list(basePath === "." ? undefined : basePath);
    if (listing.error) {
      return [];
    }

    return listing.items
      .filter(({ name }) => name.startsWith(needle))
      .map(({ name, node }) => {
        const suffix = node.kind === "dir" ? "/" : "";
        if (endsWithSlash) {
          return `${partial}${name}${suffix}`;
        }
        if (hasSlash) {
          return `${partial.slice(0, lastSlash + 1)}${name}${suffix}`;
        }
        return `${name}${suffix}`;
      })
      .sort((a, b) => a.localeCompare(b));
  }

  private listCommands(): string[] {
    const commands = new Set<string>();
    for (const entry of this.getPathExecutableEntries()) {
      commands.add(entry.name);
    }
    return [...commands].sort((a, b) => a.localeCompare(b));
  }

  public async execute(line: string): Promise<void> {
    this.syncFsCredentialsToActiveUser();

    const parsed = parseCommandLine(line.trim());
    if ("error" in parsed) {
      this.bridge.println(parsed.error);
      return;
    }

    if (parsed.commands.length === 0) {
      return;
    }

    let stdin = "";

    for (let i = 0; i < parsed.commands.length; i += 1) {
      const command = parsed.commands[i];
      if (command.argv.length === 0) {
        continue;
      }

      const hasNextStage = i < parsed.commands.length - 1;
      const shouldCaptureOutput = hasNextStage || Boolean(command.stdoutRedirect);
      const capturedOutput: string[] = [];
      const writeOutput = (message = ""): void => {
        if (shouldCaptureOutput) {
          capturedOutput.push(message);
          return;
        }
        this.bridge.println(message);
      };

      const ok = await this.runCommandByArgv(command.argv, {
        stdin,
        stdout: writeOutput,
        isTTY: !shouldCaptureOutput
      });
      if (!ok) {
        return;
      }

      const stdout = capturedOutput.join("\n");

      if (command.stdoutRedirect) {
        const redirectResult = this.redirectStdout(
          command.stdoutRedirect.path,
          stdout,
          command.stdoutRedirect.mode
        );
        if (!redirectResult.ok) {
          this.bridge.println(redirectResult.error);
          return;
        }
      }

      if (hasNextStage) {
        stdin = command.stdoutRedirect ? "" : stdout;
      }
    }
  }

  private async runCommandByArgv(
    argv: string[],
    options?: {
      stdin?: string;
      stdout?: (message?: string) => void;
      runAsUser?: VirtualUser;
      isTTY?: boolean;
    }
  ): Promise<boolean> {
    const output = options?.stdout ?? ((message = "") => this.bridge.println(message));
    const actor = options?.runAsUser ?? this.getActiveUser();
    const [name, ...args] = argv;
    if (!name) {
      return true;
    }

    const process = this.createProcessRecord(actor, argv);

    return this.withUserFsCredentialsAsync(actor, async () => {
      const resolved = this.resolveExecutable(name);
      if ("error" in resolved) {
        this.finalizeProcessRecord(process, { state: "Z", exitCode: 127 });
        output(resolved.error);
        this.updatePwdEnvironment();
        this.syncCurrentShellFrame();
        return false;
      }

      const sourceProgram = this.loadProgramFromExecutableSource(resolved.path, name);
      let executableProgram: ProgramDefinition | undefined;
      if (sourceProgram?.ok) {
        executableProgram = sourceProgram.program;
      } else if (sourceProgram && !sourceProgram.ok) {
        this.finalizeProcessRecord(process, { state: "Z", exitCode: 1 });
        output(`${name}: ${sourceProgram.error}`);
        this.updatePwdEnvironment();
        this.syncCurrentShellFrame();
        return false;
      }

      if (!executableProgram) {
        const runtimeProgram = this.executables.get(resolved.path) ?? this.rehydrateRuntimeProgram(resolved.path);
        executableProgram = runtimeProgram;
      }

      if (!executableProgram) {
        this.finalizeProcessRecord(process, { state: "Z", exitCode: 126 });
        output(`${name}: executable has no runtime program`);
        this.updatePwdEnvironment();
        this.syncCurrentShellFrame();
        return false;
      }

      try {
        await executableProgram.run(
          this.createContext(args, {
            stdin: options?.stdin,
            stdout: output,
            runAsUser: actor,
            isTTY: options?.isTTY
          })
        );
        this.finalizeProcessRecord(process, { state: "Z", exitCode: 0 });
        this.updatePwdEnvironment();
        this.syncCurrentShellFrame();
        return true;
      } catch (error) {
        this.finalizeProcessRecord(process, { state: "Z", exitCode: 1 });
        const message = error instanceof Error ? error.message : String(error);
        output(`${name}: program failed: ${message}`);
        this.updatePwdEnvironment();
        this.syncCurrentShellFrame();
        return false;
      }
    });
  }

  private resolveExecutable(command: string): { path: string } | { error: string } {
    const matches = this.resolveAllExecutables(command);
    if (matches.length > 0) {
      return { path: matches[0] ?? "" };
    }

    if (command.includes("/")) {
      const absolutePath = this.fs.toAbsolute(command);
      const stat = this.fs.stat(absolutePath);

      if (!stat) {
        return { error: `${command}: no such file or directory` };
      }

      if (stat.kind === "dir") {
        return { error: `${command}: is a directory` };
      }

      if (!stat.executable) {
        return { error: `${command}: permission denied` };
      }
    }

    return { error: `${command}: command not found` };
  }

  private resolveAllExecutables(command: string): string[] {
    if (command.includes("/")) {
      const absolutePath = this.fs.toAbsolute(command);
      const stat = this.fs.stat(absolutePath);

      if (stat && stat.kind === "file" && stat.executable) {
        return [absolutePath];
      }
      return [];
    }

    const matches: string[] = [];
    for (const dir of this.pathDirs) {
      const candidate = `${dir}/${command}`;
      if (this.fs.isExecutable(candidate)) {
        matches.push(candidate);
      }
    }

    return matches;
  }

  private getPathExecutableEntries(): Array<{ name: string; path: string; description: string }> {
    const byName = new Map<string, { name: string; path: string; description: string }>();

    for (const dir of this.pathDirs) {
      const listing = this.fs.list(dir);
      if (listing.error) {
        continue;
      }

      for (const item of listing.items) {
        const { name, node } = item;
        if (node.kind !== "file" || !node.executable) {
          continue;
        }

        if (byName.has(name)) {
          continue;
        }

        const path = `${dir}/${name}`;
        const program = this.executables.get(path);
        if (program?.showInHelp === false) {
          continue;
        }
        byName.set(name, {
          name,
          path,
          description: program?.description ?? "executable"
        });
      }
    }

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private commandNameFromPath(path: string): string {
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? path;
  }

  private expandWildcardOperand(operand: string): string[] {
    if (!operand.includes("*") && !operand.includes("?")) {
      return [operand];
    }

    const lastSlash = operand.lastIndexOf("/");
    const basePath =
      lastSlash >= 0 ? (operand.slice(0, lastSlash) || "/") : ".";
    const pattern = lastSlash >= 0 ? operand.slice(lastSlash + 1) : operand;
    if (pattern.length === 0) {
      return [operand];
    }

    const listing = this.fs.list(basePath === "." ? undefined : basePath);
    if (listing.error) {
      return [operand];
    }

    const matcher = this.wildcardToRegExp(pattern);
    const includeHidden = pattern.startsWith(".");
    const prefix = lastSlash >= 0 ? operand.slice(0, lastSlash + 1) : "";
    const matches = listing.items
      .filter(({ name }) => {
        if (!includeHidden && name.startsWith(".")) {
          return false;
        }
        return matcher.test(name);
      })
      .map(({ name }) => `${prefix}${name}`);

    if (matches.length === 0) {
      return [operand];
    }
    return matches;
  }

  private wildcardToRegExp(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`);
  }

  private seedLinuxFilesystem(): void {
    const directories = [
      "/bin",
      "/etc",
      "/home",
      "/home/guest",
      "/home/operator",
      "/home/guest/projects",
      "/root",
      "/usr",
      "/usr/bin",
      "/usr/local",
      "/usr/local/bin",
      "/usr/share",
      "/var",
      "/var/log"
    ];

    for (const path of directories) {
      this.fs.mkdir(path);
    }

    const files: Array<{ path: string; content: string }> = [
      {
        path: "/home/guest/readme.txt",
        content: [
          `${this.system.distributionName} shell`,
          "",
          "Try these commands:",
          "- ls",
          "- cd projects",
          "- cat readme.txt",
          "- demo-ui",
          "- sysmon",
          "- ui-lab"
        ].join("\n")
      },
      {
        path: "/home/guest/projects/todo.md",
        content: [
          "# project notes",
          "- add command aliases",
          "- add package manager simulation",
          "- maybe build multiplayer shell"
        ].join("\n")
      },
      {
        path: "/home/guest/projects/apps.txt",
        content: [
          "// add custom executable programs from src/main.ts",
          "// terminal.registerExecutable({ path: '/usr/local/bin/myapp', ... })"
        ].join("\n")
      },
      {
        path: "/usr/share/about.txt",
        content: `${this.system.platformName} ${this.system.platformVersion} - browser terminal distribution`
      },
      {
        path: "/var/log/boot.log",
        content: [
          `[    0.00] ${this.system.kernelName} ${this.system.kernelRelease} loaded`,
          "[    0.12] mounting fake fs",
          "[    0.27] launching browser shell",
          "[    0.35] ready"
        ].join("\n")
      }
    ];

    for (const { path, content } of files) {
      this.fs.writeFile(path, content);
    }

    // Linux-like ownership/layout defaults.
    this.fs.chown("/home/guest", GUEST_UID, GUEST_GID);
    this.fs.chown("/home/guest/projects", GUEST_UID, GUEST_GID);
    this.fs.chown("/home/guest/readme.txt", GUEST_UID, GUEST_GID);
    this.fs.chown("/home/guest/projects/todo.md", GUEST_UID, GUEST_GID);
    this.fs.chown("/home/guest/projects/apps.txt", GUEST_UID, GUEST_GID);

    this.fs.chown("/home/operator", OPERATOR_UID, OPERATOR_GID);

    this.fs.chmodMode("/root", 0o700);
    this.fs.chmodMode("/home/guest", 0o755);
    this.fs.chmodMode("/home/operator", 0o755);

    this.fs.cd(HOME_PATH);
  }

  private redirectStdout(path: string, content: string, mode: "truncate" | "append"): FsResult {
    const stat = this.fs.stat(path);
    if (stat?.kind === "dir") {
      return { ok: false, error: `${path}: is a directory` };
    }

    let nextContent = content;
    if (mode === "append" && stat?.kind === "file") {
      const existing = this.fs.readFile(path);
      if ("error" in existing) {
        return { ok: false, error: existing.error };
      }
      const separator =
        existing.content.length > 0 && content.length > 0 && !existing.content.endsWith("\n")
          ? "\n"
          : "";
      nextContent = `${existing.content}${separator}${content}`;
    }

    return this.fs.writeFile(path, nextContent);
  }

  private createContext(
    args: string[],
    options?: {
      stdin?: string;
      stdout?: (message?: string) => void;
      runAsUser?: VirtualUser;
      isTTY?: boolean;
    }
  ): ProgramContext {
    const output = options?.stdout ?? ((message = "") => this.bridge.println(message));
    const actor = options?.runAsUser ?? this.getActiveUser();
    const stdin = options?.stdin ?? "";
    const isTTY = options?.isTTY ?? true;
    const processInfo = {
      stdin,
      isTTY,
      user: actor.username,
      host: this.host,
      cwd: this.fs.pwd()
    };
    const helpers = this.createHelperNamespace();

    const sys: Syscalls = {
      pwd: () => this.fs.pwd(),
      cd: (path: string) => this.fs.cd(path),
      ls: (path?: string) => this.fs.list(path),
      readFile: (path: string) => this.fs.readFile(path),
      write: (message = "") => {
        output(message);
      },
      clear: () => {
        this.bridge.clear();
      },
      which: (command: string) => this.resolveExecutable(command),
      listExecutables: () => this.getPathExecutableEntries(),
      invokeRuntimeExecutable: async (path: string, context: ProgramContext) => {
        const runtimeProgram = this.executables.get(path) ?? this.rehydrateRuntimeProgram(path);
        if (!runtimeProgram) {
          throw new Error(`runtime executable not found for ${path}`);
        }
        await runtimeProgram.run(context);
      },
      now: () => new Date(),
      console: {
        write: (message = "") => {
          output(message);
        },
        clear: () => {
          this.bridge.clear();
        },
        readSecret: async (prompt: string) => this.bridge.readSecret(prompt),
        disconnect: (message?: string) => {
          this.bridge.disconnect(message);
        }
      },
      fs: this.fs,
      process: processInfo,
      time: {
        now: () => new Date(),
        sleep: delay
      },
      tui: {
        run: async (program: TuiProgram) => {
          await this.bridge.runTui(program);
        }
      },
      exec: {
        which: (command: string) => this.resolveExecutable(command),
        resolveAll: (command: string) => this.resolveAllExecutables(command),
        listExecutables: () => this.getPathExecutableEntries(),
        runArgv: async (
          argv: string[],
          commandOptions?: {
            stdin?: string;
            stdout?: (message?: string) => void;
            runAsUser?: VirtualUser;
            isTTY?: boolean;
          }
        ) => {
          return this.runCommandByArgv(argv, commandOptions);
        },
        runLine: async (line: string) => this.execute(line)
      },
      runtime: this,
      helpers
    };

    return {
      args,
      sys,
      stdin,
      isTTY,
      fs: this.fs,
      cwd: this.fs.pwd(),
      user: actor.username,
      host: this.host,
      println: (message = "") => {
        output(message);
      },
      clear: () => {
        this.bridge.clear();
      },
      runTui: async (program: TuiProgram) => {
        await this.bridge.runTui(program);
      },
      sleep: delay
    };
  }

  private async runTextEditorCommand(
    flavor: "nano" | "vi",
    commandName: "nano" | "vi" | "vim",
    args: string[],
    write: (message?: string) => void
  ): Promise<void> {
    const usage =
      flavor === "nano" ? "usage: nano [file]" : `usage: ${commandName} [+line] [file]`;

    let filePath: string | null = null;
    let startLine = 0;

    for (const arg of args) {
      if (arg === "--help") {
        write(usage);
        return;
      }

      if (/^\+\d+$/.test(arg)) {
        startLine = Math.max(0, Number.parseInt(arg.slice(1), 10) - 1);
        continue;
      }

      if (arg.startsWith("-") && arg !== "-") {
        write(`${commandName}: invalid option -- '${arg}'`);
        return;
      }

      if (filePath === null) {
        filePath = arg;
        continue;
      }

      write(`${commandName}: too many files specified`);
      return;
    }

    let executable = false;
    let initialContent = "";

    if (filePath !== null) {
      const stat = this.fs.stat(filePath);
      if (stat?.kind === "dir") {
        write(`${commandName}: ${filePath}: Is a directory`);
        return;
      }

      if (stat?.kind === "file") {
        executable = Boolean(stat.executable);
        const readResult = this.fs.readFile(filePath);
        if ("error" in readResult) {
          write(readResult.error.replace(/^cat:/, `${commandName}:`));
          return;
        }
        initialContent = readResult.content;
      }
    }

    const lines = initialContent.replace(/\r\n/g, "\n").split("\n");
    if (lines.length === 0) {
      lines.push("");
    }

    let cursorRow = clamp(startLine, 0, Math.max(0, lines.length - 1));
    let cursorCol = 0;
    let preferredCol = 0;
    let topRow = 0;
    let leftCol = 0;
    let dirty = false;
    let status =
      flavor === "nano"
        ? "Ctrl+O write   Ctrl+X exit   Ctrl+C cancel"
        : "-- NORMAL --   i insert   :w :q :wq";
    let statusIsError = false;
    let nanoQuitArmed = false;
    let viMode: "normal" | "insert" | "command" = flavor === "nano" ? "insert" : "normal";
    let viCommand = "";
    let pendingDelete = false;
    let closed = false;

    const markDirty = (): void => {
      dirty = true;
      nanoQuitArmed = false;
    };

    const setStatus = (message: string, error = false): void => {
      status = message;
      statusIsError = error;
    };

    const currentLine = (): string => {
      return lines[cursorRow] ?? "";
    };

    const getLayout = (ui: TuiContext): {
      contentY: number;
      statusY: number;
      commandY: number;
      contentHeight: number;
      gutterWidth: number;
      textX: number;
      contentWidth: number;
    } => {
      const contentY = 2;
      const statusY = Math.max(2, ui.height - 3);
      const commandY = Math.max(2, ui.height - 2);
      const contentHeight = Math.max(1, statusY - contentY);
      const gutterWidth = Math.max(4, String(lines.length).length + 1);
      const textX = 2 + gutterWidth;
      const contentWidth = Math.max(1, ui.width - textX - 2);
      return {
        contentY,
        statusY,
        commandY,
        contentHeight,
        gutterWidth,
        textX,
        contentWidth
      };
    };

    const normalizeCursor = (): void => {
      cursorRow = clamp(cursorRow, 0, Math.max(0, lines.length - 1));
      cursorCol = clamp(cursorCol, 0, currentLine().length);
      preferredCol = cursorCol;
    };

    const ensureCursorVisible = (layout: {
      contentHeight: number;
      contentWidth: number;
    }): void => {
      if (cursorRow < topRow) {
        topRow = cursorRow;
      } else if (cursorRow >= topRow + layout.contentHeight) {
        topRow = cursorRow - layout.contentHeight + 1;
      }

      if (cursorCol < leftCol) {
        leftCol = cursorCol;
      } else if (cursorCol >= leftCol + layout.contentWidth) {
        leftCol = cursorCol - layout.contentWidth + 1;
      }

      topRow = Math.max(0, topRow);
      leftCol = Math.max(0, leftCol);
    };

    const moveHorizontal = (delta: number): void => {
      pendingDelete = false;
      cursorCol = clamp(cursorCol + delta, 0, currentLine().length);
      preferredCol = cursorCol;
    };

    const moveVertical = (delta: number): void => {
      pendingDelete = false;
      cursorRow = clamp(cursorRow + delta, 0, Math.max(0, lines.length - 1));
      cursorCol = clamp(preferredCol, 0, currentLine().length);
    };

    const moveToStart = (): void => {
      pendingDelete = false;
      cursorCol = 0;
      preferredCol = 0;
    };

    const moveToEnd = (): void => {
      pendingDelete = false;
      cursorCol = currentLine().length;
      preferredCol = cursorCol;
    };

    const insertText = (textValue: string): void => {
      if (textValue.length === 0) {
        return;
      }
      const line = currentLine();
      lines[cursorRow] = `${line.slice(0, cursorCol)}${textValue}${line.slice(cursorCol)}`;
      cursorCol += textValue.length;
      preferredCol = cursorCol;
      markDirty();
    };

    const insertNewLine = (): void => {
      const line = currentLine();
      const left = line.slice(0, cursorCol);
      const right = line.slice(cursorCol);
      lines[cursorRow] = left;
      lines.splice(cursorRow + 1, 0, right);
      cursorRow += 1;
      cursorCol = 0;
      preferredCol = 0;
      markDirty();
    };

    const backspace = (): void => {
      if (cursorCol > 0) {
        const line = currentLine();
        lines[cursorRow] = `${line.slice(0, cursorCol - 1)}${line.slice(cursorCol)}`;
        cursorCol -= 1;
        preferredCol = cursorCol;
        markDirty();
        return;
      }

      if (cursorRow <= 0) {
        return;
      }

      const previous = lines[cursorRow - 1] ?? "";
      const line = currentLine();
      lines[cursorRow - 1] = `${previous}${line}`;
      lines.splice(cursorRow, 1);
      cursorRow -= 1;
      cursorCol = previous.length;
      preferredCol = cursorCol;
      markDirty();
    };

    const deleteForward = (): void => {
      const line = currentLine();
      if (cursorCol < line.length) {
        lines[cursorRow] = `${line.slice(0, cursorCol)}${line.slice(cursorCol + 1)}`;
        markDirty();
        return;
      }

      if (cursorRow >= lines.length - 1) {
        return;
      }

      lines[cursorRow] = `${line}${lines[cursorRow + 1] ?? ""}`;
      lines.splice(cursorRow + 1, 1);
      markDirty();
    };

    const insertLineBelow = (): void => {
      lines.splice(cursorRow + 1, 0, "");
      cursorRow += 1;
      cursorCol = 0;
      preferredCol = 0;
      markDirty();
    };

    const insertLineAbove = (): void => {
      lines.splice(cursorRow, 0, "");
      cursorCol = 0;
      preferredCol = 0;
      markDirty();
    };

    const deleteCurrentLine = (): void => {
      if (lines.length === 1) {
        if ((lines[0] ?? "").length > 0) {
          lines[0] = "";
          markDirty();
        }
        cursorRow = 0;
        cursorCol = 0;
        preferredCol = 0;
        return;
      }

      lines.splice(cursorRow, 1);
      cursorRow = clamp(cursorRow, 0, Math.max(0, lines.length - 1));
      cursorCol = clamp(cursorCol, 0, currentLine().length);
      preferredCol = cursorCol;
      markDirty();
    };

    const saveBuffer = (pathOverride?: string): boolean => {
      const nextPath = (pathOverride ?? filePath)?.trim();
      if (!nextPath) {
        setStatus(`${commandName}: no file name`, true);
        return false;
      }

      const stat = this.fs.stat(nextPath);
      if (stat?.kind === "dir") {
        setStatus(`${commandName}: ${nextPath}: Is a directory`, true);
        return false;
      }

      const content = lines.join("\n");
      const nextExecutable = stat?.kind === "file" ? Boolean(stat.executable) : executable;
      const result = this.fs.writeFile(nextPath, content, {
        executable: nextExecutable
      });
      if (!result.ok) {
        setStatus(result.error.replace(/^write:/, `${commandName}:`), true);
        return false;
      }

      filePath = nextPath;
      executable = nextExecutable;
      dirty = false;
      nanoQuitArmed = false;
      setStatus(`[wrote ${lines.length} line${lines.length === 1 ? "" : "s"}, ${content.length} bytes]`);
      return true;
    };

    const closeEditor = (ui: TuiContext): void => {
      closed = true;
      ui.exit();
    };

    await this.bridge.runTui((ui: TuiContext) => {
      const draw = (): void => {
        const layout = getLayout(ui);
        normalizeCursor();
        ensureCursorVisible(layout);

        const title = `${commandName} ${filePath ?? "[No Name]"}${dirty ? " [+]" : ""}`;
        ui.clear(" ");
        ui.box(0, 0, ui.width, ui.height, {
          title,
          border: flavor === "nano" ? "rounded" : "single",
          style: flavor === "nano" ? { fg: "cyan" } : { fg: "green" },
          titleStyle: { fg: "yellow", bold: true }
        });

        ui.text(2, 1, filePath ?? "[No Name]", {
          width: Math.max(1, ui.width - 4),
          ellipsis: true,
          style: { fg: "gray", dim: true }
        });

        for (let row = 0; row < layout.contentHeight; row += 1) {
          const lineIndex = topRow + row;
          const y = layout.contentY + row;
          if (lineIndex >= lines.length) {
            if (flavor === "vi") {
              ui.write(1, y, "~", { fg: "blue", dim: true });
            }
            continue;
          }

          const lineNumber = String(lineIndex + 1).padStart(layout.gutterWidth - 1, " ");
          ui.write(1, y, `${lineNumber} `, { fg: "gray", dim: true });

          const line = lines[lineIndex] ?? "";
          const visible = line.slice(leftCol, leftCol + layout.contentWidth);
          ui.write(layout.textX, y, visible);
        }

        if (flavor === "vi" && viMode === "command") {
          const prompt = `:${viCommand}`;
          ui.text(1, layout.commandY, prompt, {
            width: Math.max(1, ui.width - 2),
            ellipsis: true,
            style: { fg: "yellow", bold: true }
          });
          const cursorX = clamp(2 + viCommand.length, 1, ui.width - 2);
          ui.write(cursorX, layout.commandY, " ", { fg: "black", bg: "yellow", bold: true });
        } else {
          const cursorX = layout.textX + (cursorCol - leftCol);
          const cursorY = layout.contentY + (cursorRow - topRow);
          if (
            cursorY >= layout.contentY &&
            cursorY < layout.contentY + layout.contentHeight &&
            cursorX >= layout.textX &&
            cursorX < layout.textX + layout.contentWidth
          ) {
            const cursorChar = (currentLine()[cursorCol] ?? " ").slice(0, 1);
            const cursorStyle =
              flavor === "nano"
                ? ({ fg: "black", bg: "cyan", bold: true } as const)
                : viMode === "insert"
                  ? ({ fg: "black", bg: "green", bold: true } as const)
                  : ({ fg: "black", bg: "yellow", bold: true } as const);
            ui.write(cursorX, cursorY, cursorChar, cursorStyle);
          }
        }

        ui.fillRect(1, layout.statusY, Math.max(1, ui.width - 2), 1, " ", {
          fg: statusIsError ? "white" : "black",
          bg: statusIsError ? "red" : "cyan"
        });
        ui.text(1, layout.statusY, status, {
          width: Math.max(1, ui.width - 2),
          ellipsis: true,
          style: {
            fg: statusIsError ? "white" : "black",
            bg: statusIsError ? "red" : "cyan",
            bold: true
          }
        });

        if (!(flavor === "vi" && viMode === "command")) {
          const hint =
            flavor === "nano"
              ? "^O WriteOut  ^X Exit  Arrows Move"
              : viMode === "insert"
                ? "-- INSERT --  Esc normal  Ctrl+S write"
                : "-- NORMAL --  i insert  :w :q :wq";
          ui.text(1, layout.commandY, hint, {
            width: Math.max(1, ui.width - 2),
            ellipsis: true,
            style: { fg: "gray", dim: true }
          });
        }

        ui.render();
      };

      const executeViCommand = (): void => {
        const command = viCommand.trim();
        viCommand = "";
        viMode = "normal";

        if (command.length === 0) {
          setStatus("-- NORMAL --   i insert   :w :q :wq");
          return;
        }

        if (command === "w") {
          saveBuffer();
          return;
        }

        if (command === "q") {
          if (dirty) {
            setStatus("No write since last change (add ! to override)", true);
            return;
          }
          closeEditor(ui);
          return;
        }

        if (command === "q!") {
          closeEditor(ui);
          return;
        }

        if (command === "wq" || command === "x") {
          if (saveBuffer()) {
            closeEditor(ui);
          }
          return;
        }

        if (command.startsWith("w ")) {
          const nextPath = command.slice(2).trim();
          if (nextPath.length === 0) {
            setStatus(`${commandName}: no file name`, true);
            return;
          }
          saveBuffer(nextPath);
          return;
        }

        if (command.startsWith("wq ")) {
          const nextPath = command.slice(3).trim();
          if (nextPath.length === 0) {
            setStatus(`${commandName}: no file name`, true);
            return;
          }
          if (saveBuffer(nextPath)) {
            closeEditor(ui);
          }
          return;
        }

        setStatus(`${commandName}: not an editor command: ${command}`, true);
      };

      const handleInsertLikeKey = (key: { key: string; ctrl: boolean; alt: boolean }): void => {
        if (key.key === "ArrowLeft") {
          moveHorizontal(-1);
          return;
        }
        if (key.key === "ArrowRight") {
          moveHorizontal(1);
          return;
        }
        if (key.key === "ArrowUp") {
          moveVertical(-1);
          return;
        }
        if (key.key === "ArrowDown") {
          moveVertical(1);
          return;
        }
        if (key.key === "Home") {
          moveToStart();
          return;
        }
        if (key.key === "End") {
          moveToEnd();
          return;
        }
        if (key.key === "PageUp") {
          const layout = getLayout(ui);
          moveVertical(-layout.contentHeight);
          return;
        }
        if (key.key === "PageDown") {
          const layout = getLayout(ui);
          moveVertical(layout.contentHeight);
          return;
        }
        if (key.key === "Enter") {
          insertNewLine();
          return;
        }
        if (key.key === "Backspace") {
          backspace();
          return;
        }
        if (key.key === "Delete") {
          deleteForward();
          return;
        }
        if (key.key === "Tab") {
          insertText("  ");
          return;
        }
        if (key.key.length === 1 && !key.ctrl && !key.alt) {
          insertText(key.key);
        }
      };

      ui.onKey((key) => {
        const lower = key.key.toLowerCase();
        if (key.ctrl && lower === "c") {
          closeEditor(ui);
          return;
        }

        if (flavor === "nano") {
          if (key.ctrl && (lower === "o" || lower === "s")) {
            saveBuffer();
          } else if (key.ctrl && lower === "x") {
            if (dirty && !nanoQuitArmed) {
              nanoQuitArmed = true;
              setStatus("Unsaved changes. Press Ctrl+X again to quit without saving.", true);
            } else {
              closeEditor(ui);
              return;
            }
          } else {
            nanoQuitArmed = false;
            handleInsertLikeKey(key);
          }

          if (!closed) {
            draw();
          }
          return;
        }

        if (viMode === "command") {
          if (key.key === "Escape") {
            viMode = "normal";
            viCommand = "";
            setStatus("-- NORMAL --   i insert   :w :q :wq");
          } else if (key.key === "Enter") {
            executeViCommand();
          } else if (key.key === "Backspace") {
            viCommand = viCommand.slice(0, -1);
          } else if (key.key.length === 1 && !key.ctrl && !key.alt) {
            viCommand += key.key;
          }

          if (!closed) {
            draw();
          }
          return;
        }

        if (viMode === "insert") {
          if (key.key === "Escape") {
            viMode = "normal";
            pendingDelete = false;
            setStatus("-- NORMAL --   i insert   :w :q :wq");
          } else if (key.ctrl && lower === "s") {
            saveBuffer();
          } else {
            handleInsertLikeKey(key);
          }

          if (!closed) {
            draw();
          }
          return;
        }

        if (key.key === ":") {
          pendingDelete = false;
          viMode = "command";
          viCommand = "";
        } else if (key.key === "i") {
          pendingDelete = false;
          viMode = "insert";
          setStatus("-- INSERT --");
        } else if (key.key === "a") {
          pendingDelete = false;
          if (cursorCol < currentLine().length) {
            cursorCol += 1;
            preferredCol = cursorCol;
          }
          viMode = "insert";
          setStatus("-- INSERT --");
        } else if (key.key === "o") {
          pendingDelete = false;
          insertLineBelow();
          viMode = "insert";
          setStatus("-- INSERT --");
        } else if (key.key === "O") {
          pendingDelete = false;
          insertLineAbove();
          viMode = "insert";
          setStatus("-- INSERT --");
        } else if (key.key === "x" || key.key === "Delete") {
          pendingDelete = false;
          deleteForward();
        } else if (key.key === "d") {
          if (pendingDelete) {
            deleteCurrentLine();
            pendingDelete = false;
          } else {
            pendingDelete = true;
            setStatus("d");
          }
        } else if (key.key === "h" || key.key === "ArrowLeft") {
          pendingDelete = false;
          moveHorizontal(-1);
        } else if (key.key === "l" || key.key === "ArrowRight") {
          pendingDelete = false;
          moveHorizontal(1);
        } else if (key.key === "j" || key.key === "ArrowDown") {
          pendingDelete = false;
          moveVertical(1);
        } else if (key.key === "k" || key.key === "ArrowUp") {
          pendingDelete = false;
          moveVertical(-1);
        } else if (key.key === "0" || key.key === "Home") {
          pendingDelete = false;
          moveToStart();
        } else if (key.key === "$" || key.key === "End") {
          pendingDelete = false;
          moveToEnd();
        } else if (key.key === "PageUp") {
          pendingDelete = false;
          const layout = getLayout(ui);
          moveVertical(-layout.contentHeight);
        } else if (key.key === "PageDown") {
          pendingDelete = false;
          const layout = getLayout(ui);
          moveVertical(layout.contentHeight);
        } else if (key.key === "Escape") {
          pendingDelete = false;
          setStatus("-- NORMAL --   i insert   :w :q :wq");
        } else {
          pendingDelete = false;
        }

        if (!closed) {
          draw();
        }
      });

      draw();
    });
  }

  private installCoreExecutables(materializeFiles = true): void {
    installUnixTools(this, materializeFiles, this.createHelperNamespace() as unknown as Parameters<typeof installUnixTools>[2]);
  }

  private createHelperNamespace(): Record<string, unknown> {
    return {
      makeSyscallSource,
      tokenizeShellInput,
      normalizeNslookupHost,
      parseNslookupRecordType,
      queryNslookup,
      isIpAddress,
      NSLOOKUP_PROVIDERS,
      NSLOOKUP_STATUS_TEXT,
      stripTrailingDot,
      nslookupAnswerType,
      resolveCurlTarget,
      basename,
      filenameFromUrl,
      resolvePingTarget,
      runPingProbe,
      joinPath,
      formatLsLongLine,
      colorizeLsName,
      SPINNER_FRAMES: HELPER_SPINNER_FRAMES,
      SPARK_CHARS: HELPER_SPARK_CHARS,
      sparkline: helperSparkline,
      parseEchoEscapes,
      clamp,
      ANSI_RESET,
      ANSI_BOLD_GREEN,
      ANSI_BOLD_YELLOW,
      ANSI_DIM_RED,
      ANSI_BOLD_CYAN,
      enterInteractiveShell: this.enterInteractiveShell.bind(this),
      exitInteractiveShell: this.exitInteractiveShell.bind(this),
      usernameForUid: this.usernameForUid.bind(this),
      runTextEditorCommand: this.runTextEditorCommand.bind(this),
      expandWildcardOperand: this.expandWildcardOperand.bind(this),
      verifyUserPassword: this.verifyUserPassword.bind(this),
      currentEnvMap: this.currentEnvMap.bind(this),
      isValidEnvName: this.isValidEnvName.bind(this),
      shellUptimeSeconds: this.shellUptimeSeconds.bind(this),
      formatDurationCompact: this.formatDurationCompact.bind(this)
    };
  }

  private rehydrateRuntimeProgram(path: string): ProgramDefinition | undefined {
    if (path.startsWith("/bin/")) {
      this.installCoreExecutables(false);
      return this.executables.get(path);
    }

    return undefined;
  }

  private loadProgramFromExecutableSource(path: string, commandName: string): SourceProgramLoadResult | null {
    const sourceResult = this.fs.readFile(path);
    if ("error" in sourceResult) {
      this.sourceProgramCache.delete(path);
      return {
        ok: false,
        error: `unable to read executable source (${sourceResult.error})`
      };
    }

    const source = sourceResult.content;
    const cached = this.sourceProgramCache.get(path);
    if (cached && cached.source === source) {
      return {
        ok: true,
        program: cached.program
      };
    }

    const sourceBody = source.replace(/^#![^\r\n]*(?:\r?\n)?/, "");
    const looksLikeJavaScript =
      source.startsWith(DEFAULT_EXECUTABLE_SHEBANG) ||
      /\bexport\s+default\b/.test(sourceBody) ||
      /\bmodule\.exports\b/.test(sourceBody) ||
      /\bexports\.default\b/.test(sourceBody);

    if (!looksLikeJavaScript) {
      this.sourceProgramCache.delete(path);
      return null;
    }

    const transformedSource = sourceBody.replace(/\bexport\s+default\b/, "__jlinuxDefault =");
    const factorySource = [
      "\"use strict\";",
      "let __jlinuxDefault;",
      "const module = { exports: {} };",
      "const exports = module.exports;",
      transformedSource,
      "const resolvedEntryPoint =",
      "  (typeof __jlinuxDefault === 'function' && __jlinuxDefault) ||",
      "  (typeof module.exports === 'function' && module.exports) ||",
      "  (module.exports && typeof module.exports.default === 'function' && module.exports.default) ||",
      "  (typeof exports.default === 'function' && exports.default) ||",
      "  null;",
      "return resolvedEntryPoint;"
    ].join("\n");

    let entryPoint: ProgramDefinition["run"];
    try {
      const sourceFactory = new Function(factorySource) as () => unknown;
      const loaded = sourceFactory();
      if (typeof loaded !== "function") {
        return {
          ok: false,
          error: "executable source did not export a default function"
        };
      }

      const runtimeEntryPoint = loaded as ProgramDefinition["run"];
      entryPoint = async (context) => {
        await runtimeEntryPoint(context);
      };
    } catch (error) {
      this.sourceProgramCache.delete(path);
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: `unable to compile executable source at ${path} (${message})`
      };
    }

    const loadedProgram: ProgramDefinition = {
      name: commandName,
      description: `script loaded from ${path}`,
      run: entryPoint
    };

    this.sourceProgramCache.set(path, {
      source,
      program: loadedProgram
    });
    return { ok: true, program: loadedProgram };
  }

}

export { FrameBuffer };
