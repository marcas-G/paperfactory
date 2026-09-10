/**
 * 鼠标优先交互单测 —— scanButtons 扫描（逻辑行内按钮定位）+ TuiApp HitRegion
 * 碰撞检测与动作分发（审批/展开/翻页/回底/关闭/切模式/resume 选择器）。
 *
 * 集成测试注入 stdoutWrite 静默渲染 + 固定屏幕尺寸（24x80），坐标完全确定；
 * 部分用例直接喂 SGR 鼠标序列（\x1b[<0;col;rowM）覆盖解码→分发端到端。
 */
import { describe, it, expect, vi } from "vitest";
import { button, scanButtons, stripAnsi, visibleWidth } from "../../packages/tui/src/render";
import { TuiApp, agoLabel, type HitRegion } from "../../packages/tui/src/index";

/* ---------------- 纯函数：scanButtons ---------------- */

describe("scanButtons 按钮定位", () => {
  it("单行单按钮：列区间 = 按钮文本占据的 display 列（含反色空隙）", () => {
    const line = `前缀 ${button("批准")} 尾巴`;
    const spans = scanButtons([line]);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe("批准");
    expect(spans[0]!.line).toBe(0);
    // "前缀 " = 5 列（CJK 2+2 + 空格 1）→ 按钮从 display col 5 开始
    expect(spans[0]!.colStart).toBe(5);
    const width = visibleWidth(stripAnsi(button("批准")));
    expect(spans[0]!.colEnd).toBe(5 + width - 1);
  });

  it("CJK 前缀列偏移正确；一行多按钮各自成区", () => {
    const line = `${button("✓ 批准")}  ${button("✗ 拒绝")}`;
    const spans = scanButtons([line]);
    expect(spans.map((s) => s.text)).toEqual(["✓ 批准", "✗ 拒绝"]);
    expect(spans[1]!.colStart).toBe(spans[0]!.colEnd + 1 + 2); // 紧邻 + 两空格间隔
  });

  it("多行扫描：line 字段为所在行下标；ANSI 颜色前缀不计宽", () => {
    const lines = ["普通行", `\x1b[31m红前缀\x1b[0m ${button("翻页")}`];
    const spans = scanButtons(lines);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.line).toBe(1);
    expect(spans[0]!.colStart).toBe(visibleWidth("红前缀") + 1);
  });

  it("被截断剥色的按钮（无闭合 \x1b[27m）不产生区域（窄屏兜底）", () => {
    const broken = "\x1b[7m 批准 "; // 反色未闭合（truncate 剥 ANSI 的产物形态）
    expect(scanButtons([broken])).toEqual([]);
  });

  it("agoLabel：秒/分/时/天分级与非法输入", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(agoLabel("2026-01-01T11:59:40Z", now)).toBe("20s ago");
    expect(agoLabel("2026-01-01T11:30:00Z", now)).toBe("30m ago");
    expect(agoLabel("2026-01-01T08:00:00Z", now)).toBe("4h ago");
    expect(agoLabel("2025-12-30T12:00:00Z", now)).toBe("2d ago");
    expect(agoLabel("not-a-date", now)).toBe("");
  });
});

/* ---------------- TuiApp 集成：HitRegion 碰撞与动作 ---------------- */

interface AppInner {
  hitRegions: HitRegion[];
  renderNow(): void;
  overlay: "help" | null;
  pager: { page: number } | null;
  picker: unknown[] | null;
  scroll: { offset: number };
  state: { buf: string };
}

function makeApp(mode: "auto" | "manual" = "manual"): TuiApp {
  return new TuiApp("http://localhost:9", mode, {
    onExit: vi.fn(),
    stdoutWrite: () => {},
    screenRows: 24,
    screenCols: 80,
  });
}

function inner(app: TuiApp): AppInner {
  return app as unknown as AppInner;
}

function renderOnce(app: TuiApp): HitRegion[] {
  const app_ = inner(app);
  app_.renderNow();
  return app_.hitRegions;
}

function findRegion(regions: HitRegion[], id: string): HitRegion {
  const r = regions.find((x) => x.id === id);
  if (!r) throw new Error(`region "${id}" not found; have: ${regions.map((x) => x.id).join(", ")}`);
  return r;
}

