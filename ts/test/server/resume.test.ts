/**
 * REQ-REC4：研究任务断点续跑（phase 级）
 *
 * 覆盖三层：
 * 1. lastCompletedPhase 断点判定——COMPLETED 的最靠后契约阶段；无记录 → null
 * 2. runAgentDrivenResearch resumeFromPhase 分支——跳过已完成阶段（不重跑、
 *    发"恢复：跳过已完成阶段"事件）、从下一阶段继续
 * 3. POST /api/research/resume 端点——400/404/202 语义 + 事件进 eventBus
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as Effect from "effect/Effect";
import { InMemoryObjectStore } from "@pf/core/persistence/object-store";
import { InMemoryEventStore } from "@pf/core/persistence/event-store";
import { ResearchController } from "@pf/core/control/controller";
import { TransitionEngine } from "@pf/core/control/engine";
import { ActionRegistry } from "@pf/core/control/registry";
import { ToolRegistry } from "@pf/core/runtime/tools/registry";
import { DeterministicProvider } from "@pf/core/runtime/provider-deterministic";
import { createPhaseRun } from "@pf/schema/objects/phase-run";
import { createHonoApp, type HonoApp } from "@pf/server/routes";
import { runAgentDrivenResearch, lastCompletedPhase } from "@pf/research/agent-research";
import { PHASE_CONTRACTS } from "@pf/research/phase-contracts";
import { eventBus, type DomainEvent } from "@pf/core/ledger/events";
import type { AgentEvent } from "@pf/core/runtime/agent/loop";
import type { Provider, ToolDefinition, Message, ProviderResponse } from "@pf/core/runtime/provider";

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

const PROJECT_ID = "00000000-0000-4000-a000-0000000000aa";
const BRANCH_ID = "00000000-0000-4000-a000-0000000000bb";

/** 恒定返回合法 mega-JSON 的 provider（不耗尽；各阶段 schema 均可解析） */
class FixedJsonProvider implements Provider {
  private calls = 0;
  constructor(private readonly content: string) {}
  getCallCount(): number {
    return this.calls;
  }
  sendMessages(
    _messages: ReadonlyArray<Message>,
    _options?: { model?: string; temperature?: number; maxTokens?: number; tools?: ReadonlyArray<ToolDefinition> }
  ): Effect.Effect<ProviderResponse, string> {
    this.calls++;
    return Effect.succeed({ content: this.content, stopReason: "end_turn" });
  }
  streamResponse(
    _messages: ReadonlyArray<Message>,
    _options?: { model?: string; temperature?: number; maxTokens?: number; tools?: ReadonlyArray<ToolDefinition> }
  ): Effect.Effect<never, string> {
    return Effect.succeed(null) as unknown as Effect.Effect<never, string>;
  }
}

const MEGA_JSON = JSON.stringify({
  keyFindings: [{ finding: "F1", sourceTitle: "P1", sourceUrl: "https://example.com" }],
  researchGaps: [{ gap: "G1", whyItMatters: "W" }],
  methodologies: ["M"],
  hypotheses: [{ statement: "X causes Y", researchValue: "High", falsificationCondition: "not X" }],
  design: { objective: "Test X", variables: ["A"], controls: ["B"] },
  expectedResults: "X increases Y",
  falsificationCriteria: "X does not increase Y",
  assessments: [{ evidenceId: "e1", direction: "SUPPORTING", strength: 0.9, reasoning: "R", limitations: [] }],
  conclusion: { status: "CONFIRMED", reasoning: "R" },
  status: "CONFIRMED",
  reasoning: "R",
  researchValue: "V",
  abstract: "A",
  sections: [{ title: "T", content: "C" }],
  gaps: [{ description: "G", evidenceOfGap: "E", researchValue: "V" }],
  output: "out",
  analysis: "A",
  direction: "SUPPORTING",
  strength: 0.85,
});

function buildControllerCtx() {
  const objectStore = new InMemoryObjectStore();
  const eventStore = new InMemoryEventStore();
  const controller = new ResearchController(objectStore, eventStore, new TransitionEngine(), new ActionRegistry());
  return { objectStore, eventStore, controller };
}

async function seedCompletedPhaseRun(
  objectStore: InMemoryObjectStore,
  projectId: string,
  phaseName: string,
): Promise<void> {
  const phaseRun = createPhaseRun({
    projectId,
    phaseName,
    phaseVersion: 1,
    status: "COMPLETED",
    active: true,
  });
  await Effect.runPromise(objectStore.save(phaseRun as unknown as Record<string, unknown>));
}

