const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const chars = (text: string): string[] => {
  return Array.from(text);
};

const textLength = (text: string): number => {
  return chars(text).length;
};

const truncateToWidth = (text: string, width: number, ellipsis: boolean): string => {
  const safeWidth = Math.max(0, width);
  if (safeWidth === 0) {
    return "";
  }

  const glyphs = chars(text);
  if (glyphs.length <= safeWidth) {
    return text;
  }

  if (ellipsis && safeWidth > 1) {
    return `${glyphs.slice(0, safeWidth - 1).join("")}…`;
  }

  return glyphs.slice(0, safeWidth).join("");
};

const padAligned = (text: string, width: number, align: TextAlign): string => {
  const safeWidth = Math.max(0, width);
  const len = textLength(text);
  if (len >= safeWidth) {
    return text;
  }

  const space = " ".repeat(safeWidth - len);
  if (align === "right") {
    return `${space}${text}`;
  }

  if (align === "center") {
    const left = Math.floor((safeWidth - len) / 2);
    const right = safeWidth - len - left;
    return `${" ".repeat(left)}${text}${" ".repeat(right)}`;
  }

  return `${text}${space}`;
};

const fitText = (text: string, width: number, align: TextAlign, ellipsis: boolean): string => {
  return padAligned(truncateToWidth(text, width, ellipsis), width, align);
};

const wrapToWidth = (text: string, width: number): string[] => {
  const safeWidth = Math.max(1, width);
  const lines: string[] = [];

  for (const rawLine of text.split("\n")) {
    const glyphs = chars(rawLine);
    if (glyphs.length === 0) {
      lines.push("");
      continue;
    }

    for (let i = 0; i < glyphs.length; i += safeWidth) {
      lines.push(glyphs.slice(i, i + safeWidth).join(""));
    }
  }

  return lines;
};

const sampleSeries = (values: number[], count: number): number[] => {
  if (count <= 0) {
    return [];
  }

  if (values.length === 0) {
    return Array.from({ length: count }, () => 0);
  }

  if (values.length === 1) {
    return Array.from({ length: count }, () => values[0] ?? 0);
  }

  if (count === 1) {
    return [values[values.length - 1] ?? 0];
  }

  const sampled: number[] = [];
  const span = values.length - 1;

  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i / (count - 1)) * span);
    sampled.push(values[index] ?? 0);
  }

  return sampled;
};

const computeColumnWidths = (requested: number[], innerWidth: number): number[] => {
  if (requested.length === 0 || innerWidth <= 0) {
    return [];
  }

  const widths = requested.map((width) => Math.max(1, width));
  const separators = widths.length - 1;
  let total = widths.reduce((sum, width) => sum + width, 0) + separators;

  while (total > innerWidth) {
    let largestIndex = -1;

    for (let i = 0; i < widths.length; i += 1) {
      const width = widths[i] ?? 0;
      if (width > 1 && (largestIndex < 0 || width > (widths[largestIndex] ?? 0))) {
        largestIndex = i;
      }
    }

    if (largestIndex < 0) {
      break;
    }

    widths[largestIndex] = (widths[largestIndex] ?? 1) - 1;
    total -= 1;
  }

  while (total < innerWidth) {
    widths[widths.length - 1] = (widths[widths.length - 1] ?? 1) + 1;
    total += 1;
  }

  return widths;
};

const makeTableRow = (cellsText: string[], widths: number[], aligns: TextAlign[]): string => {
  const cellsOut: string[] = [];

  for (let i = 0; i < widths.length; i += 1) {
    const width = widths[i] ?? 0;
    const raw = cellsText[i] ?? "";
    const align = aligns[i] ?? "left";
    cellsOut.push(fitText(raw, width, align, true));
  }

  return cellsOut.join("│");
};

export interface TuiKey {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

export type TuiColor =
  | "default"
  | "black"
  | "white"
  | "gray"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan";

export interface TuiStyle {
  fg?: TuiColor;
  bg?: TuiColor;
  bold?: boolean;
  dim?: boolean;
}

export type BorderStyle = "single" | "rounded" | "double" | "heavy";
export type TextAlign = "left" | "center" | "right";

export interface BoxOptions {
  title?: string;
  border?: BorderStyle;
  style?: TuiStyle;
  titleStyle?: TuiStyle;
}

export interface TextOptions {
  width?: number;
  height?: number;
  align?: TextAlign;
  wrap?: boolean;
  ellipsis?: boolean;
  style?: TuiStyle;
}

export interface WindowOptions extends BoxOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  lines?: string[];
  lineStyle?: TuiStyle;
}

