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
  parseReportContent,
  truncateTail,
  wrapDisplay,
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

describe("尾部截断与 thinking 流式显示", () => {
  it("truncateTail：短文本原样、长文本保尾部 + 前置 …", () => {
    expect(truncateTail("abc", 10)).toBe("abc");
    expect(truncateTail("abcdefghij", 10)).toBe("abcdefghij");
    expect(truncateTail("0123456789abcdef", 10)).toBe("…789abcdef");
    expect(truncateTail("文献调研缺口识别假设生成", 11)).toBe("…别假设生成"); // CJK 不劈半字（10+…=11）
    expect(visibleWidth(truncateTail("文献调研缺口识别假设生成", 11))).toBe(11);
  });

  it("thinkingLine：长 note 尾部截断（流式末尾最新），轮次前缀不被挤掉", () => {
    const note = "组件贡献解耦、多/单agent复杂度阈值、反思收益递减、工具调用成本建模与记忆压缩率的权衡分析正在推进";
    const line = thinkingLine(1, note, 0, 0);
    const plain = stripAnsi(line);
    expect(plain).toContain("第 1 轮"); // 轮次前缀钉在行首
    expect(plain).toContain("…"); // 截断标记
    expect(plain).toContain("权衡分析正在推进"); // 尾部（最新）内容可见
    expect(plain).not.toContain("组件贡献解耦"); // 头部被截掉
  });

  it("thinkingLine：note 自带轮次前缀时整体尾部截断", () => {
    const note = "第 1 轮推理中——组件贡献解耦与反思收益递减的长期权衡分析仍在继续推进当中";
    const plain = stripAnsi(thinkingLine(1, note, 0, 0));
    expect(plain).toContain("第 1 轮");
    expect(plain).toContain("推进当中");
  });
});

describe("假设卡片多行显示", () => {
  it("短假设：单行正文，盒框完整", () => {
    const card = hypothesisCard("RAG 减少 hallucination").map(stripAnsi);
    expect(card).toHaveLength(3);
    expect(card[0]).toMatch(/┌ hypothesis ─+┐/);
    expect(card[1]).toContain("RAG 减少 hallucination");
    expect(card[2]).toMatch(/└─+┘/);
  });

  it("长假设（CJK）：按宽度-6 换行，最多 3 行，超出末行 … 收尾", () => {
    const width = 72;
    const statement =
      "在受控实验中，agent架构的规划、记忆、工具调用、反思四大核心组件对任务完成率的影响可以解耦量化，且各组件的边际收益随任务复杂度呈现不同的阈值效应，多agent协作仅在超过特定复杂度后优于单agent，且该复杂度阈值随上下文长度增加而显著上移，需要通过消融实验逐项验证各组件的独立贡献";
    const card = hypothesisCard(statement, width).map(stripAnsi);
    expect(card[0]).toMatch(/┌ hypothesis ─+┐/);
    expect(card[card.length - 1]).toMatch(/└─+┘/);
    const body = card.slice(1, -1);
    expect(body).toHaveLength(3); // 最多 3 行
    expect(body.join("")).toContain("…"); // 超出截断标记
    // 每行正文显示宽度 = width - 6（`│ ` + 正文 + ` │`）
    for (const row of body) {
      expect(visibleWidth(row)).toBe(width - 2);
    }
    // 头部信息保留（前两行完整展示）
    expect(body[0]).toContain("在受控实验中");
    expect(body[0]).toContain("agent"); // 前部内容在第 1 行可见
    expect(body[1]).toContain("边际收益"); // 第 2 行承接后续内容
  });

  it("wrapDisplay：换行不劈半 CJK、行数上限生效", () => {
    const rows = wrapDisplay("文献调研缺口识别假设生成实验执行", 10);
    for (const r of rows) expect(visibleWidth(r)).toBeLessThanOrEqual(10);
    expect(rows.join("")).toBe("文献调研缺口识别假设生成实验执行"); // 无内容丢失
    const capped = wrapDisplay("a".repeat(100), 10, 2);
    expect(capped).toHaveLength(2);
    expect(capped[1].endsWith("…")).toBe(true);
    // 换行符归一为空格
    expect(wrapDisplay("第一行\n第二行", 40)).toEqual(["第一行 第二行"]);
  });
});

describe("报告 JSON 解析 parseReportContent", () => {
  it("后端真实 schema：{abstract, sections:[{title,content}]} → Markdown", () => {
    const raw = JSON.stringify({
      abstract: "本报告基于四个待验证假设（db44d3a1）系统评估 agent 架构组件贡献。",
      sections: [
        { title: "Introduction", content: "研究背景与动机。" },
        { title: "Results", content: "规划组件贡献最大。" },
      ],
    });
    const out = parseReportContent(raw);
    expect(out).toContain("## Abstract");
    expect(out).toContain("本报告基于四个待验证假设");
    expect(out).toContain("## Introduction");
    expect(out).toContain("研究背景与动机。");
    expect(out).toContain("## Results");
    expect(out).not.toContain('{"abstract"'); // 不再是 raw JSON
  });

  it("通用字段：introduction/methods/results/conclusion/content/body/text", () => {
    const out = parseReportContent(
      JSON.stringify({ introduction: "背景", methods: "方法", results: "结果", conclusion: "结论" }),
    );
    expect(out).toContain("## Introduction\n背景");
    expect(out).toContain("## Methods\n方法");
    expect(out).toContain("## Results\n结果");
    expect(out).toContain("## Conclusion\n结论");
    const out2 = parseReportContent(JSON.stringify({ content: "正文" }));
    expect(out2).toBe("正文");
    const out3 = parseReportContent(JSON.stringify({ body: "主体" }));
    expect(out3).toBe("主体");
    const out4 = parseReportContent(JSON.stringify({ text: "文本" }));
    expect(out4).toBe("文本");
  });

  it("非 JSON / 坏 JSON / 非对象 JSON：原样返回", () => {
    const md = "# 研究报告\n\n正文 Markdown。";
    expect(parseReportContent(md)).toBe(md);
    expect(parseReportContent("{broken json")).toBe("{broken json");
    expect(parseReportContent("[1,2]")).toBe("[1,2]");
    expect(parseReportContent(JSON.stringify({ noKnownField: 1 }))).toBe(JSON.stringify({ noKnownField: 1 }));
  });

  it("空字段跳过、sections 非法条目忽略", () => {
    const out = parseReportContent(JSON.stringify({ abstract: "  ", sections: [null, 42, { title: "T", content: "C" }] }));
    expect(out).toContain("## T\nC");
    expect(out).not.toContain("## Abstract");
  });
});
