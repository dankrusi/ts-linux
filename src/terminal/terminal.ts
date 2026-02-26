import {
  ExecutableProgramDefinition,
  ProgramDefinition,
  RegisterExecutableOptions,
  Shell,
  ShellSystemConfig,
  ShellBridge
} from "./shell";
import {
  BoxOptions,
  FrameBuffer,
  ListOptions,
  ProgressOptions,
  SparklineOptions,
  TableOptions,
  TextOptions,
  TuiContext,
  TuiKey,
  TuiProgram,
  TuiStyle,
  WindowOptions
} from "./tui";

interface TuiSession {
  buffer: FrameBuffer;
  keyHandlers: Set<(key: TuiKey) => void>;
  timers: Set<number>;
  resolve: () => void;
  exitMessage?: string;
}

interface CompletionState {
  tokenStart: number;
  tokenEnd: number;
  tokenPrefix: string;
  suggestions: string[];
}

interface TabCycleState {
  left: string;
  right: string;
  options: string[];
  index: number;
}

interface SecretPromptSession {
  prompt: string;
  resolve: (value: string | null) => void;
}

interface AnsiStyleState {
  bold: boolean;
  dim: boolean;
  fg?: string;
  bg?: string;
}

const MIN_TUI_COLS = 40;
const MIN_TUI_ROWS = 12;
const MAX_TUI_COLS = 120;
const MAX_TUI_ROWS = 36;

export interface BrowserTerminalOptions {
  resetFilesystem?: boolean;
  system?: Partial<ShellSystemConfig>;
}

export class BrowserTerminal implements ShellBridge {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly output: HTMLDivElement;
  private readonly input: HTMLDivElement;
  private readonly prompt: HTMLSpanElement;
  private readonly line: HTMLSpanElement;
  private readonly tui: HTMLPreElement;
  private readonly shell: Shell;

  private inputBuffer = "";
  private cursor = 0;
  private history: string[] = [];
  private historyIndex = 0;
  private busy = false;
  private connected = true;
  private mode: "shell" | "tui" = "shell";
  private tuiSession: TuiSession | null = null;
  private tabCycle: TabCycleState | null = null;
  private secretPrompt: SecretPromptSession | null = null;

  constructor(container: HTMLElement, options?: BrowserTerminalOptions) {
    this.root = document.createElement("div");
    this.root.className = "terminal-frame";

    this.body = document.createElement("div");
    this.body.className = "terminal-body";
    this.body.tabIndex = 0;

    this.output = document.createElement("div");
    this.output.className = "terminal-output";

    this.tui = document.createElement("pre");
    this.tui.className = "terminal-tui hidden";

    this.input = document.createElement("div");
    this.input.className = "terminal-input";

    this.prompt = document.createElement("span");
    this.prompt.className = "prompt";

    this.line = document.createElement("span");
    this.line.className = "input-line";

    this.input.append(this.prompt, this.line);
    this.body.append(this.output, this.tui, this.input);
    this.root.append(this.body);
    container.append(this.root);

    this.shell = new Shell(this, {
      resetStorage: options?.resetFilesystem,
      system: options?.system
    });

    this.body.addEventListener("keydown", (event) => {
      this.handleKeyDown(event);
    });

    this.root.addEventListener("click", () => {
      this.focus();
    });

    this.renderInput();
  }

  public async boot(): Promise<void> {
    const system = this.shell.getSystemConfig();
    this.println(
      `${system.distributionName} ${system.distributionVersion} (${system.platformName} ${system.platformVersion})`
    );
    this.println("type 'help' to view commands");
    this.focus();
  }

  public async runCommand(command: string): Promise<void> {
    await this.runCommandInternal(command, {
      echo: true,
      clearInput: true,
      recordHistory: true
    });
  }

  public registerProgram(program: ProgramDefinition, options?: RegisterExecutableOptions): void {
    this.shell.registerProgram(program, options);
  }