/** 审批等待态 fixture（复用 app.test.ts 的事件序列） */
function approvalApp(): { app: TuiApp; toggleExpanded: () => boolean | undefined } {
  const app = makeApp("manual");
  app.model.status = "running";
  app.tracker.handle({ type: "run:start", projectId: "p1", runId: "run-1", data: { question: "q" } });
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
    toggleExpanded: () =>
      (app.model.phases[0]!.lines.find((l) => l.kind === "approval") as { expanded?: boolean } | undefined)
        ?.expanded,
  };
}

describe("审批卡片点击", () => {
  it("审批等待时渲染出 批准/修改/拒绝/展开 四个可点击区域", () => {
    const { app } = approvalApp();
    const regions = renderOnce(app);
    const ids = regions.map((r) => r.id);
    expect(ids).toContain("✓ 批准");
    expect(ids).toContain("✎ 修改");
    expect(ids).toContain("✗ 拒绝");
    expect(ids).toContain("▼ 展开详情");
    app.handleKey({ type: "ctrl-c" });
  });

  it("点击 批准 → submitPhaseDecision 提交并 resolve 审批", async () => {
    const { app } = approvalApp();
    const fetchSpy = vi.spyOn(app.client, "fetch").mockResolvedValue({ ok: true });
    const regions = renderOnce(app);
    const approve = findRegion(regions, "✓ 批准");
    app.handleKey({ type: "click", col: approve.colStart, row: approve.row });
    await vi.waitFor(() => expect(app.model.approval).toBeNull());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toContain("/decision");
    expect(app.model.phases[0]!.lines.some((l) => l.kind === "approval" && l.resolved === "已批准")).toBe(true);
    fetchSpy.mockRestore();
    app.handleKey({ type: "ctrl-c" });
  });

  it("点击 拒绝 → reject 决策提交", async () => {
    const { app } = approvalApp();
    const fetchSpy = vi.spyOn(app.client, "fetch").mockResolvedValue({ ok: true });
    const regions = renderOnce(app);
    const reject = findRegion(regions, "✗ 拒绝");
    app.handleKey({ type: "click", col: reject.colEnd, row: reject.row }); // 命中区间右端也有效
    await vi.waitFor(() =>
      expect(app.model.phases[0]!.lines.some((l) => l.kind === "approval" && l.resolved === "已拒绝")).toBe(true),
    );
    fetchSpy.mockRestore();
    app.handleKey({ type: "ctrl-c" });
  });

  it("点击 展开详情 → expanded=true 且区域变为 收起详情", () => {
    const { app, toggleExpanded } = approvalApp();
    let regions = renderOnce(app);
    const expand = findRegion(regions, "▼ 展开详情");
    app.handleKey({ type: "click", col: expand.colStart + 1, row: expand.row });
    expect(toggleExpanded()).toBe(true);
    regions = renderOnce(app);
    expect(regions.map((r) => r.id)).toContain("▲ 收起详情"); // 展开后按钮翻转
    const collapse = findRegion(regions, "▲ 收起详情");
    app.handleKey({ type: "click", col: collapse.colStart, row: collapse.row });
    expect(toggleExpanded()).toBe(false);
    app.handleKey({ type: "ctrl-c" });
  });

  it("审批已 resolve 后按钮不再产生可点击区域", async () => {
    const { app } = approvalApp();
    vi.spyOn(app.client, "fetch").mockResolvedValue({ ok: true });
    const regions = renderOnce(app);
    app.handleKey({ type: "click", col: findRegion(regions, "✓ 批准").colStart, row: findRegion(regions, "✓ 批准").row });
    await vi.waitFor(() => expect(app.model.approval).toBeNull());
    const after = renderOnce(app);
    expect(after.map((r) => r.id)).not.toContain("✓ 批准");
    vi.mocked(app.client.fetch).mockRestore();
    app.handleKey({ type: "ctrl-c" });
  });

  it("按钮命中区间是精确的：col-1 / colEnd+1 不触发", async () => {
    const { app } = approvalApp();
    const fetchSpy = vi.spyOn(app.client, "fetch").mockResolvedValue({ ok: true });
    const regions = renderOnce(app);
    const approve = findRegion(regions, "✓ 批准");
    app.handleKey({ type: "click", col: approve.colStart - 1, row: approve.row }); // 左邻空隙
    app.handleKey({ type: "click", col: approve.colEnd + 1, row: approve.row }); // 右邻空隙
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(app.model.approval).not.toBeNull(); // 未被误触
    fetchSpy.mockRestore();
    app.handleKey({ type: "ctrl-c" });
  });
});

