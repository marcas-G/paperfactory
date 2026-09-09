/**
 * Screen —— 纯 ANSI 屏幕管理（零依赖）。
 *
 * 布局：
 * ```text
 * ┌─ PaperFactory Research Agent ──── auto ┐   ← 标题行
 * │  主滚动区（buffer 尾部 rows-6 行）        │
 * ├────────────────────────────────────────┤   ← 分隔
 * │  状态栏                                 │   ← 倒数第三行
 * ├────────────────────────────────────────┤
 * │  > 输入行 ▊                             │   ← 最后一行上方
 * └────────────────────────────────────────┘
 * ```
 *
 * 渲染策略（增量优先）：
 *   - frame() 把逻辑行拆成物理行数组，与上一帧 diff —— 只重写变化的行
 *     （`\x1b[{row};1H\x1b[K{line}`），spinner/状态栏更新不再触发整屏重绘，
 *     快速事件流下无闪烁。
 *   - 全帧重绘仅在首帧 / resize / invalidate() 后发生。
 *   - 行尾统一 \x1b[K 清除，不用 \x1b[2J（防闪）。
 * write/size 可注入，单测无需 TTY。
 */
import { padEndDisplay, splitAtDisplay, truncate, visibleWidth, ANSI } from "./render";

export interface FrameInput {
  /** 标题（左） */
  title: string;
  /** 标题右侧 chip（模式/模型） */
  titleSuffix: string;
  /** 主区域逻辑行（超宽由本类截断） */
  mainLines: string[];
  /** 状态栏文本（不含边框） */
  status: string;
  /** 输入行提示（dim 显示在输入后） */
  hint: string;
  /** 当前输入内容（调用方已做水平滚动裁剪） */
  input: string;
  /** 输入光标列偏移（相对 input 显示窗口；缺省 = 行尾） */
  cursorCol?: number;
}

export interface ScreenOptions {
  write?: (s: string) => void;
  rows?: number;
  cols?: number;
}

/** 终端尺寸钳制（防 resize 到极小值时布局崩坏） */
export function clampSize(rows: number, cols: number): { rows: number; cols: number } {
  return { rows: Math.max(8, rows), cols: Math.min(Math.max(20, cols), 200) };
}

/**
 * 帧间 diff —— 返回需要重写的行指令。
 * 行相等判定按整行字符串（含 ANSI），不变化则完全跳过。
 */
export function diffLines(prev: string[] | null, next: string[]): number[] {
  if (prev === null) return next.map((_, i) => i);
  const changed: number[] = [];
  const n = Math.max(prev.length, next.length);
  for (let i = 0; i < n; i++) {
    if (prev[i] !== next[i]) changed.push(i);
  }
  return changed;
}

export class Screen {
  private write: (s: string) => void;
  private fixedSize: { rows: number; cols: number } | null;
  private rows = 24;
  private cols = 80;
  private lastLines: string[] | null = null;
  private lastRows = 0;
  private lastCols = 0;

  constructor(opts: ScreenOptions = {}) {
    this.write = opts.write ?? ((s) => process.stdout.write(s));
    this.fixedSize =
      opts.rows !== undefined && opts.cols !== undefined ? clampSize(opts.rows, opts.cols) : null;
    if (this.fixedSize) {
      this.rows = this.fixedSize.rows;
      this.cols = this.fixedSize.cols;
    }
  }

  /** 主区域可用行数（去掉 6 行框架：顶/底边框 + 两分隔 + 状态栏 + 输入行） */
  get mainRows(): number {
    return Math.max(1, this.size().rows - 6);
  }

  /** 内容区宽度（去掉左右 `│ ` 和 ` │`） */
  get contentCols(): number {
    return Math.max(1, this.size().cols - 4);
  }

  /** 当前尺寸（未注入时 TTY 动态读，跟随 resize；钳制到安全下限） */
  size(): { rows: number; cols: number } {
    if (this.fixedSize) return this.fixedSize;
    const clamped = clampSize(process.stdout.rows ?? 24, process.stdout.columns ?? 80);
    this.rows = clamped.rows;
    this.cols = clamped.cols;
    return { rows: this.rows, cols: this.cols };
  }

  /** 进入 TUI：藏光标 + 清屏回顶 */
  enter(): void {
    this.write("\x1b[?25l\x1b[2J\x1b[H");
  }

  /** 退出 TUI：恢复光标/滚动区 + 清屏回顶（调用方再关 raw mode） */
  exit(): void {
    this.write("\x1b[?25h\x1b[r\x1b[2J\x1b[H");
  }

  /** 清除整屏（不动终端模式）；同时丢弃增量缓存（下一帧全画） */
  clear(): void {
    this.write("\x1b[2J\x1b[H");
    this.invalidate();
  }