  public registerExecutable(
    program: ExecutableProgramDefinition,
    options?: RegisterExecutableOptions
  ): void {
    this.shell.registerExecutable(program, options);
  }

  public loadExecutablesIntoVfs(options?: { overwriteGeneratedSources?: boolean }): void {
    this.shell.loadExecutablesIntoVfs(options);
  }

  public shouldSeedHostDefaults(): boolean {
    return this.shell.shouldSeedHostDefaults();
  }

  public getSystemConfig(): ShellSystemConfig {
    return this.shell.getSystemConfig();
  }

  public addFile(path: string, content: string): void {
    this.shell.writeFile(path, content);
  }

  public addDirectory(path: string): void {
    this.shell.mkdir(path);
  }

  public println(message = ""): void {
    const lines = message.split("\n");
    const trailingNewline = lines.length > 1 && lines[lines.length - 1] === "";
    const rows = trailingNewline ? lines.slice(0, -1) : lines;

    for (const line of rows) {
      const row = document.createElement("div");
      row.className = "output-row";
      if (line.includes("\u001b[")) {
        row.append(this.renderAnsiText(line));
      } else {
        row.textContent = line;
      }
      this.output.append(row);
    }

    this.scrollToBottom();
  }

  public clear(): void {
    this.output.replaceChildren();
  }

  public disconnect(message?: string): void {
    if (!this.connected) {
      return;
    }

    this.connected = false;
    this.resetTabCycle();

    if (this.secretPrompt) {
      const pending = this.secretPrompt;
      this.secretPrompt = null;
      pending.resolve(null);
    }

    if (this.tuiSession) {
      this.endTuiSession();
    }

    this.inputBuffer = "";
    this.cursor = 0;
    this.input.classList.add("hidden");

    if (message) {
      this.println(message);
    }
  }

  public async readSecret(prompt: string): Promise<string | null> {
    if (!this.connected || this.mode !== "shell") {
      return null;
    }

    if (this.secretPrompt) {
      return null;
    }

    this.resetTabCycle();
    this.inputBuffer = "";
    this.cursor = 0;
    this.renderInput();
    this.focus();

    return new Promise<string | null>((resolve) => {
      this.secretPrompt = {
        prompt,
        resolve
      };
      this.renderInput();
    });
  }

