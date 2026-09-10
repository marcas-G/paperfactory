/**
 * scroll.ts 单测 —— 主区域滚动位置管理：偏移钳制 / 视口切片 / 回底跟随。
 */
import { describe, it, expect } from "vitest";
import {
  createScroll,
  isScrolled,
  maxOffset,
  scrollBy,
  snapToBottom,
  updateTotal,
  viewRange,
  viewSlice,
} from "../../packages/tui/src/scroll";

describe("maxOffset / scrollBy 钳制", () => {
  it("buffer 不满一屏时无滚动空间", () => {
    expect(maxOffset(10, 18)).toBe(0);
    expect(maxOffset(18, 18)).toBe(0);
    expect(maxOffset(40, 18)).toBe(22);
  });

  it("向上滚动累加偏移，钳到 maxOffset", () => {
    const s = createScroll();
    updateTotal(s, 40, 18);
    expect(scrollBy(s, 1, 18)).toBe(1);
    expect(scrollBy(s, 5, 18)).toBe(6);
    expect(scrollBy(s, 100, 18)).toBe(22); // 钳到 40-18
    expect(scrollBy(s, 1, 18)).toBe(22); // 到顶不动
  });

  it("向下滚动到 0 恢复自动跟随", () => {
    const s = createScroll();
    updateTotal(s, 40, 18);
    scrollBy(s, 10, 18);
    expect(scrollBy(s, -4, 18)).toBe(6);
    expect(scrollBy(s, -10, 18)).toBe(0);
    expect(isScrolled(s)).toBe(false);
  });

  it("负偏移不越界", () => {
    const s = createScroll();
    updateTotal(s, 40, 18);
    expect(scrollBy(s, -3, 18)).toBe(0);
  });
});

describe("updateTotal（buffer 增减时钳制）", () => {
  it("内容变短（清屏/新 run）时偏移自动收敛", () => {
    const s = createScroll();
    updateTotal(s, 100, 18);
    scrollBy(s, 50, 18); // offset=50
    updateTotal(s, 20, 18); // buffer 缩到 20 行
    expect(s.offset).toBe(2); // maxOffset(20,18)
    updateTotal(s, 10, 18); // 不满一屏
    expect(s.offset).toBe(0);
    expect(isScrolled(s)).toBe(false);
  });
});

describe("viewRange / viewSlice 视口切片", () => {
  const lines = Array.from({ length: 30 }, (_, i) => `L${i}`);

  it("offset=0 取尾部（跟随底部，与 Screen 贴底语义一致）", () => {
    expect(viewSlice(lines, 0, 10)).toEqual(lines.slice(20, 30));
    expect(viewRange(30, 0, 10)).toEqual({ start: 20, end: 30 });
  });

  it("offset>0 保持距底部距离（新内容到达视口不跳）", () => {
    expect(viewSlice(lines, 5, 10)).toEqual(lines.slice(15, 25));
    expect(viewRange(30, 5, 10)).toEqual({ start: 15, end: 25 });
  });

  it("滚到顶：start 钳 0，切片不足 rows", () => {
    expect(viewRange(30, 22, 10)).toEqual({ start: 0, end: 8 });
    expect(viewSlice(lines, 22, 10)).toEqual(lines.slice(0, 8));
  });

  it("buffer 少于视口：偏移钳 0 后全量返回", () => {
    const s = createScroll();
    updateTotal(s, 5, 10); // 不满一屏 → 无滚动空间
    expect(s.offset).toBe(0);
    expect(viewSlice(lines.slice(0, 5), s.offset, 10)).toEqual(lines.slice(0, 5));
    // 未钳制的原始偏移按数学语义切（end 钳 0 下限）
    expect(viewSlice(lines.slice(0, 5), 3, 10)).toEqual(lines.slice(0, 2));
  });
});

describe("snapToBottom", () => {
  it("任意偏移一键回底", () => {
    const s = createScroll();
    updateTotal(s, 100, 18);
    scrollBy(s, 40, 18);
    expect(isScrolled(s)).toBe(true);
    snapToBottom(s);
    expect(s.offset).toBe(0);
    expect(isScrolled(s)).toBe(false);
  });
});
