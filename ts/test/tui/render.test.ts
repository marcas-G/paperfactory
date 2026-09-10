/**
 * render.ts 单测 —— 纯函数断言（宽度/截断/阶段头/活动行/文献/状态栏/Markdown）。
 * 所有断言先 stripAnsi 再比文本结构（颜色只在关键用例里断言存在）。
 */
import { describe, it, expect } from "vitest";
import {
  ANSI,
  PHASE_LABELS,
  approvalCard,
  approvalDetailText,
  emptyModel,
  helpOverlayLines,
  hypothesisCard,
  paperEntries,
  phaseHeader,
  phaseLabel,
  promptHint,
  queuedLine,
  renderMarkdown,
  renderModel,
  renderPhase,
  renderTimeline,
  scrollIndicatorLine,
  splitAtDisplay,
  statusLine,
  stripAnsi,
  thinkingDots,
  thinkingLine,
  toolLine,
  truncate,
  visibleWidth,
  padEndDisplay,
  APPROVAL_DETAIL_LINES,
  type PhaseLine,
  type PhaseState,
  type RunModel,
} from "../../packages/tui/src/render";

describe("宽度与截断（CJK 感知）", () => {
  it("visibleWidth：ASCII=1、CJK=2、ANSI 转义=0", () => {
    expect(visibleWidth("abc")).toBe(3);
    expect(visibleWidth("文献调研")).toBe(8);
    expect(visibleWidth(`${ANSI.green}文献${ANSI.reset}`)).toBe(4);
    expect(visibleWidth("● 文献")).toBe(1 + 1 + 4);
  });

  it("truncate：按显示宽度截断并补 …（CJK 边界不劈半字）", () => {
    expect(truncate("abcdef", 10)).toBe("abcdef");
    expect(truncate("abcdefgh", 5)).toBe("abcd…");
    expect(truncate("文献调研缺口识别", 9)).toBe("文献调研…"); // 8+1
    expect(visibleWidth(truncate("文献调研缺口识别", 9))).toBe(9);
  });

  it("padEndDisplay：按显示宽度补空格", () => {
    expect(padEndDisplay("ab", 5)).toBe("ab   ");
    expect(padEndDisplay("文献", 6)).toBe("文献  ");
    expect(padEndDisplay("abcdef", 3)).toBe("abcdef");
  });
});

describe("阶段头 phaseHeader", () => {
  it("完成态：✓ + 耗时 + 绿色", () => {
    const line = phaseHeader("literature_search", "complete", 120_000, 60);
    const plain = stripAnsi(line);
    expect(plain).toContain("● 文献调研");
    expect(plain).toContain("✓ 02m 00s");
    expect(plain).toMatch(/─+ ✓/);
    expect(line).toContain(ANSI.green);
  });

  it("运行态：spinner + running + 黄色", () => {
    const line = phaseHeader("gap_identification", "running", 5000, 60, 3);
    const plain = stripAnsi(line);
    expect(plain).toContain("● 缺口识别");
    expect(plain).toContain("running");
    expect(line).toContain(ANSI.yellow);
    expect(line).toContain("⠸"); // tick=3 帧
  });

  it("错误态：✗；跳过态：○ 跳过", () => {
    expect(stripAnsi(phaseHeader("confirmation", "error", 900, 60))).toContain("✗");
    expect(stripAnsi(phaseHeader("confirmation", "skipped", 0, 60))).toContain("○ 跳过");
  });

  it("未知阶段名原样透出", () => {
    expect(phaseLabel("weird_phase")).toBe("weird_phase");
    expect(phaseLabel(undefined)).toContain("unknown");
    expect(Object.keys(PHASE_LABELS)).toHaveLength(8);
  });
});

