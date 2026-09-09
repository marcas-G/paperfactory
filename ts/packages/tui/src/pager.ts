/**
 * 报告分页器 —— 全屏阅读模式（`r` 键 / `:report` 进入，q 退出）。
 *
 * 纯函数、无 IO：index.ts 持有 PagerState，按键驱动 page 前后翻，
 * 单测直接断言切片与页数边界。
 *
 * 按键：空格/PageDown/j 下一页 · b/PageUp/k 上一页 · g 首页 · G 末页 · q/Esc 退出
 */

export interface PagerState {
  /** 已渲染的报告逻辑行（renderMarkdown 输出） */
  lines: string[];
  /** 当前页（0-based） */
  page: number;
  /** 每页可视行数（预留头尾两行给标题/按键提示） */
  rows: number;
}

export interface PagerView {
  /** 当前页行切片 */
  slice: string[];
  /** 总页数（至少 1） */
  pages: number;
  /** 页脚状态：`报告 2/5 · 空格下一页 · b 上一页 · q 退出` */
  footer: string;
  /** 是否已达末页（空格在末页时退出） */
  atEnd: boolean;
}

export function createPager(lines: string[], rows: number): PagerState {
  return { lines, page: 0, rows: Math.max(1, rows) };
}

export function pageCount(totalLines: number, rows: number): number {
  if (rows <= 0) return 1;
  return Math.max(1, Math.ceil(totalLines / rows));
}

export function clampPage(page: number, totalLines: number, rows: number): number {
  return Math.min(Math.max(0, page), pageCount(totalLines, rows) - 1);
}

export function pageSlice(lines: string[], page: number, rows: number): string[] {
  const clamped = clampPage(page, lines.length, rows);
  return lines.slice(clamped * rows, clamped * rows + rows);
}

/** 组装当前页视图（切片 + 页脚 + atEnd） */
export function pagerView(state: PagerState): PagerView {
  const pages = pageCount(state.lines.length, state.rows);
  const page = clampPage(state.page, state.lines.length, state.rows);
  const slice = pageSlice(state.lines, page, state.rows);
  const atEnd = page >= pages - 1;
  const footer = `报告 ${page + 1}/${pages} · ${state.lines.length} 行 · 空格下一页 · b 上一页 · ${atEnd ? "空格/q 退出" : "q 退出"}`;
  return { slice, pages, footer, atEnd };
}

/** 翻页动作：next/prev/first/last，返回更新后的 page（已钳制） */
export function pagerMove(state: PagerState, action: "next" | "prev" | "first" | "last"): number {
  switch (action) {
    case "next":
      state.page = clampPage(state.page + 1, state.lines.length, state.rows);
      break;
    case "prev":
      state.page = clampPage(state.page - 1, state.lines.length, state.rows);
      break;
    case "first":
      state.page = 0;
      break;
    case "last":
      state.page = pageCount(state.lines.length, state.rows) - 1;
      break;
  }
  return state.page;
}
