/**
 * screen.ts 单测 —— ANSI 序列正确性与盒模型完整性（注入 write/size，无需 TTY）。
 */
import { describe, it, expect } from "vitest";
import { Screen, clampSize } from "../../packages/tui/src/screen";
import { stripAnsi, visibleWidth } from "../../packages/tui/src/render";

function makeScreen(rows: number, cols: number): { screen: Screen; out: string[] } {
  const out: string[] = [];
  const screen = new Screen({ rows, cols, write: (s) => out.push(s) });
  return { screen, out };
}

/** 去掉行首 \x1b[K（字符串前缀剥离，避免正则里的控制字符） */
function stripK(row: string): string {
  return row.startsWith("\x1b[K") ? row.slice(3) : row;
}

const FRAME = {
  title: "PaperFactory Research Agent",
  titleSuffix: "auto",
  mainLines: ["● 文献调研 ✓", "│  └ literature_search  5 papers ✓"],
  status: "文献调研→缺口识别 · 1/8 阶段 · 12s · ~0 tok · auto",
  hint: "Enter 发送 · Tab 切模式",
  input: "新问题",
};

describe("Screen ANSI 序列", () => {
  it("enter：藏光标 + 清屏 + 回顶", () => {
    const { screen, out } = makeScreen(24, 80);
    screen.enter();
    expect(out[0]).toBe("\x1b[?25l\x1b[2J\x1b[H");
  });

  it("exit：恢复光标 + 复位滚动区 + 清屏回顶", () => {
    const { screen, out } = makeScreen(24, 80);
    screen.exit();
    expect(out[0]).toBe("\x1b[?25h\x1b[r\x1b[2J\x1b[H");
  });

  it("frame：以 \x1b[H 开头定位，行间 \r\n，行首 \x1b[K 清行尾", () => {
    const { screen } = makeScreen(24, 80);
    const { frame } = screen.composeFrame(FRAME);
    expect(frame.startsWith("\x1b[H")).toBe(true);
    expect(frame).toContain("\x1b[K┌");
    expect(frame.split("\r\n")).toHaveLength(24); // 整屏 24 行
  });

  it("光标定位序列落在输入行（倒数第 2 行）", () => {
    const { screen } = makeScreen(24, 80);
    const { cursorTo } = screen.composeFrame(FRAME);
    // 输入文本 3 个 CJK 字 = 6 列 → col = 3 + 6 + 1 = 10，行 = 23
    expect(cursorTo).toBe("\x1b[23;10H");
  });

  it("clampSize：极小终端钳到 8x20", () => {
    expect(clampSize(3, 5)).toEqual({ rows: 8, cols: 20 });
    expect(clampSize(24, 300)).toEqual({ rows: 24, cols: 200 });
  });
});

describe("Screen 盒模型", () => {
  it("每行显示宽度一致（CJK 内容下右边框对齐）", () => {
    const { screen } = makeScreen(24, 80);
    const { frame } = screen.composeFrame(FRAME);
    const rows = frame.split("\r\n").map((r) => stripK(r));
    for (const [i, row] of rows.entries()) {
      expect(visibleWidth(row), `row ${i}`).toBe(80);
    }
  });

  it("顶框带标题与角；底框闭合", () => {
    const { screen } = makeScreen(24, 80);
    const { frame } = screen.composeFrame(FRAME);
    const rows = frame.split("\r\n").map((r) => stripAnsi(stripK(r)));
    expect(rows[0].startsWith("┌─ PaperFactory Research Agent ")).toBe(true);
    expect(rows[0].endsWith(" auto ┐")).toBe(true);
    expect(rows[23]).toBe("└" + "─".repeat(78) + "┘");
  });

  it("主区域贴底裁剪：只保留尾部 rows-6 行", () => {
    const { screen } = makeScreen(12, 40);
    const many = Array.from({ length: 50 }, (_, i) => `line-${i}`);
    const { frame } = screen.composeFrame({ ...FRAME, mainLines: many });
    const rows = frame.split("\r\n").map((r) => stripAnsi(stripK(r)));
    const main = rows.slice(1, 7); // 12-6=6 行主区域
    expect(main[0]).toContain("line-44"); // 50-6
    expect(main[5]).toContain("line-49");
  });

  it("状态栏与输入行结构：分隔线 + │ 包裹", () => {
    const { screen } = makeScreen(24, 80);
    const { frame } = screen.composeFrame(FRAME);
    const rows = frame.split("\r\n").map((r) => stripAnsi(stripK(r)));
    expect(rows[19]).toBe("├" + "─".repeat(78) + "┤"); // 分隔
    expect(rows[20]).toContain("1/8 阶段");
    expect(rows[20].startsWith("│ ")).toBe(true);
    expect(rows[21]).toBe("├" + "─".repeat(78) + "┤");
    expect(rows[22]).toContain("> 新问题");
    expect(rows[22]).toContain("Enter 发送");
  });

  it("超宽主区域行被截断（不换行撑破盒）", () => {
    const { screen } = makeScreen(10, 40);
    const { frame } = screen.composeFrame({ ...FRAME, mainLines: ["X".repeat(200)] });
    const rows = frame.split("\r\n").map((r) => stripK(r));
    for (const row of rows) expect(visibleWidth(row)).toBe(40);
  });

  it("mainRows/contentCols 派生尺寸", () => {
    const { screen } = makeScreen(24, 80);
    expect(screen.mainRows).toBe(18);
    expect(screen.contentCols).toBe(76);
  });
});