describe("活动行", () => {
  it("thinkingLine：spinner + 轮次 + 备注 + 等待时长", () => {
    const line = thinkingLine(3, "正在比较两篇 scaling law", 12_000, 0);
    const plain = stripAnsi(line);
    expect(plain).toContain("第 3 轮");
    expect(plain).toContain("正在比较两篇 scaling law");
    expect(plain).toContain("(00m 12s)");
    expect(line).toContain("⠋");
  });

  it("toolLine：calling 带 spinner 与参数摘要（等待超 3s 显时长）；done 带 ✓；failed 带 ✗", () => {
    const calling = stripAnsi(toolLine("literature_search", "calling", '"scaling law"', undefined));
    expect(calling).toContain("literature_search");
    expect(calling).toContain('"scaling law"');
    expect(calling).toContain("⠋"); // tick=0 首帧 spinner（calling 态持续视觉反馈）
    const waiting = stripAnsi(toolLine("literature_search", "calling", '"q"', undefined, 5200, 3));
    expect(waiting).toContain("(00m 05s)");
    const done = stripAnsi(toolLine("literature_search", "done", undefined, "5 papers"));
    expect(done).toContain("✓");
    expect(done).toContain("5 papers");
    const failed = stripAnsi(toolLine("code", "failed", undefined, "Error: timeout"));
    expect(failed).toContain("✗");
  });

  it("paperEntries：编号 + 标题行 + URL 行", () => {
    const lines = paperEntries([
      { title: "Neural Scaling Laws Rooted in Dimensionality", url: "https://arxiv.org/abs/2412.07942" },
      { title: "Scaling Laws for Upcycling", url: "https://arxiv.org/abs/2503.10198" },
    ]);
    const plain = lines.map(stripAnsi);
    expect(plain[0]).toContain("[1] Neural Scaling Laws Rooted");
    expect(plain[1]).toContain("arxiv.org/abs/2412.07942");
    expect(plain[2]).toContain("[2] Scaling Laws for Upcycling");
    expect(plain[3]).toContain("arxiv.org/abs/2503.10198");
  });

  it("hypothesisCard / approvalCard：盒线与按键提示", () => {
    const hyp = hypothesisCard("RAG 减少 hallucination").map(stripAnsi);
    expect(hyp[0]).toMatch(/┌ hypothesis ─+┐/);
    expect(hyp[1]).toContain("RAG 减少 hallucination");
    expect(hyp[2]).toMatch(/└─+┘/);

    const card = approvalCard("找到 3 个关键发现").map(stripAnsi);
    expect(card[0]).toContain("⚠ 等待审批");
    expect(card[0]).toContain("3 个关键发现");
    expect(card[1]).toContain("[a] 批准  [m] 修改  [r] 拒绝");
    expect(card[1]).toContain("[d] 详情"); // 收起态提示可展开
  });

  it("approvalCard 展开态：显示 [d] 收起 + 详情行", () => {
    const detail = "发现 1: scaling law 维度根源\n\n发现 2: 数据质量决定上限\n发现 3: 评估基准偏移";
    const card = approvalCard("找到 3 个关键发现", { expanded: true, detail, width: 80 }).map(stripAnsi);
    expect(card[1]).toContain("[d] 收起");
    expect(card.join("\n")).toContain("发现 1: scaling law 维度根源");
    expect(card.join("\n")).toContain("发现 3: 评估基准偏移");
  });

  it("approvalCard 展开态：只保留最后 10 行非空内容", () => {
    const detail = Array.from({ length: 20 }, (_, i) => `row-${String(i).padStart(2, "0")}`).join("\n\n");
    const card = approvalCard("s", { expanded: true, detail, width: 80 }).map(stripAnsi);
    const all = card.join("\n");
    for (let i = 0; i < 10; i++) expect(all).not.toContain(`row-${String(i).padStart(2, "0")}\n`);
    for (let i = 10; i < 20; i++) expect(all).toContain(`row-${String(i).padStart(2, "0")}`);
    expect(card.slice(2).length).toBeLessThanOrEqual(APPROVAL_DETAIL_LINES);
  });

  it("approvalCard 展开态：详情按终端宽度截断", () => {
    const detail = "x".repeat(200);
    const card = approvalCard("s", { expanded: true, detail, width: 40 });
    for (const row of card.slice(2)) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(40);
    }
  });

  it("approvalCard 展开态无内容：显示 无详细信息", () => {
    const card = approvalCard("s", { expanded: true, detail: null, width: 80 }).map(stripAnsi);
    expect(card[2]).toContain("无详细信息");
    const blank = approvalCard("s", { expanded: true, detail: "  \n\n ", width: 80 }).map(stripAnsi);
    expect(blank[2]).toContain("无详细信息");
  });

  it("approvalDetailText：取阶段最后一个 self-review/thinking/progress 的文本", () => {
    const phase: PhaseState = {
      name: "gap_identification",
      status: "running",
      startedAt: 0,
      lines: [
        { kind: "thinking", iteration: 1, note: "第 1 轮推理中...", since: 0 },
        { kind: "progress", text: "进度提示" },
        { kind: "self-review", passed: true, text: "自评通过：识别出 4 个缺口" },
      ],
    };
    expect(approvalDetailText(phase)).toBe("自评通过：识别出 4 个缺口");
    phase.lines.push({ kind: "thinking", iteration: 2, note: "第 2 轮：确认缺口真实性", since: 0 });
    expect(approvalDetailText(phase)).toBe("第 2 轮：确认缺口真实性");
    const empty: PhaseState = { name: "x", status: "running", startedAt: 0, lines: [] };
    expect(approvalDetailText(empty)).toBeNull();
  });

  it("renderPhase：审批行 expanded 联动阶段详情渲染", () => {
    // self-review 行自身恒显示（截断 50 字符）；卡片详情展示更长原文 —— 用长度区分两者
    const longText = "D".repeat(70);
    const phase: PhaseState = {
      name: "gap_identification",
      status: "running",
      startedAt: 0,
      lines: [
        { kind: "self-review", passed: true, text: longText },
        { kind: "approval", summary: "发现 8 个关键发现", phaseRunId: "pr-1", expanded: true },
      ],
    };
    const lines = renderPhase(phase, 0, 0, 80).map(stripAnsi);
    expect(lines.join("\n")).toContain("D".repeat(60)); // 展开态详情 > self-review 行的 50 截断
    (phase.lines[1] as Extract<PhaseLine, { kind: "approval" }>).expanded = false;
    const collapsed = renderPhase(phase, 0, 0, 80).map(stripAnsi);
    expect(collapsed.join("\n")).not.toContain("D".repeat(60)); // 收起态只剩 50 字符行摘要
    expect(collapsed.join("\n")).toContain("D".repeat(40)); // self-review 行仍在
  });
});

