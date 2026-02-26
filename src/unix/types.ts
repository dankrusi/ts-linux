import type { ExecutableProgramDefinition } from "../terminal/shell";

type NslookupRecordType = any;
type NslookupAnswer = any;

export interface UnixToolHelpers {
  makeSyscallSource: (name: string, bodyLines: string[]) => string;
  tokenizeShellInput: (input: string) => string[];
  normalizeNslookupHost: (rawHost: string) => string | null;
  parseNslookupRecordType: (value: string) => NslookupRecordType | null;
  queryNslookup: (host: string, type: NslookupRecordType, timeoutMs: number) => Promise<any>;
  isIpAddress: (value: string) => boolean;
  NSLOOKUP_PROVIDERS: ReadonlyArray<{ name: string; address: string }>;
  NSLOOKUP_STATUS_TEXT: Record<number, string>;
  stripTrailingDot: (value: string) => string;
  nslookupAnswerType: (answer: NslookupAnswer) => string;
  resolveCurlTarget: (rawTarget: string, fs: any) => any;
  basename: (path: string) => string;
  filenameFromUrl: (rawUrl: string) => string;
  resolvePingTarget: (rawTarget: string) => any;
  runPingProbe: (url: string, timeoutMs: number) => Promise<{ ok: boolean; latencyMs: number }>;
  joinPath: (base: string, name: string) => string;
  formatLsLongLine: (name: string, node: any, sizeBytes: number, owner: string, humanReadable: boolean) => string;
  colorizeLsName: (name: string, node: any, classify: boolean, colorize: boolean) => string;
  parseEchoEscapes: (input: string) => string;
  clamp: (value: number, min: number, max: number) => number;
  ANSI_RESET: string;
  ANSI_BOLD_GREEN: string;
  ANSI_BOLD_YELLOW: string;
  ANSI_DIM_RED: string;
  ANSI_BOLD_CYAN: string;
  enterInteractiveShell: (options?: { user?: any; loginShell?: boolean }) => number;
  exitInteractiveShell: (exitCode: number) => boolean;
  usernameForUid: (uid: number) => string;
  runTextEditorCommand: (
    flavor: "nano" | "vi",
    commandName: "nano" | "vi" | "vim",
    args: string[],
    write: (message?: string) => void
  ) => Promise<void>;
  expandWildcardOperand: (operand: string) => string[];
  verifyUserPassword: (user: any, password: string) => Promise<boolean>;
  currentEnvMap: () => Map<string, string>;
  isValidEnvName: (name: string) => boolean;
  shellUptimeSeconds: () => number;
  formatDurationCompact: (totalSeconds: number) => string;
}

export type UnixCoreRegister = (program: Omit<ExecutableProgramDefinition, "path">) => void;

export interface UnixInstallContext {
  runtime: any;
  helpers: UnixToolHelpers;
  core: UnixCoreRegister;
}

export type UnixCommandInstaller = (ctx: UnixInstallContext) => void;