describe("报告阅读模式点击", () => {
  function pagerApp(): TuiApp {
    const app = makeApp("auto");
    inner(app).pager = null;
    (app as unknown as { rawReport: string | null }).rawReport = Array.from(
      { length: 120 },
      (_, i) => `报告行 ${i}`,
    ).join("\n");
    app.model.reportLines = ["", "── report ──", "报告行 0"];
    app.model.status = "complete";
    app.handleKey({ type: "text", text: "r" });
    return app;
  }

  it("点击 下一页/上一页 翻页；点击 ✕ 关闭 退出", () => {
    const app = pagerApp();
    const app_ = inner(app);
    let regions = renderOnce(app);
    expect(app_.pager!.page).toBe(0);
    const next = findRegion(regions, "下一页 →");
    app.handleKey({ type: "click", col: next.colStart, row: next.row });
    expect(app_.pager!.page).toBe(1);

    regions = renderOnce(app);
    const prev = findRegion(regions, "← 上一页");
    app.handleKey({ type: "click", col: prev.colStart, row: prev.row });
    expect(app_.pager!.page).toBe(0);

    regions = renderOnce(app);
    const close = findRegion(regions, "✕ 关闭");
    app.handleKey({ type: "click", col: close.colStart, row: close.row });
    expect(app_.pager).toBeNull();
    app.handleKey({ type: "ctrl-c" });
  });

  it("pager 空白处点击不翻页不误触", () => {
    const app = pagerApp();
    const app_ = inner(app);
    renderOnce(app);
    app.handleKey({ type: "click", col: 10, row: 5 }); // 报告正文区
    app.handleKey({ type: "click", col: 10, row: 12 });
    expect(app_.pager!.page).toBe(0);
    app.handleKey({ type: "text", text: "q" });
    app.handleKey({ type: "ctrl-c" });
  });
});

describe("滚动提示点击回底", () => {
  it("滚动后点击 回到底部 按钮 → offset 归零", () => {
    const app = makeApp("auto");
    app.model.status = "complete";
    app.model.startedAt = 1000;
    app.model.endedAt = 2000;
    app.model.epilogue.push(...Array.from({ length: 60 }, (_, i) => `第 ${i} 行内容`));
    const app_ = inner(app);
    app.handleKey({ type: "pageup" });
    expect(app_.scroll.offset).toBeGreaterThan(0);
    const regions = renderOnce(app);
    const bottom = findRegion(regions, "回到底部");
    app.handleKey({ type: "click", col: bottom.colStart, row: bottom.row });
    expect(app_.scroll.offset).toBe(0);
    app.handleKey({ type: "ctrl-c" });
  });

  it("主区域空白点击 → 进入滚动回看（offset +1）", () => {
    const app = makeApp("auto");
    app.model.status = "complete";
    app.model.startedAt = 1000;
    app.model.endedAt = 2000;
    app.model.epilogue.push(...Array.from({ length: 60 }, (_, i) => `第 ${i} 行内容`));
    const app_ = inner(app);
    renderOnce(app);
    expect(app_.scroll.offset).toBe(0);
    app.handleKey({ type: "click", col: 10, row: 10 }); // 主区域中部空白
    expect(app_.scroll.offset).toBe(1);
    app.handleKey({ type: "ctrl-c" });
  });

  it("输入行点击 → 回底跟随（聚焦输入语义），不进入滚动", () => {
    const app = makeApp("auto");
    app.model.status = "complete";
    app.model.startedAt = 1000;
    app.model.endedAt = 2000;
    app.model.epilogue.push(...Array.from({ length: 60 }, (_, i) => `第 ${i} 行内容`));
    const app_ = inner(app);
    app.handleKey({ type: "pageup" });
    const before = app_.scroll.offset;
    expect(before).toBeGreaterThan(0);
    renderOnce(app);
    app.handleKey({ type: "click", col: 10, row: 23 }); // 24 行屏：输入行 = rows-1 = 23
    expect(app_.scroll.offset).toBe(0); // 聚焦输入 = 恢复跟随
    app.handleKey({ type: "ctrl-c" });
  });
});