  public async runTui(program: TuiProgram): Promise<void> {
    if (!this.connected) {
      return;
    }

    if (this.tuiSession) {
      this.println("a tui app is already running");
      return;
    }

    this.mode = "tui";
    this.input.classList.add("hidden");
    this.tui.classList.remove("hidden");

    const size = this.getTuiSize();
    const buffer = new FrameBuffer(size.width, size.height);

    await new Promise<void>((resolve) => {
      const session: TuiSession = {
        buffer,
        keyHandlers: new Set<(key: TuiKey) => void>(),
        timers: new Set<number>(),
        resolve
      };
      this.tuiSession = session;

      const context: TuiContext = {
        get width() {
          return session.buffer.width;
        },
        get height() {
          return session.buffer.height;
        },
        clear: (fill?: string, style?: TuiStyle) => {
          session.buffer.clear(fill, style);
        },
        fillRect: (
          x: number,
          y: number,
          width: number,
          height: number,
          fill?: string,
          style?: TuiStyle
        ) => {
          session.buffer.fillRect(x, y, width, height, fill, style);
        },
        write: (x: number, y: number, text: string, style?: TuiStyle) => {
          session.buffer.write(x, y, text, style);
        },
        text: (x: number, y: number, text: string, options?: TextOptions) => {
          session.buffer.text(x, y, text, options);
        },
        line: (x1: number, y1: number, x2: number, y2: number, char?: string, style?: TuiStyle) => {
          session.buffer.line(x1, y1, x2, y2, char, style);
        },
        box: (
          x: number,
          y: number,
          width: number,
          height: number,
          titleOrOptions?: string | BoxOptions
        ) => {
          session.buffer.box(x, y, width, height, titleOrOptions);
        },
        window: (options: WindowOptions) => {
          session.buffer.window(options);
        },
        progress: (
          x: number,
          y: number,
          width: number,
          ratio: number,
          label?: string,
          options?: ProgressOptions
        ) => {
          session.buffer.progress(x, y, width, ratio, label, options);
        },
        sparkline: (
          x: number,
          y: number,
          width: number,
          values: number[],
          options?: SparklineOptions
        ) => {
          session.buffer.sparkline(x, y, width, values, options);
        },
        list: (options: ListOptions) => {
          session.buffer.list(options);
        },
        table: (options: TableOptions) => {
          session.buffer.table(options);
        },
        render: () => {
          this.tui.innerHTML = session.buffer.toHtml();
        },
        onKey: (handler: (key: TuiKey) => void) => {
          session.keyHandlers.add(handler);
          return () => {
            session.keyHandlers.delete(handler);
          };
        },
        interval: (ms: number, callback: () => void) => {
          const id = window.setInterval(callback, ms);
          session.timers.add(id);
          return () => {
            window.clearInterval(id);
            session.timers.delete(id);
          };
        },
        timeout: (ms: number, callback: () => void) => {
          const id = window.setTimeout(() => {
            session.timers.delete(id);
            callback();
          }, ms);
          session.timers.add(id);
          return () => {
            window.clearTimeout(id);
            session.timers.delete(id);
          };
        },
        exit: (message?: string) => {
          this.endTuiSession(message);
        }
      };

      context.clear();
      context.render();
      this.scrollToBottom();

      try {
        const maybePromise = program(context);
        if (maybePromise instanceof Promise) {
          void maybePromise.catch((error) => {
            const text = error instanceof Error ? error.message : String(error);
            this.println(`tui app error: ${text}`);
            this.endTuiSession("tui app aborted");
          });
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        this.println(`tui app error: ${text}`);
        this.endTuiSession("tui app aborted");
      }
    });
  }

  private endTuiSession(message?: string): void {
    const session = this.tuiSession;
    if (!session) {
      return;
    }

    if (message) {
      session.exitMessage = message;
    }

    for (const id of session.timers) {
      window.clearTimeout(id);
    }
    session.timers.clear();
    session.keyHandlers.clear();

    this.tuiSession = null;
    this.mode = "shell";
    if (this.connected) {
      this.input.classList.remove("hidden");
    } else {
      this.input.classList.add("hidden");
    }
    this.tui.classList.add("hidden");

    if (session.exitMessage) {
      this.println(session.exitMessage);
    }

    session.resolve();
    this.renderInput();
    if (this.connected) {
      this.focus();
    }
  }

  private async submit(): Promise<void> {
    const command = this.inputBuffer;
    await this.runCommandInternal(command, {
      echo: true,
      clearInput: true,
      recordHistory: true
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.connected) {
      return;
    }

    if (this.mode === "tui") {
      this.handleTuiKeyDown(event);
      return;
    }

    if (this.secretPrompt) {
      this.handleSecretPromptKeyDown(event);
      return;
    }

    if (this.busy) {
      return;
    }

    if (event.key !== "Tab") {
      this.resetTabCycle();
    }

    if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      this.clear();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void this.submit();
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (this.cursor > 0) {
        this.inputBuffer =
          this.inputBuffer.slice(0, this.cursor - 1) + this.inputBuffer.slice(this.cursor);
        this.cursor -= 1;
        this.renderInput();
      }
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      if (this.cursor < this.inputBuffer.length) {
        this.inputBuffer =
          this.inputBuffer.slice(0, this.cursor) + this.inputBuffer.slice(this.cursor + 1);
        this.renderInput();
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.cursor = Math.max(0, this.cursor - 1);
      this.renderInput();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.cursor = Math.min(this.inputBuffer.length, this.cursor + 1);
      this.renderInput();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (this.history.length > 0) {
        this.historyIndex = Math.max(0, this.historyIndex - 1);
        this.inputBuffer = this.history[this.historyIndex] ?? "";
        this.cursor = this.inputBuffer.length;
        this.renderInput();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (this.history.length === 0) {
        return;
      }

      this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
      this.inputBuffer = this.history[this.historyIndex] ?? "";
      this.cursor = this.inputBuffer.length;
      this.renderInput();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      this.cursor = 0;
      this.renderInput();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      this.cursor = this.inputBuffer.length;
      this.renderInput();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      this.handleTabCompletion();
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      this.inputBuffer =
        this.inputBuffer.slice(0, this.cursor) + event.key + this.inputBuffer.slice(this.cursor);
      this.cursor += 1;
      this.renderInput();
    }
  }

  private handleTuiKeyDown(event: KeyboardEvent): void {
    const session = this.tuiSession;
    if (!session) {
      return;
    }

    event.preventDefault();
    const key: TuiKey = {
      key: event.key,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey
    };

    for (const handler of session.keyHandlers) {
      handler(key);
    }
  }

  private handleSecretPromptKeyDown(event: KeyboardEvent): void {
    const session = this.secretPrompt;
    if (!session) {
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      this.resolveSecretPrompt(null);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.resolveSecretPrompt(this.inputBuffer);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.resolveSecretPrompt(null);
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (this.cursor > 0) {
        this.inputBuffer =
          this.inputBuffer.slice(0, this.cursor - 1) + this.inputBuffer.slice(this.cursor);
        this.cursor -= 1;
        this.renderInput();
      }
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      if (this.cursor < this.inputBuffer.length) {
        this.inputBuffer =
          this.inputBuffer.slice(0, this.cursor) + this.inputBuffer.slice(this.cursor + 1);
        this.renderInput();
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.cursor = Math.max(0, this.cursor - 1);
      this.renderInput();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.cursor = Math.min(this.inputBuffer.length, this.cursor + 1);
      this.renderInput();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      this.cursor = 0;
      this.renderInput();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      this.cursor = this.inputBuffer.length;
      this.renderInput();
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      this.inputBuffer =
        this.inputBuffer.slice(0, this.cursor) + event.key + this.inputBuffer.slice(this.cursor);
      this.cursor += 1;
      this.renderInput();
    }
  }

  private resolveSecretPrompt(value: string | null): void {
    const session = this.secretPrompt;
    if (!session) {
      return;
    }

    this.secretPrompt = null;
    this.inputBuffer = "";
    this.cursor = 0;
    this.renderInput();
    this.focus();
    session.resolve(value);
  }

  private renderInput(): void {
    const activePrompt = this.secretPrompt?.prompt ?? this.shell.getPrompt();
    this.prompt.textContent = activePrompt;

    const visibleBuffer = this.secretPrompt ? "" : this.inputBuffer;

    const before = document.createElement("span");
    before.textContent = visibleBuffer.slice(0, this.cursor);

    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = visibleBuffer[this.cursor] ?? " ";

    const after = document.createElement("span");
    after.textContent = visibleBuffer.slice(this.cursor + 1);

    this.line.replaceChildren(before, cursor, after);
  }

  private handleTabCompletion(): void {
    if (this.tabCycle) {
      this.applyTabCycle();
      return;
    }

    const completion = this.getCompletionState();
    if (!completion) {
      return;
    }

    const { tokenStart, tokenEnd, tokenPrefix, suggestions } = completion;

    if (suggestions.length === 0) {
      return;
    }

    if (suggestions.length === 1) {
      const replacement = suggestions[0] ?? tokenPrefix;
      const needsTrailingSpace = this.cursor === tokenEnd && !replacement.endsWith("/");
      this.replaceToken(tokenStart, tokenEnd, `${replacement}${needsTrailingSpace ? " " : ""}`);
      return;
    }

    const commonPrefix = this.longestCommonPrefix(suggestions);
    if (commonPrefix.length > tokenPrefix.length) {
      this.replaceToken(tokenStart, tokenEnd, commonPrefix);
      return;
    }

    this.println(suggestions.join("  "));
    this.scrollToBottom();
    this.tabCycle = {
      left: this.inputBuffer.slice(0, tokenStart),
      right: this.inputBuffer.slice(tokenEnd),
      options: [...suggestions],
      index: 0
    };
  }

  private getCompletionState(): CompletionState | null {
    const tokenStart = this.findTokenStart(this.cursor);
    const tokenEnd = this.findTokenEnd(this.cursor);
    const tokenPrefix = this.inputBuffer.slice(tokenStart, this.cursor);

    const beforeToken = this.inputBuffer.slice(0, tokenStart);
    const pipelineSegment = beforeToken.split("|").slice(-1)[0] ?? "";
    const segmentTokens =
      pipelineSegment.trim().length === 0 ? [] : pipelineSegment.trim().split(/\s+/);
    const completingCommand = segmentTokens.length === 0;

    const suggestions =
      completingCommand
        ? this.shell.completeCommand(tokenPrefix)
        : this.shell.completePath(tokenPrefix);

    return {
      tokenStart,
      tokenEnd,
      tokenPrefix,
      suggestions
    };
  }

  private applyTabCycle(): void {
    const cycle = this.tabCycle;
    if (!cycle || cycle.options.length === 0) {
      return;
    }

    const option = cycle.options[cycle.index] ?? cycle.options[0] ?? "";
    cycle.index = (cycle.index + 1) % cycle.options.length;

    this.inputBuffer = `${cycle.left}${option}${cycle.right}`;
    this.cursor = cycle.left.length + option.length;
    this.renderInput();
  }

  private resetTabCycle(): void {
    this.tabCycle = null;
  }

  private replaceToken(tokenStart: number, tokenEnd: number, replacement: string): void {
    this.inputBuffer =
      this.inputBuffer.slice(0, tokenStart) + replacement + this.inputBuffer.slice(tokenEnd);
    this.cursor = tokenStart + replacement.length;
    this.renderInput();
  }

  private findTokenStart(index: number): number {
    let cursor = index;
    while (cursor > 0 && !this.isCompletionBoundary(this.inputBuffer[cursor - 1] ?? "")) {
      cursor -= 1;
    }
    return cursor;
  }

  private findTokenEnd(index: number): number {
    let cursor = index;
    while (
      cursor < this.inputBuffer.length &&
      !this.isCompletionBoundary(this.inputBuffer[cursor] ?? "")
    ) {
      cursor += 1;
    }
    return cursor;
  }

  private isCompletionBoundary(char: string): boolean {
    return /\s/.test(char) || char === "|" || char === ">";
  }

  private longestCommonPrefix(values: string[]): string {
    if (values.length === 0) {
      return "";
    }

    let prefix = values[0] ?? "";
    for (let i = 1; i < values.length; i += 1) {
      const value = values[i] ?? "";
      while (!value.startsWith(prefix) && prefix.length > 0) {
        prefix = prefix.slice(0, -1);
      }
      if (prefix.length === 0) {
        break;
      }
    }

    return prefix;
  }

  private renderAnsiText(text: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    const style: AnsiStyleState = {
      bold: false,
      dim: false
    };

    const appendSegment = (segment: string): void => {
      if (segment.length === 0) {
        return;
      }

      if (!style.bold && !style.dim && !style.fg && !style.bg) {
        fragment.append(document.createTextNode(segment));
        return;
      }

      const span = document.createElement("span");
      if (style.bold) {
        span.classList.add("ansi-bold");
      }
      if (style.dim) {
        span.classList.add("ansi-dim");
      }
      if (style.fg) {
        span.classList.add(`ansi-fg-${style.fg}`);
      }
      if (style.bg) {
        span.classList.add(`ansi-bg-${style.bg}`);
      }
      span.textContent = segment;
      fragment.append(span);
    };

    while (cursor < text.length) {
      const esc = text.indexOf("\u001b[", cursor);
      if (esc < 0) {
        appendSegment(text.slice(cursor));
        break;
      }

      appendSegment(text.slice(cursor, esc));

      const end = text.indexOf("m", esc + 2);
      if (end < 0) {
        appendSegment(text.slice(esc));
        break;
      }

      const rawCodes = text.slice(esc + 2, end);
      const codes =
        rawCodes.length === 0
          ? [0]
          : rawCodes
              .split(";")
              .map((value) => Number.parseInt(value, 10))
              .filter((value) => Number.isFinite(value));
      this.applyAnsiCodes(style, codes);
      cursor = end + 1;
    }

    return fragment;
  }

  private applyAnsiCodes(style: AnsiStyleState, codes: number[]): void {
    for (const code of codes) {
      if (code === 0) {
        style.bold = false;
        style.dim = false;
        style.fg = undefined;
        style.bg = undefined;
        continue;
      }
      if (code === 1) {
        style.bold = true;
        continue;
      }
      if (code === 2) {
        style.dim = true;
        continue;
      }
      if (code === 22) {
        style.bold = false;
        style.dim = false;
        continue;
      }
      if (code === 39) {
        style.fg = undefined;
        continue;
      }
      if (code === 49) {
        style.bg = undefined;
        continue;
      }

      if (code >= 30 && code <= 37) {
        style.fg = this.mapAnsiColorCode(code - 30);
        continue;
      }
      if (code >= 90 && code <= 97) {
        style.fg = this.mapAnsiColorCode(code - 90);
        continue;
      }
      if (code >= 40 && code <= 47) {
        style.bg = this.mapAnsiColorCode(code - 40);
        continue;
      }
      if (code >= 100 && code <= 107) {
        style.bg = this.mapAnsiColorCode(code - 100);
      }
    }
  }

  private mapAnsiColorCode(code: number): string {
    switch (code) {
      case 0:
        return "black";
      case 1:
        return "red";
      case 2:
        return "green";
      case 3:
        return "yellow";
      case 4:
        return "blue";
      case 5:
        return "magenta";
      case 6:
        return "cyan";
      default:
        return "white";
    }
  }

  private async runCommandInternal(
    command: string,
    options: {
      echo: boolean;
      clearInput: boolean;
      recordHistory: boolean;
    }
  ): Promise<void> {
    if (!this.connected || this.busy || this.mode !== "shell" || this.secretPrompt) {
      return;
    }

    this.resetTabCycle();

    if (options.echo) {
      this.println(`${this.shell.getPrompt()}${command}`);
    }

    if (options.recordHistory && command.trim().length > 0) {
      this.history.push(command);
      this.historyIndex = this.history.length;
    }

    if (options.clearInput) {
      this.inputBuffer = "";
      this.cursor = 0;
      this.renderInput();
    }

    this.busy = true;
    try {
      await this.shell.execute(command);
    } finally {
      this.busy = false;
      this.renderInput();
      this.scrollToBottom();
    }
  }

  private scrollToBottom(): void {
    this.body.scrollTop = this.body.scrollHeight;
  }

  private focus(): void {
    this.body.focus();
  }

  private getTuiSize(): { width: number; height: number } {
    const cellWidth = 8.2;
    const cellHeight = 17.2;
    const rawWidth = Math.floor(this.body.clientWidth / cellWidth) - 2;
    const rawHeight = Math.floor(this.body.clientHeight / cellHeight) - 1;
    const width = Math.max(MIN_TUI_COLS, Math.min(MAX_TUI_COLS, rawWidth));
    const height = Math.max(MIN_TUI_ROWS, Math.min(MAX_TUI_ROWS, rawHeight));
    return { width, height };
  }
}
