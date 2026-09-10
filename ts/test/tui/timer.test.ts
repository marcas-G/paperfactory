/**
 * timer.ts 单测 —— 耗时格式化 / token 估算 / spinner / 紧凑计数。
 */
import { describe, it, expect } from "vitest";
import { compactCount, estimateTokens, formatDuration, SPINNER_FRAMES, spinnerFrame } from "../../packages/tui/src/timer";

describe("formatDuration", () => {
  it("秒级（固定宽度 00m SSs）", () => {
    expect(formatDuration(0)).toBe("00m 00s");
    expect(formatDuration(45_000)).toBe("00m 45s");
    expect(formatDuration(59_999)).toBe("00m 59s");
  });
  it("分级（秒恒两位、分至少两位）", () => {
    expect(formatDuration(60_000)).toBe("01m 00s");
    expect(formatDuration(68_000)).toBe("01m 08s");
    expect(formatDuration(192_000)).toBe("03m 12s");
    expect(formatDuration(962_000)).toBe("16m 02s");
  });
  it("分钟累加不进位小时（分钟自然增长到 3 位）", () => {
    expect(formatDuration(3_600_000)).toBe("60m 00s");
    expect(formatDuration(7_260_000)).toBe("121m 00s");
    expect(formatDuration(7_425_000)).toBe("123m 45s");
  });
  it("非法输入容错", () => {
    expect(formatDuration(-5)).toBe("00m 00s");
    expect(formatDuration(Number.NaN)).toBe("00m 00s");
  });
  it("固定宽度：相邻秒刷新显示宽度一致（布局不跳动的根因回归）", () => {
    for (const ms of [67_000, 68_000, 69_000, 70_000, 599_000, 600_000]) {
      expect(formatDuration(ms).length).toBe(7); // MMm SSs
    }
    // 两位分钟区间内宽度恒定
    const widths = new Set<number>();
    for (let s = 0; s < 60 * 100; s += 7) widths.add(formatDuration(s * 1000).length);
    expect(widths.size).toBe(1);
    expect([...widths][0]).toBe(7);
  });
});

describe("estimateTokens（客户端口径）", () => {
  it("纯 ASCII 约 4 字符 1 token", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("ab")).toBe(1);
  });
  it("CJK 约 1 字 1 token", () => {
    expect(estimateTokens("文献调研")).toBe(4);
  });
  it("混合", () => {
    expect(estimateTokens("abc 文献")).toBe(1 + 2); // abc→1, 空格不计, 文献→2
  });
});

describe("spinner 与计数", () => {
  it("spinnerFrame 循环取帧", () => {
    expect(SPINNER_FRAMES).toHaveLength(10);
    expect(spinnerFrame(0)).toBe("⠋");
    expect(spinnerFrame(10)).toBe("⠋");
    expect(spinnerFrame(-1)).toBe(SPINNER_FRAMES[9]);
  });
  it("compactCount：k/M 缩写", () => {
    expect(compactCount(999)).toBe("999");
    expect(compactCount(1234)).toBe("1.2k");
    expect(compactCount(2_500_000)).toBe("2.5M");
  });
});
