/**
 * Screen —— 纯 ANSI 屏幕管理（零依赖）。
 *
 * 布局（整帧单次 write，防闪烁）：
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
 * 策略：主区域内容在调用方维护为行数组，frame() 取尾部
 * rows-6 行整帧重绘（逐行 \x1b[K 清行尾 + \r\n 分隔，不用 \x1b[2J 防闪）。
 * write/size 可注入，单测无需 TTY。
 */
import { padEndDisplay, truncate, visibleWidth, ANSI } from "./render";

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
  /** 当前输入内容 */
  input: string;
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

export class Screen {
  private write: (s: string) => void;
  private fixedSize: { rows: number; cols: number } | null;
  private rows = 24;
  private cols = 80;

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

  /** 清除整屏（不动终端模式） */
  clear(): void {
    this.write("\x1b[2J\x1b[H");
  }

  /** 整帧渲染：compose + 单次 write + 光标落输入行末 */
  frame(input: FrameInput): void {
    const composed = this.composeFrame(input);
    this.write(composed.cursorTo + composed.frame);
  }

  /** 组帧（返回 frame 供单测断言 ANSI 序列；cursorTo 为光标定位序列） */
  composeFrame(input: FrameInput): { frame: string; cursorTo: string } {
    const { rows, cols } = this.size();
    const inner = cols - 2; // 边框内侧宽度
    const content = this.contentCols;

    // ── 顶框：┌─ title ──── suffix ┐（整行填满 cols 宽）
    const titleLeft = `┌─ ${input.title} `;
    const titleRight = ` ${input.titleSuffix} ┐`;
    const titleRow =
      titleLeft + "─".repeat(Math.max(1, cols - visibleWidth(titleLeft) - visibleWidth(titleRight))) + titleRight;

    // ── 主区域：取尾部 mainRows 行，顶补空行（聊天 log 语义：内容贴底）
    const budget = Math.max(1, rows - 6);
    const tail = input.mainLines.slice(-budget);
    const mainRows: string[] = [];
    for (let i = 0; i < budget; i++) {
      const line = tail[i];
      mainRows.push(line === undefined ? "" : truncate(line, content));
    }

    // ── 输入行：`> {input}▊   {hint}`
    const cursorBlock = `${ANSI.dim}▊${ANSI.reset}`;
    let inputBody = `> ${input.input}`;
    const hintPart = `  ${ANSI.dim}${truncate(input.hint, Math.max(1, content - visibleWidth(inputBody) - 4))}${ANSI.reset}`;
    const hintFits = content - visibleWidth(inputBody) - visibleWidth(cursorBlock) - 4 > 8;
    if (hintFits) inputBody += cursorBlock + hintPart;
    else inputBody = truncate(`> ${input.input}${cursorBlock}`, content);

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

    const frame = "\x1b[H" + parts.map((row) => "\x1b[K" + row).join("\r\n");

    // 光标 → 输入行（倒数第 2 行）文本末尾（画不上真光标时也无所谓，块光标已画）
    const inputRow = rows - 1;
    const inputCol = Math.min(cols - 1, 3 + visibleWidth(input.input) + 1);
    const cursorTo = `\x1b[${inputRow};${inputCol}H`;

    return { frame, cursorTo };
  }
}
