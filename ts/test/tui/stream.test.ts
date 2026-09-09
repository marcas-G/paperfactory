/**
 * stream.ts 单测 —— RunTracker 状态机：事件 → 模型（注入时钟）。
 */
import { describe, it, expect } from "vitest";
import { RunTracker, summarizeArgs, brief } from "../../packages/tui/src/stream";
import { stripAnsi } from "../../packages/tui/src/render";
import type { DomainEvent } from "../../packages/client/src";

let clock = 1000;
const now = (): number => clock;

function ev(type: string, extra: Partial<DomainEvent> = {}): DomainEvent {
  return { type, projectId: "p1", runId: "run-1", ...extra };
}

function tracker(): RunTracker {
  clock = 1000;
  return new RunTracker("auto", now);
}

describe("RunTracker 状态机", () => {
  it("run:start 重置模型并登记 question/runId/projectId", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "scaling laws" } }));
    expect(t.model.status).toBe("running");
    expect(t.model.question).toBe("scaling laws");
    expect(t.model.runId).toBe("run-1");
    expect(t.model.projectId).toBe("p1");
    expect(t.model.phases).toHaveLength(0);
  });

  it("phase:start → thinking → phase:complete 生命周期", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.handle(ev("phase:start", { phase: "literature_search" }));
    clock += 2000;
    t.handle(ev("thinking", { phase: "literature_search", data: { content: "第 1 轮推理中...", iteration: 1 } }));
    clock += 3000;
    t.handle(ev("phase:complete", { phase: "literature_search" }));
    const phase = t.model.phases[0];
    expect(phase.status).toBe("complete");
    expect(phase.endedAt).toBe(6000);
    expect(phase.lines[0].kind).toBe("thinking");
  });

  it("thinking：同轮更新末行，新轮追加", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.handle(ev("phase:start", { phase: "gap_identification" }));
    t.handle(ev("thinking", { phase: "gap_identification", data: { content: "推理中", iteration: 1 } }));
    t.handle(ev("thinking", { phase: "gap_identification", data: { content: "反思结果", iteration: 1 } }));
    t.handle(ev("thinking", { phase: "gap_identification", data: { content: "第 2 轮", iteration: 2 } }));
    const lines = t.model.phases[0].lines;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ kind: "thinking", iteration: 1, note: "反思结果" });
    expect(lines[1]).toMatchObject({ kind: "thinking", iteration: 2 });
  });

  it("tool:calling → tool:result 就地更新 + papers 展开", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.handle(ev("phase:start", { phase: "literature_search" }));
    t.handle(
      ev("tool:calling", {
        phase: "literature_search",
        data: { toolName: "literature_search", toolArgs: { query: "scaling law", maxResults: 5 } },
      }),
    );
    t.handle(
      ev("tool:result", {
        phase: "literature_search",
        data: {
          toolName: "literature_search",
          content: "[...]",
          toolResult: {
            papers: [
              { title: "Paper A", url: "https://arxiv.org/abs/1" },
              { title: "Paper B", url: "https://arxiv.org/abs/2" },
            ],
          },
        },
      }),
    );
    const lines = t.model.phases[0].lines;
    expect(lines[0]).toMatchObject({ kind: "tool", toolName: "literature_search", state: "done", resultSummary: "2 papers" });
    expect(lines[1]).toMatchObject({ kind: "papers" });
    expect((lines[1] as { papers: { title: string }[] }).papers[1].title).toBe("Paper B");
  });

  it("tool:result 失败（Error: 前缀）标记 failed", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.handle(ev("phase:start", { phase: "experiment_execution" }));
    t.handle(ev("tool:calling", { phase: "experiment_execution", data: { toolName: "code", toolArgs: { language: "python" } } }));
    t.handle(ev("tool:result", { phase: "experiment_execution", data: { toolName: "code", content: "Error: sandbox timeout" } }));
    expect(t.model.phases[0].lines[0]).toMatchObject({ kind: "tool", state: "failed" });
  });

  it("phase:awaiting_approval 记录 phaseRunId（取自事件的 runId 字段）", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.handle(ev("phase:start", { phase: "hypothesis_generation" }));
    t.handle(
      ev("phase:awaiting_approval", {
        runId: "phase-run-42", // 服务端此事件的 runId 是 phaseRunId
        phase: "hypothesis_generation",
        data: { summary: "提出 3 个假设" },
      }),
    );
    expect(t.model.approval).toMatchObject({ phaseRunId: "phase-run-42", summary: "提出 3 个假设" });
    t.resolveApproval("approve");
    expect(t.model.approval).toBeNull();
    const line = t.model.phases[0].lines.find((l) => l.kind === "approval");
    expect(line).toMatchObject({ kind: "approval", resolved: "已批准" });
  });

  it("run:complete：状态/收尾统计/假设卡片/token 清算", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.handle(ev("phase:start", { phase: "report_generation" }));
    t.handle(ev("run:complete", { data: { evidenceCount: 3, knowledgeCount: 5, reportCount: 1, hypothesisStatements: ["H1: ..."] } }));
    expect(t.model.status).toBe("complete");
    const out = t.model.epilogue.map(stripAnsi).join("\n");
    expect(out).toContain("3 evidence · 5 knowledge · 1 reports");
    expect(out).toContain("hypothesis");
    expect(t.model.phases[0].status).toBe("complete"); // 残留 running 一并收口
  });

  it("run:error：epilogue 带原因", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.handle(ev("phase:start", { phase: "literature_search" }));
    t.handle(ev("run:error", { data: { error: "LLM provider unreachable" } }));
    expect(t.model.status).toBe("error");
    expect(t.model.epilogue.map(stripAnsi).join()).toContain("LLM provider unreachable");
  });

  it("markStopped：running 阶段转 skipped + notice", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.handle(ev("phase:start", { phase: "literature_search" }));
    t.markStopped("用户按下 Esc");
    expect(t.model.status).toBe("stopped");
    expect(t.model.phases[0].status).toBe("skipped");
    expect(t.model.notice).toContain("Esc");
  });

  it("phase:progress 被跳过 → 补 skipped 阶段块；token 累计", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.handle(ev("phase:progress", { phase: "literature_search", data: { content: "阶段 文献调研 被跳过" } }));
    t.handle(ev("phase:progress", { phase: "gap_identification", data: { content: "阶段 缺口识别 已保存 (v1)" } }));
    expect(t.model.phases[0]).toMatchObject({ name: "literature_search", status: "skipped" });
    expect(t.model.tokens).toBeGreaterThan(0);
  });
});