  /** 丢弃增量缓存：下一帧强制全量重绘（resize / Ctrl+L / 覆盖层切换后调用） */
  invalidate(): void {
    this.lastLines = null;
  }

  /** 增量渲染：diff 后只写变化行；首帧/resize/失效时整帧（单次 write，防闪烁） */
  frame(input: FrameInput): void {
    const { rows, cols } = this.size();
    const lines = this.buildRows(input, rows, cols);
    const cursorTo = this.cursorSeq(input, rows, cols);
    const sizeChanged = this.lastLines !== null && (this.lastRows !== rows || this.lastCols !== cols);

    if (this.lastLines === null || sizeChanged || this.lastLines.length !== lines.length) {
      this.write("\x1b[H" + lines.map((row) => "\x1b[K" + row).join("\r\n") + cursorTo);
    } else {
      const changed = diffLines(this.lastLines, lines);
      if (changed.length === 0) {
        this.write(cursorTo);
      } else if (changed.length >= lines.length) {
        // 全行变化：整帧更省字节
        this.write("\x1b[H" + lines.map((row) => "\x1b[K" + row).join("\r\n") + cursorTo);
      } else {
        const parts = changed.map((i) => `\x1b[${i + 1};1H\x1b[K${lines[i]}`);
        this.write(parts.join("") + cursorTo);
      }
    }
    this.lastLines = lines;
    this.lastRows = rows;
    this.lastCols = cols;
  }

  /** 组帧（返回整帧字符串供单测断言 ANSI 序列；cursorTo 为光标定位序列） */
  composeFrame(input: FrameInput): { frame: string; cursorTo: string } {
    const { rows, cols } = this.size();
    const lines = this.buildRows(input, rows, cols);
    const frame = "\x1b[H" + lines.map((row) => "\x1b[K" + row).join("\r\n");
    return { frame, cursorTo: this.cursorSeq(input, rows, cols) };
  }

  /** 光标 → 输入行（倒数第 2 行）光标列（画不上真光标时也无所谓，块光标已画） */
  private cursorSeq(input: FrameInput, rows: number, cols: number): string {
    const inputRow = rows - 1;
    const inputCol = Math.min(cols - 1, 3 + (input.cursorCol ?? visibleWidth(input.input)) + 1);
    return `\x1b[${inputRow};${inputCol}H`;
  }

  /** 逻辑帧 → 物理行数组（长度恒等于 rows，主区域贴底） */
  private buildRows(input: FrameInput, rows: number, cols: number): string[] {
    const inner = cols - 2; // 边框内侧宽度
    const content = Math.max(1, cols - 4);

    // ── 顶框：┌─ title ──── suffix ┐（整行填满 cols 宽）
    const titleLeft = `┌─ ${input.title} `;
    const titleRight = ` ${input.titleSuffix} ┐`;
    const titleRow =
      titleLeft + "─".repeat(Math.max(1, cols - visibleWidth(titleLeft) - visibleWidth(titleRight))) + titleRight;

    // ── 主区域：取尾部 rows-6 行，顶补空行（聊天 log 语义：内容贴底）
    const budget = Math.max(1, rows - 6);
    const tail = input.mainLines.slice(-budget);
    const mainRows: string[] = [];
    for (let i = 0; i < budget; i++) {
      const line = tail[i];
      mainRows.push(line === undefined ? "" : truncate(line, content));
    }

    // ── 输入行：`> {before}▊{after}   {hint}`（块光标落在 cursorCol 处）
    const cursorBlock = `${ANSI.dim}▊${ANSI.reset}`;
    const cursorCol = input.cursorCol ?? visibleWidth(input.input);
    const [before, after] = splitAtDisplay(input.input, cursorCol);
    let inputBody = `> ${before}${cursorBlock}${after}`;
    const hintPart = `  ${ANSI.dim}${truncate(input.hint, Math.max(1, content - visibleWidth(inputBody) - 4))}${ANSI.reset}`;
    const hintFits = content - visibleWidth(inputBody) - visibleWidth(cursorBlock) - 4 > 8;
    if (hintFits) inputBody += hintPart;
    else inputBody = truncate(inputBody, content);

    // ── 组帧
    const parts: string[] = [titleRow];
    for (const line of mainRows) {
      parts.push("│ " + padEndDisplay(truncate(line, content), content) + " │");
    }
    parts.push("├" + "─".repeat(inner) + "┤");
    parts.push("│ " + padEndDisplay(truncate(input.status, content), content) + " │");
    parts.push("├" + "─".repeat(inner) + "┤");
    parts.push("│ " + padEndDisplay(truncate(inputBody, content), content) + " │");
    parts.push("└" + "─".repeat(inner) + "┘");
    return parts;
  }
}