describe("滚动指示条", () => {
  it("回看时提示条显示当前位置与回底键", () => {
    const line = stripAnsi(scrollIndicatorLine(5, 40));
    expect(line).toContain("↑ 滚动中");
    expect(line).toContain("第 5/40 行");
    expect(line).toContain("按End回底部");
  });
  it("位置下限保护（空 buffer 不出现第 0 行）", () => {
    expect(stripAnsi(scrollIndicatorLine(0, 0))).toContain("第 1/1 行");
  });
});

describe("状态栏与提示", () => {
  function fixtureModel(): RunModel {
    const m = emptyModel();
    m.status = "running";
    m.startedAt = 1000;
    m.phases = [
      { name: "literature_search", status: "complete", startedAt: 1000, endedAt: 3000, lines: [] },
      { name: "gap_identification", status: "running", startedAt: 3000, lines: [] },
    ];
    m.tokens = 1234;
    return m;
  }

  it("statusLine：阶段进度 n/8、耗时、token、模式", () => {
    const line = stripAnsi(statusLine(fixtureModel(), 8000));
    expect(line).toContain("1/8 阶段");
    expect(line).toContain("7s");
    expect(line).toContain("~1.2k tok");
    expect(line).toContain("auto");
    expect(line).toContain("缺口识别");
  });

  it("statusLine：审批等待时带 ⏸ 待审批前缀", () => {
    const m = fixtureModel();
    m.approval = { phaseRunId: "pr-1", summary: "s" };
    expect(stripAnsi(statusLine(m, 8000))).toContain("⏸ 待审批");
  });

  it("promptHint：空闲/运行/审批三种语境", () => {
    const m = fixtureModel();
    expect(promptHint(m)).toContain("Enter 排队");
    m.status = "idle";
    expect(promptHint(m)).toContain("Enter 发送");
    m.approval = { phaseRunId: "pr-1", summary: "s" };
    expect(promptHint(m)).toContain("a/m/r");
  });
});

