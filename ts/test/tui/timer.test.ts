/**
 * timer.ts 单测 —— 耗时格式化 / token 估算 / spinner / 紧凑计数。
 */
import { describe, it, expect } from "vitest";
import { compactCount, estimateTokens, formatDuration, SPINNER_FRAMES, spinnerFrame } from "../../packages/tui/src/timer";

describe("formatDuration", () => {
  it("秒级", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(59_999)).toBe("59s");
  });
  it("分级（秒两位补零）", () => {
    expect(formatDuration(60_000)).toBe("1m 00s");
    expect(formatDuration(192_000)).toBe("3m 12s");
  });
  it("时级", () => {
    expect(formatDuration(3_600_000)).toBe("1h 00m");
    expect(formatDuration(7_260_000)).toBe("2h 01m");
  });
  it("非法输入容错", () => {
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(Number.NaN)).toBe("0s");
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