/** 轮询 eventBus 快照直到谓词命中（超时抛错） */
async function waitForEvent(pred: (e: DomainEvent) => boolean, timeoutMs = 30_000): Promise<DomainEvent> {
  const started = Date.now();
  for (;;) {
    const hit = eventBus.since(0).find(pred);
    if (hit) return hit;
    if (Date.now() - started > timeoutMs) throw new Error("waitForEvent timeout");
    await new Promise((r) => setTimeout(r, 50));
  }
}

/* ------------------------------------------------------------------ */
/*  1. lastCompletedPhase 断点判定                                      */
/* ------------------------------------------------------------------ */

describe("lastCompletedPhase (REQ-REC4)", () => {
  let objectStore: InMemoryObjectStore;

  beforeEach(() => {
    objectStore = new InMemoryObjectStore();
  });

  it("无任何 PhaseRun → null（全量重跑）", async () => {
    expect(await lastCompletedPhase(objectStore, PROJECT_ID)).toBeNull();
  });

  it("有 COMPLETED 记录 → 返回契约序列中最靠后的完成阶段", async () => {
    await seedCompletedPhaseRun(objectStore, PROJECT_ID, "literature_search");
    expect(await lastCompletedPhase(objectStore, PROJECT_ID)).toBe("literature_search");

    await seedCompletedPhaseRun(objectStore, PROJECT_ID, "hypothesis_generation");
    expect(await lastCompletedPhase(objectStore, PROJECT_ID)).toBe("hypothesis_generation");
  });

  it("ERROR 状态与其他项目的记录不参与判定", async () => {
    const otherProject = "00000000-0000-4000-a000-0000000000cc";
    await seedCompletedPhaseRun(objectStore, otherProject, "confirmation");
    const errored = createPhaseRun({ projectId: PROJECT_ID, phaseName: "experiment_design", status: "ERROR" });
    await Effect.runPromise(objectStore.save(errored as unknown as Record<string, unknown>));

    expect(await lastCompletedPhase(objectStore, PROJECT_ID)).toBeNull();
    expect(await lastCompletedPhase(objectStore, otherProject)).toBe("confirmation");
  });
});

/* ------------------------------------------------------------------ */
/*  2. runAgentDrivenResearch resumeFromPhase 分支                      */
/* ------------------------------------------------------------------ */