describe("renderModel 与 Markdown", () => {
  it("renderModel：问题行 + 阶段顺序 + epilogue + notice", () => {
    const m = emptyModel();
    m.question = "scaling law 的维度根源?";
    m.status = "complete";
    const phase: PhaseState = {
      name: "literature_search",
      status: "complete",
      startedAt: 0,
      endedAt: 1000,
      lines: [
        { kind: "thinking", iteration: 1, note: "第 1 轮推理中...", since: 0 },
        { kind: "tool", toolName: "literature_search", state: "done", resultSummary: "5 papers" },
        { kind: "papers", papers: [{ title: "Paper A", url: "https://arxiv.org/abs/1" }] },
      ],
    };
    m.phases = [phase];
    m.epilogue = ["● run:complete ✓"];
    m.notice = "已排队";
    const lines = renderModel(m, 2000, 0, 76).map(stripAnsi);
    const out = lines.join("\n");
    expect(out).toContain("scaling law 的维度根源?");
    expect(out).toContain("● 文献调研");
    expect(out).toContain("thinking");
    expect(out).toContain("5 papers");
    expect(out).toContain("[1] Paper A");
    expect(out).toContain("arxiv.org/abs/1");
    expect(out).toContain("● run:complete ✓");
    expect(out).toContain("已排队");
    // 树前缀：thinking 非末行 ├，papers 末行 └
    expect(out).toContain("│  ├ ⠋ thinking");
    expect(out).toContain("│  └ [1] Paper A");
  });

  it("renderMarkdown：# 粗体大写、- → •、``` 缩进块", () => {
    const lines = renderMarkdown("# Conclusion\n- strong evidence\n```\ny=1\n```\n").map(stripAnsi);
    expect(lines[0]).toBe("CONCLUSION");
    expect(lines[1]).toBe("• strong evidence");
    expect(lines[2]).toContain("┌ code");
    expect(lines[3]).toBe("  y=1");
    expect(lines[4]).toContain("└ end");
  });

  it("旧版 renderTimeline 兼容：事件数组 → 时间线行", () => {
    const lines = renderTimeline(
      [
        { type: "run:start", data: { question: "q1" } },
        { type: "phase:start", phase: "literature_search" },
        { type: "thinking", phase: "literature_search", data: { content: "第 1 轮推理中..." } },
        {
          type: "tool:result",
          phase: "literature_search",
          data: { toolName: "literature_search", toolResult: { papers: [{ id: 1 }, { id: 2 }] } },
        },
        { type: "phase:complete", phase: "literature_search" },
        { type: "run:complete", data: { evidenceCount: 1, knowledgeCount: 2, reportCount: 1 } },
      ],
      "p1",
    );
    const out = lines.join("\n");
    expect(out).toContain("● run:start  research started: q1");
    expect(out).toContain("● 文献调研 ✓");
    expect(out).toContain("2 papers");
    expect(out).toContain("1 evidence, 2 knowledge, 1 reports");
    expect(out).toContain("reports → GET /api/projects/p1/reports");
  });
});

describe("流式 thinking / 动画行（OpenCode 对标）", () => {
  it("thinkingDots：固定 3 字符宽度，dots 位置随 tick 循环", () => {
    expect(thinkingDots(0)).toBe("·  ");
    expect(thinkingDots(1)).toBe("·· ");
    expect(thinkingDots(2)).toBe("···");
    expect(thinkingDots(3)).toBe("·  "); // 循环
    // 所有可能的输出长度一致（不跳动）
    for (let t = 0; t < 10; t++) expect(thinkingDots(t).length).toBe(3);
  });

  it("thinkingLine：不同 tick 产出不同文本（随时间更新而非静态）", () => {
    const a = stripAnsi(thinkingLine(1, "第 1 轮推理中", 0, 0));
    const b = stripAnsi(thinkingLine(1, "第 1 轮推理中", 0, 1));
    expect(a).not.toBe(b);
    // dots 部分固定宽度（不导致行宽变化）
    expect(a.length).toBe(b.length);
  });

  it("splitAtDisplay：按显示宽度切分（CJK 边界对齐）", () => {
    expect(splitAtDisplay("abcdef", 3)).toEqual(["abc", "def"]);
    expect(splitAtDisplay("文献a", 2)).toEqual(["文", "献a"]);
    expect(splitAtDisplay("文献a", 5)).toEqual(["文献a", ""]);
    expect(splitAtDisplay("abc", 9)).toEqual(["abc", ""]);
  });
});

describe("排队可视化与帮助覆盖层", () => {
  it("queuedLine：◇ 已排队 + 文本", () => {
    const line = stripAnsi(queuedLine("下一轮做什么"));
    expect(line).toContain("◇");
    expect(line).toContain("已排队:");
    expect(line).toContain("下一轮做什么");
  });

  it("renderModel：queued 数组渲染为 ◇ 行（在 notice 之前）", () => {
    const model = emptyModel();
    model.status = "running";
    model.question = "主问题";
    model.queued = ["排一", "排二"];
    model.notice = "已排队：当前运行结束后自动发送";
    const out = stripAnsi(renderModel(model, 0, 0, 76).join("\n"));
    expect(out).toContain("◇ 已排队: 排一");
    expect(out).toContain("◇ 已排队: 排二");
    expect(out.indexOf("排一")).toBeLessThan(out.indexOf("已排队：当前运行")); // queued 在 notice 前
  });

  it("helpOverlayLines：标题 + 全部条目 + 关闭提示", () => {
    const lines = helpOverlayLines(76);
    const out = stripAnsi(lines.join("\n"));
    expect(out).toContain("按任意键关闭");
    expect(out).toContain("Enter");
    expect(out).toContain("↑ / ↓");
    expect(out).toContain("Ctrl+C");
    expect(out).toContain(":resume");
  });

  it("promptHint：报告就绪后提示 r 阅读模式", () => {
    const model = emptyModel();
    model.status = "complete";
    model.reportLines = ["报告"];
    expect(promptHint(model)).toContain("r 读报告");
  });
});
