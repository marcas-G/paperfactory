/**
 * TUI 时间线渲染单测 —— render.ts 是纯函数（事件数组 → 行文本），
 * 断言对照 docs/PROTOCOL.md 事件目录与规定的行格式：
 * run:start → phase:start → thinking → tool:result(N papers) → phase:complete → run:complete
 */
import { describe, it, expect } from "vitest";
import { PHASE_LABELS, renderTimeline, truncate } from "../../packages/tui/src/render";
import type { DomainEvent } from "../../packages/client/src";

function ev(type: string, extra: Partial<DomainEvent> = {}): DomainEvent {
  return { type, projectId: "p1", runId: "r1", ...extra };
}

const SMOKE_EVENTS: DomainEvent[] = [
  ev("run:start", { data: { question: "tui smoke test" } }),
  ev("phase:start", { phase: "literature_search" }),
  ev("thinking", { phase: "literature_search", data: { content: "第 1 轮推理中...", iteration: 1 } }),
  ev("tool:result", {
    phase: "literature_search",
    data: {
      toolName: "literature_search",
      toolResult: { content: "[...]", papers: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }], source: "arxiv" },
    },
  }),
  ev("phase:complete", { phase: "literature_search" }),
  ev("run:complete", { data: { evidenceCount: 3, knowledgeCount: 5, reportCount: 1 } }),
];

describe("TUI renderTimeline", () => {
  it("渲染完整事件链：run 头/阶段头/子行树/阶段完成/run 完成", () => {
    const lines = renderTimeline(SMOKE_EVENTS, "p1");
    const out = lines.join("\n");

    expect(out).toContain("● run:start  research started: tui smoke test");
    expect(out).toContain("● 文献调研");
    expect(out).toMatch(/│ {2}├ thinking\s+第 1 轮推理中\.\.\./);
    expect(out).toContain("│  └ literature_search  5 papers ✓");
    expect(out).toContain("● 文献调研 ✓");
    expect(out).toContain("● run:complete ✓  3 evidence, 5 knowledge, 1 reports");
    expect(out).toContain("reports → GET /api/projects/p1/reports");
  });

  it("阶段内非末子行用 ├，末子行用 └", () => {
    const lines = renderTimeline(SMOKE_EVENTS, "p1");
    const thinking = lines.find((l) => l.includes("thinking"));
    const toolResult = lines.find((l) => l.includes("literature_search"));
    expect(thinking).toMatch(/^│ {2}├ /);
    expect(toolResult).toMatch(/^│ {2}└ /);
  });

  it("stream:ready 与未知事件不产生行", () => {
    const lines = renderTimeline([
      ev("stream:ready"),
      ...SMOKE_EVENTS,
      ev("mystery:event", { data: { content: "x" } }),
    ]);
    expect(lines.every((l) => !l.includes("stream:ready"))).toBe(true);
    expect(lines.every((l) => !l.includes("mystery"))).toBe(true);
  });

  it("run:error 渲染错误摘要", () => {
    const lines = renderTimeline([
      ev("run:start", { data: { question: "q" } }),
      ev("run:error", { data: { error: "LLM provider unreachable: connect ECONNREFUSED" } }),
    ]);
    expect(lines.join("\n")).toContain("● run:error  LLM provider unreachable: connect ECONNREFUSED");
  });

  it("phase:error 渲染 ✗ 与原因，tool:result 无 papers 数组时只显示工具名", () => {
    const lines = renderTimeline([
      ev("phase:start", { phase: "gap_identification" }),
      ev("thinking", { phase: "gap_identification", data: { content: "第 1 轮推理中..." } }),
      ev("tool:result", { phase: "gap_identification", data: { toolName: "search", content: "ok" } }),
      ev("phase:error", { phase: "gap_identification", data: { content: "provider timeout" } }),
    ]);
    const out = lines.join("\n");
    expect(out).toContain("● 缺口识别");
    expect(out).toContain("│  └ search");
    expect(out).toContain("● 缺口识别 ✗ provider timeout");
  });

  it("长问题截断到 60 字符", () => {
    const long = "x".repeat(100);
    const line = renderTimeline([ev("run:start", { data: { question: long } })])[0];
    expect(line.length).toBeLessThanOrEqual("● run:start  research started: ".length + 60);
    expect(line.endsWith("…")).toBe(true);
  });

  it("8 个阶段名都有中文映射", () => {
    expect(Object.keys(PHASE_LABELS)).toHaveLength(8);
    expect(PHASE_LABELS.literature_search).toBe("文献调研");
    expect(PHASE_LABELS.report_generation).toBe("报告生成");
  });

  it("truncate：短文本原样，长文本截断带省略号", () => {
    expect(truncate("abc", 5)).toBe("abc");
    expect(truncate("abcdef", 5)).toBe("abcd…");
  });
});
