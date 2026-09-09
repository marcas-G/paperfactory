/**
 * pager.ts 单测 —— 报告分页（页数边界/切片/翻页动作/页脚）。
 */
import { describe, it, expect } from "vitest";
import {
  createPager,
  pageCount,
  clampPage,
  pageSlice,
  pagerView,
  pagerMove,
} from "../../packages/tui/src/pager";

describe("pageCount / clampPage", () => {
  it("空报告也是 1 页；行数恰好整除", () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(20, 10)).toBe(2);
    expect(pageCount(21, 10)).toBe(3);
  });

  it("rows 非正钳为 1 页", () => {
    expect(pageCount(50, 0)).toBe(1);
  });

  it("clampPage：负值→0，超界→末页", () => {
    expect(clampPage(-3, 25, 10)).toBe(0);
    expect(clampPage(99, 25, 10)).toBe(2);
    expect(clampPage(1, 25, 10)).toBe(1);
  });
});

describe("pageSlice", () => {
  it("按页切片，越界页钳到末页", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `L${i}`);
    expect(pageSlice(lines, 0, 10)).toEqual(lines.slice(0, 10));
    expect(pageSlice(lines, 2, 10)).toEqual(lines.slice(20, 25)); // 末页只有 5 行
    expect(pageSlice(lines, 7, 10)).toEqual(lines.slice(20, 25)); // 越界钳末页
  });
});

describe("pagerView", () => {
  it("页脚含 当前/总页 与行数；atEnd 在末页为真", () => {
    const p = createPager(Array.from({ length: 30 }, (_, i) => `x${i}`), 10);
    const v1 = pagerView(p);
    expect(v1.pages).toBe(3);
    expect(v1.footer).toContain("1/3");
    expect(v1.footer).toContain("30 行");
    expect(v1.atEnd).toBe(false);
    p.page = 2;
    const v3 = pagerView(p);
    expect(v3.atEnd).toBe(true);
    expect(v3.slice).toHaveLength(10);
  });
});

describe("pagerMove", () => {
  it("next/prev 在边界钳制；first/last 跳转", () => {
    const p = createPager(Array.from({ length: 35 }, (_, i) => `y${i}`), 10); // 4 页
    expect(pagerMove(p, "prev")).toBe(0); // 首页再退不动
    expect(pagerMove(p, "next")).toBe(1);
    expect(pagerMove(p, "next")).toBe(2);
    expect(pagerMove(p, "last")).toBe(3);
    expect(pagerMove(p, "next")).toBe(3); // 末页再进不动
    expect(pagerMove(p, "first")).toBe(0);
  });
});