export interface ProgressOptions {
  style?: TuiStyle;
  emptyStyle?: TuiStyle;
  labelStyle?: TuiStyle;
  charset?: "ascii" | "blocks";
}

export interface SparklineOptions {
  style?: TuiStyle;
  charset?: "bars" | "ascii";
  min?: number;
  max?: number;
}

export interface ListOptions extends BoxOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  items: string[];
  selectedIndex?: number;
  offset?: number;
  marker?: string;
  itemStyle?: TuiStyle;
  selectedStyle?: TuiStyle;
  emptyText?: string;
  emptyStyle?: TuiStyle;
}

export interface TableColumn {
  title: string;
  width: number;
  align?: TextAlign;
}

export interface TableOptions extends BoxOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  columns: TableColumn[];
  rows: Array<Array<string | number>>;
  rowOffset?: number;
  selectedRow?: number;
  headerStyle?: TuiStyle;
  rowStyle?: TuiStyle;
  selectedStyle?: TuiStyle;
  zebra?: boolean;
}

interface ResolvedStyle {
  fg: TuiColor;
  bg: TuiColor;
  bold: boolean;
  dim: boolean;
  key: string;
}

interface Cell {
  char: string;
  style: ResolvedStyle;
}

export interface TuiContext {
  readonly width: number;
  readonly height: number;
  clear(fill?: string, style?: TuiStyle): void;
  fillRect(x: number, y: number, width: number, height: number, fill?: string, style?: TuiStyle): void;
  write(x: number, y: number, text: string, style?: TuiStyle): void;
  text(x: number, y: number, text: string, options?: TextOptions): void;
  line(x1: number, y1: number, x2: number, y2: number, char?: string, style?: TuiStyle): void;
  box(
    x: number,
    y: number,
    width: number,
    height: number,
    titleOrOptions?: string | BoxOptions
  ): void;
  window(options: WindowOptions): void;
  progress(
    x: number,
    y: number,
    width: number,
    ratio: number,
    label?: string,
    options?: ProgressOptions
  ): void;
  sparkline(x: number, y: number, width: number, values: number[], options?: SparklineOptions): void;
  list(options: ListOptions): void;
  table(options: TableOptions): void;
  render(): void;
  onKey(handler: (key: TuiKey) => void): () => void;
  onPaste(handler: (text: string) => void): () => void;
  interval(ms: number, callback: () => void): () => void;
  timeout(ms: number, callback: () => void): () => void;
  exit(message?: string): void;
}

export type TuiProgram = (context: TuiContext) => void | Promise<void>;

interface BorderChars {
  top: string;
  bottom: string;
  left: string;
  right: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
}

const BORDER_MAP: Record<BorderStyle, BorderChars> = {
  single: {
    top: "─",
    bottom: "─",
    left: "│",
    right: "│",
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘"
  },
  rounded: {
    top: "─",
    bottom: "─",
    left: "│",
    right: "│",
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯"
  },
  double: {
    top: "═",
    bottom: "═",
    left: "║",
    right: "║",
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝"
  },
  heavy: {
    top: "━",
    bottom: "━",
    left: "┃",
    right: "┃",
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛"
  }
};

const DEFAULT_STYLE: ResolvedStyle = {
  fg: "default",
  bg: "default",
  bold: false,
  dim: false,
  key: "default|default|0|0"
};