describe("状态栏与帮助层点击", () => {
  it("点击状态栏 mode 按钮 → auto/manual 切换（Tab 等价）", () => {
    const app = makeApp("auto");
    const regions = renderOnce(app);
    const mode = findRegion(regions, "mode");
    expect(mode.row).toBe(24 - 3); // 状态栏物理行 = rows-3
    expect(app.model.mode).toBe("auto");
    app.handleKey({ type: "click", col: mode.colStart, row: mode.row });
    expect(app.model.mode).toBe("manual");
    const regions2 = renderOnce(app);
    app.handleKey({ type: "click", col: findRegion(regions2, "mode").colStart, row: mode.row });
    expect(app.model.mode).toBe("auto");
    app.handleKey({ type: "ctrl-c" });
  });

  it("帮助层：点击 [关闭] 按钮关闭；点击空白处同样关闭", () => {
    const app = makeApp("auto");
    app.handleKey({ type: "text", text: "?" });
    expect(inner(app).overlay).toBe("help");
    const regions = renderOnce(app);
    const close = findRegion(regions, "关闭");
    app.handleKey({ type: "click", col: close.colStart, row: close.row });
    expect(inner(app).overlay).toBeNull();

    app.handleKey({ type: "text", text: "?" });
    renderOnce(app);
    app.handleKey({ type: "click", col: 40, row: 15 }); // 空白处
    expect(inner(app).overlay).toBeNull();
    app.handleKey({ type: "ctrl-c" });
  });
});

describe("resume 选择器点击", () => {
  function pickerApp(): TuiApp {
    const app = makeApp("auto");
    inner(app).picker = [
      { id: "proj-aaa-111", name: "agent架构调研", status: "complete", createdAt: new Date(Date.now() - 33 * 60_000).toISOString() },
      { id: "proj-bbb-222", name: "RAG 研究", status: "complete", createdAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
    ];
    return app;
  }

  it("picker 项目行产生整行可点击区域（pick:N）", () => {
    const app = pickerApp();
    const regions = renderOnce(app);
    expect(regions.map((r) => r.id)).toContain("pick:0");
    expect(regions.map((r) => r.id)).toContain("pick:1");
    const first = findRegion(regions, "pick:0");
    expect(first.row).toBe(4); // 标题行 + 空行后第一个项目行
    expect(first.colStart).toBe(3);
    app.handleKey({ type: "ctrl-c" });
  });

  it("点击项目行 → 关闭选择器并发起 resume（fetch 证据）", async () => {
    const app = pickerApp();
    const fetchSpy = vi.spyOn(app.client, "fetch").mockResolvedValue({ runId: "r2", projectId: "proj-bbb-222" });
    const regions = renderOnce(app);
    const second = findRegion(regions, "pick:1");
    app.handleKey({ type: "click", col: 30, row: second.row }); // 行内任意列
    expect(inner(app).picker).toBeNull();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy.mock.calls[0]![0]).toContain("/api/research/resume");
    expect(String(fetchSpy.mock.calls[0]![1]?.body)).toContain("proj-bbb-222"); // projectId 在请求体
    fetchSpy.mockRestore();
    app.handleKey({ type: "ctrl-c" });
  });
});

describe("SGR 鼠标序列端到端（InputHandler 解码 → HitRegion 分发）", () => {
  it("直接喂 \\x1b[<0;col;rowM：点击状态栏 auto 切换模式", () => {
    const app = makeApp("auto");
    const regions = renderOnce(app);
    const mode = findRegion(regions, "mode");
    (app as unknown as { input: { push: (c: string) => void } }).input.push(`\x1b[<0;${mode.colStart};${mode.row}M`);
    expect(app.model.mode).toBe("manual");
    app.handleKey({ type: "ctrl-c" });
  });

  it("直接喂 SGR 序列：点击审批 批准 按钮（1-based col/row 与物理坐标一致）", async () => {
    const { app } = approvalApp();
    const fetchSpy = vi.spyOn(app.client, "fetch").mockResolvedValue({ ok: true });
    const regions = renderOnce(app);
    const approve = findRegion(regions, "✓ 批准");
    (app as unknown as { input: { push: (c: string) => void } }).input.push(`\x1b[<0;${approve.colStart};${approve.row}M`);
    await vi.waitFor(() => expect(app.model.approval).toBeNull());
    fetchSpy.mockRestore();
    app.handleKey({ type: "ctrl-c" });
  });
});
