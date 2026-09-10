/**
 * index.ts 交互逻辑单测 —— InputState（编辑/历史/水平滚动）、Ctrl+C 优雅降级、
 * 帮助覆盖层、报告 pager 进出与翻页（注入 onExit，不碰终端）。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  InputState,
  computeInputView,
  ctrlCPressed,
  CTRL_C_WINDOW_MS,
  TuiApp,
} from "../../packages/tui/src/index";
import { stripAnsi } from "../../packages/tui/src/render";

afterEach(() => {
  vi.useRealTimers();
});

describe("InputState 编辑（码点安全）", () => {
  it("insert / backspace / deleteForward / move / home / end", () => {
    const s = new InputState();
    s.insert("abc");
    expect(s.buf).toBe("abc");
    expect(s.cursor).toBe(3);
    s.move(-1);
    s.insert("X"); // abXc
    expect(s.buf).toBe("abXc");
    s.backspace(); // abc
    expect(s.buf).toBe("abc");
    s.home();
    s.deleteForward(); // bc
    expect(s.buf).toBe("bc");
    s.end();
    expect(s.cursor).toBe(2);
  });

  it("CJK 不被劈半：backspace 删整个汉字", () => {
    const s = new InputState();
    s.insert("文献a");
    s.backspace();
    expect(s.buf).toBe("文献");
    s.backspace();
    expect(s.buf).toBe("文");
  });

  it("长度上限 200 码点", () => {
    const s = new InputState();
    s.insert("x".repeat(300));
    expect(Array.from(s.buf)).toHaveLength(200);
  });
});

describe("InputState 历史（↑/↓ 翻阅）", () => {
  it("commit 入历史（连续重复去重）；↑ 向旧翻、↓ 向新翻、翻出尽头回草稿", () => {
    const s = new InputState();
    s.setText("q1");
    s.commit();
    s.setText("q2");
    s.commit();
    s.setText("q2");
    s.commit(); // 重复不入账
    expect(s.historyLength).toBe(2);

    s.setText("dra"); // 未提交草稿
    expect(s.prevHistory()).toBe("q2");
    expect(s.prevHistory()).toBe("q1");
    expect(s.prevHistory()).toBe("q1"); // 到最旧不动
    expect(s.nextHistory()).toBe("q2");
    expect(s.nextHistory()).toBe("dra"); // 翻出尽头恢复草稿
    expect(s.nextHistory()).toBeNull(); // 非浏览态再 ↓ 无效
  });

  it("commit 后缓冲与光标复位", () => {
    const s = new InputState();
    s.setText("hello");
    s.move(-2);
    expect(s.commit()).toBe("hello");
    expect(s.buf).toBe("");
    expect(s.cursor).toBe(0);
  });
});

describe("computeInputView 水平滚动", () => {
  it("短输入不裁剪，光标在末尾", () => {
    const v = computeInputView("hello", 5, 40);
    expect(v.text).toBe("hello");
    expect(v.cursorCol).toBe(5);
  });

  it("长输入：窗口跟随光标（光标列落在窗口内），CJK 宽度感知", () => {
    const buf = "文".repeat(40); // 80 显示列
    // 光标在第 5 字（10 列），窗口 20 列 → 起点钳到 0，光标列 = 10
    const v1 = computeInputView(buf, 5, 20);
    expect(v1.cursorCol).toBe(10);
    expect(v1.cursorCol).toBeLessThanOrEqual(20);
    // 光标在末尾（80 列）→ 窗口尾部对齐，光标列 = 窗口宽
    const v2 = computeInputView(buf, 40, 20);
    expect(v2.cursorCol).toBeLessThanOrEqual(20);
    expect(v2.cursorCol).toBeGreaterThanOrEqual(10);
    expect(v2.text.length).toBeGreaterThan(0);
  });

  it("窗口文本宽度不超上限", () => {
    const buf = "a".repeat(100);
    for (let cur = 0; cur <= 100; cur += 7) {
      const v = computeInputView(buf, cur, 20);
      let w = 0;
      for (const ch of v.text) w += ch.codePointAt(0)! > 0x2e80 ? 2 : 1;
      expect(w).toBeLessThanOrEqual(20);
      expect(v.cursorCol).toBeLessThanOrEqual(20);
    }
  });
});

describe("Ctrl+C 优雅降级", () => {
  it("ctrlCPressed：窗口内二次按 → true；超窗/首次 → false", () => {
    const t0 = 1_000_000;
    expect(ctrlCPressed(0, t0)).toBe(false); // 从未按过
    expect(ctrlCPressed(t0, t0 + 100)).toBe(true); // 窗口内
    expect(ctrlCPressed(t0, t0 + CTRL_C_WINDOW_MS)).toBe(true); // 恰好 3s（含）
    expect(ctrlCPressed(t0, t0 + CTRL_C_WINDOW_MS + 1)).toBe(false); // 超窗
  });

  it("TuiApp：第一次 Ctrl+C 只提示不退出；窗口内第二次退出(130)", () => {
    const onExit = vi.fn();
    const app = new TuiApp("http://localhost:9", "auto", { onExit });
    app.handleKey({ type: "ctrl-c" });
    expect(onExit).not.toHaveBeenCalled();
    expect(app.model.notice).toContain("再按一次");
    app.handleKey({ type: "ctrl-c" });
    expect(onExit).toHaveBeenCalledWith(130);
  });

  it("TuiApp：超窗后第二次仍是提示（不退出）", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const onExit = vi.fn();
    const app = new TuiApp("http://localhost:9", "auto", { onExit });
    app.handleKey({ type: "ctrl-c" });
    vi.setSystemTime(new Date("2026-01-01T00:00:10Z")); // 10s 后
    app.handleKey({ type: "ctrl-c" });
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe("帮助覆盖层", () => {
  it("? 键打开 overlay；overlay 打开时任意键关闭且不进输入缓冲", () => {
    const onExit = vi.fn();
    const app = new TuiApp("http://localhost:9", "auto", { onExit });
    app.handleKey({ type: "text", text: "?" });
    const before = (app as unknown as { overlay: string | null }).overlay;
    expect(before).toBe("help");
    // overlay 打开时按 left：关闭 overlay，而不是移动输入光标
    app.handleKey({ type: "left" });
    expect((app as unknown as { overlay: string | null }).overlay).toBeNull();
    app.handleKey({ type: "ctrl-c" }); // 清理（第一次只提示）
  });

  it(":help 命令同样打开 overlay，Esc 关闭", () => {
    const onExit = vi.fn();
    const app = new TuiApp("http://localhost:9", "auto", { onExit });
    void (app as unknown as { command: (l: string) => Promise<void> }).command(":help");
    expect((app as unknown as { overlay: string | null }).overlay).toBe("help");
    app.handleKey({ type: "esc" }); // 任意键关闭
    expect((app as unknown as { overlay: string | null }).overlay).toBeNull();
    app.handleKey({ type: "ctrl-c" });
  });

  it("InputHandler onText 走总路由：overlay 打开时文本被吃掉不进输入缓冲（回归）", () => {
    const onExit = vi.fn();
    const app = new TuiApp("http://localhost:9", "auto", { onExit });
    const push = (s: string): void =>
      (app as unknown as { input: { push: (c: string) => void } }).input.push(s);
    push("?");
    expect((app as unknown as { overlay: string | null }).overlay).toBe("help");
    push("x"); // 任意键关闭 overlay，x 不应进输入缓冲
    expect((app as unknown as { overlay: string | null }).overlay).toBeNull();
    expect((app as unknown as { state: { buf: string } }).state.buf).toBe("");
    app.handleKey({ type: "ctrl-c" });
  });
});

describe("报告 pager（TuiApp 集成）", () => {
  function makeApp(): TuiApp {
    const app = new TuiApp("http://localhost:9", "auto", { onExit: vi.fn() });
    // 注入已拉取的报告（fetchReport 的产物）
    (app as unknown as { rawReport: string | null }).rawReport = Array.from(
      { length: 120 },
      (_, i) => `报告行 ${i}`,
    ).join("\n");
    app.model.reportLines = ["", "── report ──", "报告行 0"];
    app.model.status = "complete";
    return app;
  }

  it("r 键进入阅读模式；空格翻页；q 退出", () => {
    const app = makeApp();
    app.handleKey({ type: "text", text: "r" });
    const pager = (app as unknown as { pager: { page: number } | null }).pager;
    expect(pager).not.toBeNull();
    expect(pager!.page).toBe(0);
    app.handleKey({ type: "text", text: " " });
    expect((app as unknown as { pager: { page: number } | null }).pager!.page).toBe(1);
    app.handleKey({ type: "text", text: "b" });
    expect((app as unknown as { pager: { page: number } | null }).pager!.page).toBe(0);
    app.handleKey({ type: "text", text: "q" });
    expect((app as unknown as { pager: unknown }).pager).toBeNull();
    app.handleKey({ type: "ctrl-c" });
  });

  it("运行中 / 无报告时 r 不进 pager", () => {
    const app = new TuiApp("http://localhost:9", "auto", { onExit: vi.fn() });
    app.model.status = "running";
    app.handleKey({ type: "text", text: "r" });
    expect((app as unknown as { pager: unknown }).pager).toBeNull();
    expect(stripAnsi(app.model.notice ?? "")).not.toContain("阅读");
    app.handleKey({ type: "ctrl-c" });
  });
});

describe("排队可视化（stream 集成已在 stream.test.ts 覆盖纯逻辑）", () => {
  it("运行中 Enter → model.queued 追加（◇ 行数据源）", () => {
    const app = new TuiApp("http://localhost:9", "auto", { onExit: vi.fn() });
    app.model.status = "running";
    // 直接调 submit 路径：handleLine 等价于行输入
    (app as unknown as { handleLine: (l: string) => void }).handleLine("下一个问题");
    expect(app.model.queued).toEqual(["下一个问题"]);
    app.handleKey({ type: "ctrl-c" });
  });
});

describe("主区域滚动（TuiApp 键位集成）", () => {
  interface ScrollLike {
    offset: number;
    total: number;
  }
  interface AppLike {
    scroll: ScrollLike;
    screen: { mainRows: number };
  }
  function makeApp(lineCount: number): { app: TuiApp; inner: AppLike } {
    const app = new TuiApp("http://localhost:9", "auto", { onExit: vi.fn() });
    app.model.status = "complete";
    app.model.startedAt = 1000;
    app.model.endedAt = 2000;
    app.model.epilogue.push(...Array.from({ length: lineCount }, (_, i) => `第 ${i} 行内容`));
    const inner = app as unknown as AppLike;
    return { app, inner };
  }

  it("↑ 滚动主区域（内容超屏时），多次累加；↓ 向下回落", () => {
    const { app, inner } = makeApp(60); // 远超一屏
    app.handleKey({ type: "up" });
    expect(inner.scroll.offset).toBe(1);
    app.handleKey({ type: "up" });
    app.handleKey({ type: "up" });
    expect(inner.scroll.offset).toBe(3);
    app.handleKey({ type: "down" });
    expect(inner.scroll.offset).toBe(2);
    app.handleKey({ type: "ctrl-c" });
  });

  it("PgUp/PgDn 半屏滚动", () => {
    const { app, inner } = makeApp(60);
    const half = Math.max(1, Math.floor(inner.screen.mainRows / 2));
    app.handleKey({ type: "pageup" });
    expect(inner.scroll.offset).toBe(half);
    app.handleKey({ type: "pageup" });
    expect(inner.scroll.offset).toBe(half * 2);
    app.handleKey({ type: "pagedown" });
    expect(inner.scroll.offset).toBe(half);
    app.handleKey({ type: "ctrl-c" });
  });

  it("End 回底恢复跟随；未滚动时 End 仍是输入行尾", () => {
    const { app, inner } = makeApp(60);
    app.handleKey({ type: "pageup" });
    expect(inner.scroll.offset).toBeGreaterThan(0);
    app.handleKey({ type: "end" });
    expect(inner.scroll.offset).toBe(0); // 跳回底部
    // 未滚动态：End 移动输入光标到行尾（不产生滚动）
    (app as unknown as { state: { insert: (t: string) => void } }).state.insert("abc");
    app.handleKey({ type: "home" });
    app.handleKey({ type: "end" });
    expect(inner.scroll.offset).toBe(0);
    app.handleKey({ type: "ctrl-c" });
  });

  it("开始打字自动跳回底部（输入行获得焦点语义）", () => {
    const { app, inner } = makeApp(60);
    app.handleKey({ type: "pageup" });
    expect(inner.scroll.offset).toBeGreaterThan(0);
    app.handleKey({ type: "text", text: "x" });
    expect(inner.scroll.offset).toBe(0);
    app.handleKey({ type: "ctrl-c" });
  });

  it("内容不满一屏时 ↑/↓ 仍翻输入历史（不滚动）", () => {
    const { app, inner } = makeApp(3);
    app.handleKey({ type: "up" });
    expect(inner.scroll.offset).toBe(0);
    app.handleKey({ type: "ctrl-c" });
  });

  it("滚动不越界：顶=total-视口，向下不过 0", () => {
    const lineCount = 120; // 远超任何终端一屏
    const { app, inner } = makeApp(lineCount);
    for (let i = 0; i < 300; i++) app.handleKey({ type: "up" });
    expect(inner.scroll.offset).toBe(lineCount - inner.screen.mainRows); // 钳到最大偏移
    for (let i = 0; i < 300; i++) app.handleKey({ type: "down" });
    expect(inner.scroll.offset).toBe(0); // 向下不过底
    app.handleKey({ type: "ctrl-c" });
  });
});

describe("审批详情展开（TuiApp d 键集成）", () => {
  function approvalApp(): { app: TuiApp; line: () => { kind: string; expanded?: boolean } | undefined } {
    const app = new TuiApp("http://localhost:9", "manual", { onExit: vi.fn() });
    app.model.status = "running";
    app.tracker.handle({
      type: "run:start",
      projectId: "p1",
      runId: "run-1",
      data: { question: "q" },
    });
    app.tracker.handle({ type: "phase:start", projectId: "p1", runId: "run-1", phase: "gap_identification" });
    app.tracker.handle({
      type: "self:review",
      projectId: "p1",
      runId: "run-1",
      phase: "gap_identification",
      data: { content: "8 个发现、4 个空白", passed: true },
    });
    app.tracker.handle({
      type: "phase:awaiting_approval",
      projectId: "p1",
      runId: "phase-run-9",
      phase: "gap_identification",
      data: { summary: "找到 8 个关键发现" },
    });
    return {
      app,
      line: () =>
        app.model.phases[0].lines.find((l) => l.kind === "approval"),
    };
  }

  it("d 展开 → d 收起；不进输入缓冲", () => {
    const { app, line } = approvalApp();
    expect(app.model.approval).not.toBeNull();
    app.handleKey({ type: "text", text: "d" });
    expect(line()?.expanded).toBe(true);
    app.handleKey({ type: "text", text: "d" });
    expect(line()?.expanded).toBe(false);
    expect((app as unknown as { state: { buf: string } }).state.buf).toBe(""); // d 不进缓冲
    app.handleKey({ type: "ctrl-c" });
  });

  it("审批等待时其他字母正常进缓冲（仅 a/m/r/d 拦截）", () => {
    const { app } = approvalApp();
    app.handleKey({ type: "text", text: "x" });
    expect((app as unknown as { state: { buf: string } }).state.buf).toBe("x");
    app.handleKey({ type: "ctrl-c" });
  });
});