const normalizeStyle = (style?: TuiStyle): ResolvedStyle => {
  if (!style) {
    return DEFAULT_STYLE;
  }

  const fg = style.fg ?? "default";
  const bg = style.bg ?? "default";
  const bold = Boolean(style.bold);
  const dim = Boolean(style.dim);

  if (fg === "default" && bg === "default" && !bold && !dim) {
    return DEFAULT_STYLE;
  }

  return {
    fg,
    bg,
    bold,
    dim,
    key: `${fg}|${bg}|${bold ? "1" : "0"}|${dim ? "1" : "0"}`
  };
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

const styleClassName = (style: ResolvedStyle): string => {
  const classes: string[] = [];

  if (style.fg !== "default") {
    classes.push(`tui-fg-${style.fg}`);
  }

  if (style.bg !== "default") {
    classes.push(`tui-bg-${style.bg}`);
  }

  if (style.bold) {
    classes.push("tui-bold");
  }

  if (style.dim) {
    classes.push("tui-dim");
  }

  return classes.join(" ");
};

const parseBoxOptions = (titleOrOptions?: string | BoxOptions): BoxOptions => {
  if (typeof titleOrOptions === "string") {
    return { title: titleOrOptions };
  }

  return titleOrOptions ?? {};
};

export class FrameBuffer {
  public readonly width: number;
  public readonly height: number;
  private readonly grid: Cell[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = Array.from({ length: height }, () => {
      return Array.from({ length: width }, () => ({ char: " ", style: DEFAULT_STYLE }));
    });
  }

  public clear(fill = " ", style?: TuiStyle): void {
    this.fillRect(0, 0, this.width, this.height, fill, style);
  }

  public fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill = " ",
    style?: TuiStyle
  ): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    const char = fill[0] ?? " ";
    const resolved = normalizeStyle(style);

    const left = clamp(x, 0, this.width);
    const top = clamp(y, 0, this.height);
    const right = clamp(x + width, 0, this.width);
    const bottom = clamp(y + height, 0, this.height);

    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        this.grid[py][px] = { char, style: resolved };
      }
    }
  }

  public write(x: number, y: number, text: string, style?: TuiStyle): void {
    if (y < 0 || y >= this.height) {
      return;
    }

    const resolved = normalizeStyle(style);
    let cursorX = x;

    for (const char of text) {
      if (cursorX >= this.width) {
        break;
      }

      if (cursorX >= 0) {
        this.grid[y][cursorX] = { char, style: resolved };
      }

      cursorX += 1;
    }
  }

  public text(x: number, y: number, textValue: string, options?: TextOptions): void {
    const align = options?.align ?? "left";
    const ellipsis = options?.ellipsis ?? true;
    const style = options?.style;

    if (options?.wrap) {
      const width = options.width ?? Math.max(1, this.width - x);
      const wrapped = wrapToWidth(textValue, width);
      const maxLines = options.height ?? wrapped.length;
      const visible = wrapped.slice(0, Math.max(0, maxLines));

      for (let i = 0; i < visible.length; i += 1) {
        const raw = visible[i] ?? "";
        const line = fitText(raw, width, align, false);
        this.write(x, y + i, line, style);
      }

      if (visible.length < wrapped.length && visible.length > 0 && ellipsis) {
        const lastY = y + visible.length - 1;
        const last = visible[visible.length - 1] ?? "";
        this.write(x, lastY, fitText(last, width, align, true), style);
      }

      return;
    }

    if (options?.width) {
      this.write(x, y, fitText(textValue, options.width, align, ellipsis), style);
      return;
    }

    this.write(x, y, textValue, style);
  }

  public line(x1: number, y1: number, x2: number, y2: number, char = "•", style?: TuiStyle): void {
    const glyph = char[0] ?? "•";

    let currentX = Math.round(x1);
    let currentY = Math.round(y1);
    const targetX = Math.round(x2);
    const targetY = Math.round(y2);

    const dx = Math.abs(targetX - currentX);
    const sx = currentX < targetX ? 1 : -1;
    const dy = -Math.abs(targetY - currentY);
    const sy = currentY < targetY ? 1 : -1;
    let err = dx + dy;

    while (true) {
      this.write(currentX, currentY, glyph, style);
      if (currentX === targetX && currentY === targetY) {
        break;
      }

      const twiceErr = err * 2;
      if (twiceErr >= dy) {
        err += dy;
        currentX += sx;
      }
      if (twiceErr <= dx) {
        err += dx;
        currentY += sy;
      }
    }
  }

  public box(
    x: number,
    y: number,
    width: number,
    height: number,
    titleOrOptions?: string | BoxOptions
  ): void {
    if (width < 2 || height < 2) {
      return;
    }

    const options = parseBoxOptions(titleOrOptions);
    const border = BORDER_MAP[options.border ?? "single"];
    const borderStyle = options.style;

    const left = clamp(x, 0, this.width - 1);
    const top = clamp(y, 0, this.height - 1);
    const right = clamp(x + width - 1, 0, this.width - 1);
    const bottom = clamp(y + height - 1, 0, this.height - 1);

    for (let px = left + 1; px < right; px += 1) {
      this.write(px, top, border.top, borderStyle);
      this.write(px, bottom, border.bottom, borderStyle);
    }

    for (let py = top + 1; py < bottom; py += 1) {
      this.write(left, py, border.left, borderStyle);
      this.write(right, py, border.right, borderStyle);
    }

    this.write(left, top, border.topLeft, borderStyle);
    this.write(right, top, border.topRight, borderStyle);
    this.write(left, bottom, border.bottomLeft, borderStyle);
    this.write(right, bottom, border.bottomRight, borderStyle);

    if (options.title) {
      this.write(left + 2, top, ` ${options.title} `, options.titleStyle ?? borderStyle);
    }
  }

  public window(options: WindowOptions): void {
    this.box(options.x, options.y, options.width, options.height, {
      title: options.title,
      border: options.border,
      style: options.style,
      titleStyle: options.titleStyle
    });

    const lines = options.lines ?? [];
    const maxLines = Math.max(0, options.height - 2);

    for (let i = 0; i < Math.min(lines.length, maxLines); i += 1) {
      this.write(options.x + 1, options.y + 1 + i, lines[i] ?? "", options.lineStyle);
    }
  }

  public progress(
    x: number,
    y: number,
    width: number,
    ratio: number,
    label?: string,
    options?: ProgressOptions
  ): void {
    const safeRatio = clamp(ratio, 0, 1);
    const barWidth = Math.max(1, width - 2);
    const fillStyle = options?.style;
    const emptyStyle = options?.emptyStyle;
    const charset = options?.charset ?? "blocks";

    const blocks = charset === "blocks" ? "█" : "#";
    const empty = charset === "blocks" ? "░" : ".";

    const filled = Math.round(barWidth * safeRatio);
    const emptyCount = Math.max(0, barWidth - filled);

    this.write(x, y, "[", emptyStyle);
    this.write(x + 1, y, blocks.repeat(filled), fillStyle);
    this.write(x + 1 + filled, y, empty.repeat(emptyCount), emptyStyle);
    this.write(x + 1 + barWidth, y, "]", emptyStyle);

    if (label) {
      this.write(x + width + 1, y, label, options?.labelStyle ?? fillStyle);
    }
  }

  public sparkline(
    x: number,
    y: number,
    width: number,
    values: number[],
    options?: SparklineOptions
  ): void {
    if (width <= 0) {
      return;
    }

    const sampled = sampleSeries(values, width);
    const min = options?.min ?? Math.min(...sampled);
    const max = options?.max ?? Math.max(...sampled);
    const range = max - min || 1;

    const charset =
      options?.charset === "ascii"
        ? [".", ":", "-", "=", "+", "*", "#", "%", "@"]
        : ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

    const out = sampled
      .map((value) => {
        const normalized = clamp((value - min) / range, 0, 1);
        const index = Math.round(normalized * (charset.length - 1));
        return charset[index] ?? charset[0] ?? " ";
      })
      .join("");

    this.write(x, y, out, options?.style);
  }

  public list(options: ListOptions): void {
    this.box(options.x, options.y, options.width, options.height, {
      title: options.title,
      border: options.border,
      style: options.style,
      titleStyle: options.titleStyle
    });

    const innerWidth = Math.max(0, options.width - 2);
    const innerHeight = Math.max(0, options.height - 2);
    if (innerWidth === 0 || innerHeight === 0) {
      return;
    }

    if (options.items.length === 0) {
      this.text(options.x + 1, options.y + 1, options.emptyText ?? "(empty)", {
        width: innerWidth,
        style: options.emptyStyle ?? { fg: "gray", dim: true }
      });
      return;
    }

    let offset = clamp(options.offset ?? 0, 0, Math.max(0, options.items.length - innerHeight));

    if (typeof options.selectedIndex === "number") {
      if (options.selectedIndex < offset) {
        offset = options.selectedIndex;
      }
      if (options.selectedIndex >= offset + innerHeight) {
        offset = options.selectedIndex - innerHeight + 1;
      }
      offset = clamp(offset, 0, Math.max(0, options.items.length - innerHeight));
    }

    for (let row = 0; row < innerHeight; row += 1) {
      const itemIndex = offset + row;
      if (itemIndex >= options.items.length) {
        break;
      }

      const selected = itemIndex === options.selectedIndex;
      const marker = selected ? options.marker ?? "❯" : " ";
      const content = `${marker} ${options.items[itemIndex] ?? ""}`;
      this.text(options.x + 1, options.y + 1 + row, content, {
        width: innerWidth,
        ellipsis: true,
        style: selected
          ? options.selectedStyle ?? { fg: "black", bg: "cyan", bold: true }
          : options.itemStyle
      });
    }
  }

  public table(options: TableOptions): void {
    this.box(options.x, options.y, options.width, options.height, {
      title: options.title,
      border: options.border,
      style: options.style,
      titleStyle: options.titleStyle
    });

    const innerWidth = Math.max(0, options.width - 2);
    const innerHeight = Math.max(0, options.height - 2);
    if (innerWidth === 0 || innerHeight === 0 || options.columns.length === 0) {
      return;
    }

    const widths = computeColumnWidths(
      options.columns.map((column) => column.width),
      innerWidth
    );
    const aligns = options.columns.map((column) => column.align ?? "left");

    const header = makeTableRow(
      options.columns.map((column) => column.title),
      widths,
      aligns
    );

    this.write(options.x + 1, options.y + 1, header, options.headerStyle ?? options.titleStyle ?? options.style);

    if (innerHeight < 2) {
      return;
    }

    this.write(options.x + 1, options.y + 2, "─".repeat(innerWidth), options.style ?? options.headerStyle);

    const rowsArea = innerHeight - 2;
    if (rowsArea <= 0) {
      return;
    }

    if (options.rows.length === 0) {
      this.text(options.x + 1, options.y + 3, "(no rows)", {
        width: innerWidth,
        style: { fg: "gray", dim: true }
      });
      return;
    }

    let offset = clamp(options.rowOffset ?? 0, 0, Math.max(0, options.rows.length - rowsArea));

    if (typeof options.selectedRow === "number") {
      if (options.selectedRow < offset) {
        offset = options.selectedRow;
      }
      if (options.selectedRow >= offset + rowsArea) {
        offset = options.selectedRow - rowsArea + 1;
      }
      offset = clamp(offset, 0, Math.max(0, options.rows.length - rowsArea));
    }

    for (let row = 0; row < rowsArea; row += 1) {
      const index = offset + row;
      if (index >= options.rows.length) {
        break;
      }

      const cellsText = (options.rows[index] ?? []).map((value) => String(value));
      const line = makeTableRow(cellsText, widths, aligns);
      const isSelected = index === options.selectedRow;

      let style = options.rowStyle;
      if (options.zebra && row % 2 === 1) {
        style = { ...(style ?? {}), dim: true };
      }
      if (isSelected) {
        style = options.selectedStyle ?? { fg: "black", bg: "green", bold: true };
      }

      this.write(options.x + 1, options.y + 3 + row, line, style);
    }
  }

  public toString(): string {
    return this.grid.map((line) => line.map((cell) => cell.char).join("")).join("\n");
  }

  public toHtml(): string {
    return this.grid
      .map((line) => {
        if (line.length === 0) {
          return "";
        }

        let html = "";
        let runStyle = line[0]?.style ?? DEFAULT_STYLE;
        let runText = line[0]?.char ?? "";

        for (let i = 1; i < line.length; i += 1) {
          const cell = line[i];
          if (!cell) {
            continue;
          }

          if (cell.style.key === runStyle.key) {
            runText += cell.char;
          } else {
            html += this.renderRun(runText, runStyle);
            runText = cell.char;
            runStyle = cell.style;
          }
        }

        html += this.renderRun(runText, runStyle);
        return html;
      })
      .join("\n");
  }

  private renderRun(text: string, style: ResolvedStyle): string {
    const escaped = escapeHtml(text);

    if (style.key === DEFAULT_STYLE.key) {
      return escaped;
    }

    const classes = styleClassName(style);
    if (!classes) {
      return escaped;
    }

    return `<span class="${classes}">${escaped}</span>`;
  }
}
