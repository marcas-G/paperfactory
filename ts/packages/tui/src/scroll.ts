/**
 * 主区域滚动 —— 内存 buffer 上的视口管理（非终端 scrollback）。
 *
 * 纯函数、无 IO：index.ts 持有 ScrollState，↑/↓/PgUp/PgDn 驱动偏移，
 * End/开始打字回底（恢复自动跟随），每帧渲染前用 buffer 总行数钳制。
 *
 * 语义：offset = 距底部偏移行数（0 = 跟随底部，新内容自动滚入；
 * >0 = 停在历史位置，距底部距离恒定，新内容到达时视口不跳）。
 */

export interface ScrollState {
  /** 距底部偏移行数（0 = 自动跟随底部） */
  offset: number;
  /** 上一帧主区域逻辑行总数（keypress 时钳制偏移用） */
  total: number;
}

export function createScroll(): ScrollState {
  return { offset: 0, total: 0 };
}

/** 可滚动的最大偏移（buffer 不满一屏时为 0，即无滚动空间） */
export function maxOffset(totalLines: number, viewportRows: number): number {
  return Math.max(0, totalLines - viewportRows);
}

/**
 * 相对滚动：delta > 0 向上（回看历史），delta < 0 向下。
 * 钳制到 [0, maxOffset]；到底自动恢复跟随（offset = 0）。
 */
export function scrollBy(state: ScrollState, delta: number, viewportRows: number): number {
  const max = maxOffset(state.total, viewportRows);
  state.offset = Math.min(Math.max(0, state.offset + delta), max);
  return state.offset;
}

/** 跳回底部：恢复自动跟随模式 */
export function snapToBottom(state: ScrollState): void {
  state.offset = 0;
}

/** 每帧渲染后同步 buffer 总行数（内容变短/清屏时把偏移钳回合法范围） */
export function updateTotal(state: ScrollState, totalLines: number, viewportRows: number): void {
  state.total = totalLines;
  state.offset = Math.min(state.offset, maxOffset(totalLines, viewportRows));
}

/** 视口切片的行区间 [start, end)（0-based、闭开；end = len - offset） */
export function viewRange(totalLines: number, offset: number, rows: number): { start: number; end: number } {
  const end = Math.max(0, totalLines - offset);
  const start = Math.max(0, end - rows);
  return { start, end };
}

/** 按偏移切出可视行（offset = 0 等价于取尾部 rows 行） */
export function viewSlice(lines: string[], offset: number, rows: number): string[] {
  const { start, end } = viewRange(lines.length, offset, rows);
  return lines.slice(start, end);
}

/** 是否处于回看状态（滚动提示条的显示条件） */
export function isScrolled(state: ScrollState): boolean {
  return state.offset > 0;
}