describe("载荷工具", () => {
  it("summarizeArgs：query 优先，其次 code 首行，兜底 JSON", () => {
    expect(summarizeArgs({ query: "rag hallucination" })).toBe('"rag hallucination"');
    expect(summarizeArgs({ code: "import numpy\n..." })).toBe("code import numpy");
    expect(summarizeArgs({ foo: "bar" })).toBe('{"foo":"bar"}');
    expect(summarizeArgs(undefined)).toBeUndefined();
  });

  it("brief：取第一行非空内容", () => {
    expect(brief("\n\nfirst line here\nsecond")).toBe("first line here");
  });
});

describe("排队问题（跨 run 可视化）", () => {
  it("enqueueQuestion → model.queued 追加 + notice；dequeueQuestion FIFO", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.enqueueQuestion("第一问");
    t.enqueueQuestion("第二问");
    expect(t.model.queued).toEqual(["第一问", "第二问"]);
    expect(t.model.notice).toContain("已排队");
    expect(t.dequeueQuestion()).toBe("第一问");
    expect(t.dequeueQuestion()).toBe("第二问");
    expect(t.dequeueQuestion()).toBeUndefined();
  });

  it("reset 保留 queued（排队意图跨 run 不丢）", () => {
    const t = tracker();
    t.handle(ev("run:start", { data: { question: "q" } }));
    t.enqueueQuestion("待发");
    t.reset();
    expect(t.model.queued).toEqual(["待发"]);
    // run:start 内部也 reset —— 排队仍应在
    t.handle(ev("run:start", { data: { question: "q2" } }));
    expect(t.model.queued).toEqual(["待发"]);
    expect(t.model.question).toBe("q2");
  });

  it("clearQueued 清空", () => {
    const t = tracker();
    t.enqueueQuestion("a");
    t.clearQueued();
    expect(t.model.queued).toEqual([]);
  });
});