describe("runAgentDrivenResearch resumeFromPhase (REQ-REC4)", () => {
  let objectStore: InMemoryObjectStore;
  let provider: FixedJsonProvider;
  let events: AgentEvent[];

  beforeEach(() => {
    objectStore = new InMemoryObjectStore();
    provider = new FixedJsonProvider(MEGA_JSON);
    events = [];
  });

  it("resumeFromPhase=literature_search：跳过该阶段，从 gap_identification 继续，不重跑", async () => {
    await seedCompletedPhaseRun(objectStore, PROJECT_ID, "literature_search");

    const result = await runAgentDrivenResearch({
      projectId: PROJECT_ID,
      branchId: BRANCH_ID,
      question: "Test?",
      provider,
      objectStore,
      eventStore: new InMemoryEventStore(),
      controller: new ResearchController(objectStore, new InMemoryEventStore(), new TransitionEngine(), new ActionRegistry()),
      toolRegistry: new ToolRegistry(),
      toolDefinitions: [],
      resumeFromPhase: "literature_search",
      onEvent: (e) => events.push(e),
      shouldStop: () => false,
    });

    // 发过"恢复：跳过已完成阶段"事件
    const resumeEvent = events.find(
      (e) => e.type === "phase:progress" && (e.content ?? "").startsWith("恢复：跳过已完成阶段")
    );
    expect(resumeEvent).toBeTruthy();
    expect(resumeEvent?.content).toBe("恢复：跳过已完成阶段 literature_search");

    // 从下一阶段继续，跑完剩余 7 个
    expect(result.phases.length).toBe(PHASE_CONTRACTS.length - 1);
    expect(result.phases[0].phaseName).toBe("gap_identification");
    expect(result.phases.at(-1)?.phaseName).toBe("report_generation");

    // literature_search 未重跑：该项目该阶段的 PhaseRun 仍只有预置的 1 条
    const phaseRuns = (await Effect.runPromise(objectStore.list("PhaseRun"))) as Array<Record<string, unknown>>;
    const litRuns = phaseRuns.filter((r) => r.projectId === PROJECT_ID && r.phaseName === "literature_search");
    expect(litRuns.length).toBe(1);
    expect(litRuns[0].phaseVersion).toBe(1); // 预置那条，无新增版本
  });

  it("无 PhaseRun 的项目 resumeFromPhase=null → 全程跑（8 阶段，无恢复事件）", async () => {
    const result = await runAgentDrivenResearch({
      projectId: PROJECT_ID,
      branchId: BRANCH_ID,
      question: "Test?",
      provider,
      objectStore,
      eventStore: new InMemoryEventStore(),
      controller: new ResearchController(objectStore, new InMemoryEventStore(), new TransitionEngine(), new ActionRegistry()),
      toolRegistry: new ToolRegistry(),
      toolDefinitions: [],
      onEvent: (e) => events.push(e),
      shouldStop: () => false,
    });

    expect(result.phases.length).toBe(PHASE_CONTRACTS.length);
    expect(result.phases[0].phaseName).toBe("literature_search");
    expect(events.find((e) => (e.content ?? "").includes("恢复：跳过"))).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  3. POST /api/research/resume 端点                                   */
/* ------------------------------------------------------------------ */

describe("POST /api/research/resume (REQ-REC4)", () => {
  let app: HonoApp;
  let objectStore: InMemoryObjectStore;
  let unsubscribe: () => void = () => {};
  const collected: DomainEvent[] = [];

  beforeEach(() => {
    eventBus.clearForTest();
    collected.length = 0;
    unsubscribe = eventBus.subscribe((e) => collected.push(e));

    const ctx = buildControllerCtx();
    objectStore = ctx.objectStore;
    const provider = new DeterministicProvider({
      name: "resume-test",
      responses: [{ content: "ok", stopReason: "stop" }],
    });
    app = createHonoApp(objectStore, ctx.controller, provider);
  });

  afterEach(() => {
    unsubscribe();
    eventBus.clearForTest();
  });

  it("缺 projectId → 400 统一 ApiError", async () => {
    const res = await app.request("/api/research/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("项目不存在 → 404 统一 ApiError", async () => {
    const res = await app.request("/api/research/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "proj-nonexistent" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("有 COMPLETED 阶段记录的项目 → 202 + resumeFromPhase，恢复事件进 eventBus，未完成阶段继续", async () => {
    // 建项目（question = name）
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "rec4 断点续跑问题" }),
    });
    expect(created.status).toBe(201);
    const { id: projectId } = (await created.json()) as { id: string };

    // 预置 literature_search COMPLETED（模拟中断前已完成的阶段）
    await seedCompletedPhaseRun(objectStore, projectId, "literature_search");

    const res = await app.request("/api/research/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { runId: string; projectId: string; resumeFromPhase: string | null; status: string };
    expect(body.runId).toBeTruthy();
    expect(body.projectId).toBe(projectId);
    expect(body.resumeFromPhase).toBe("literature_search");
    expect(body.status).toBe("started");

    // run:start（带 resumed 标记）+ "恢复：跳过" phase:progress 进事件流
    await waitForEvent((e) => e.type === "run:start" && e.runId === body.runId && e.data?.resumed === true);
    const resumeEvt = await waitForEvent(
      (e) => e.type === "phase:progress" && typeof e.data?.content === "string" && (e.data.content as string).startsWith("恢复：跳过已完成阶段")
    );
    expect((resumeEvt.data?.content as string)).toBe("恢复：跳过已完成阶段 literature_search");

    // 后台 run 推进到完成（DeterministicProvider 无 JSON → 阶段无产物但流程走完）
    await waitForEvent((e) => e.type === "run:complete" && e.runId === body.runId);

    // literature_search 未重跑：PhaseRun 仍只有预置 1 条
    const phaseRuns = (await Effect.runPromise(objectStore.list("PhaseRun"))) as Array<Record<string, unknown>>;
    const litRuns = phaseRuns.filter((r) => r.projectId === projectId && r.phaseName === "literature_search");
    expect(litRuns.length).toBe(1);
  });

  it("无阶段记录的项目 → 202 + resumeFromPhase=null（全量重跑）", async () => {
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "rec4 全量项目" }),
    });
    const { id: projectId } = (await created.json()) as { id: string };

    const res = await app.request("/api/research/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { resumeFromPhase: string | null };
    expect(body.resumeFromPhase).toBeNull();

    await waitForEvent((e) => e.type === "run:complete" && e.data?.resumed === true);
    // 全量路径：从 literature_search 开始（有 phase:start），无恢复跳过事件
    expect(
      eventBus.since(0).find((e) => e.type === "phase:start" && e.phase === "literature_search")
    ).toBeTruthy();
    expect(
      collected.find((e) => typeof e.data?.content === "string" && (e.data.content as string).startsWith("恢复：跳过"))
    ).toBeUndefined();
  });
});
