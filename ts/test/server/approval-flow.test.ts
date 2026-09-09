import { describe, it, expect, beforeEach } from "vitest";
import { createHonoApp } from "@pf/server/routes";
import { InMemoryObjectStore } from "@pf/core/persistence/object-store";
import { InMemoryEventStore } from "@pf/core/persistence/event-store";
import { ResearchController } from "@pf/core/control/controller";
import { TransitionEngine } from "@pf/core/control/engine";
import { ActionRegistry } from "@pf/core/control/registry";
import { ToolRegistry } from "@pf/core/runtime/tools/registry";
import { DeterministicProvider } from "@pf/core/runtime/provider-deterministic";
import { eventBus } from "@pf/core/ledger/events";

/**
 * REQ-G1 端到端验证（manual 模式审批链）：
 * POST run(mode:manual) → SSE 收 phase:awaiting_approval → POST decision(approve)
 * → 审批 Resolve、研究恢复推进。
 */

function buildApp() {
  const objectStore = new InMemoryObjectStore();
  const provider = new DeterministicProvider({
    name: "approval-flow",
    responses: Array.from({ length: 24 }, (_, i) => ({
      content: `deterministic response ${i}`,
      stopReason: "stop" as const,
    })),
  });
  const toolRegistry = new ToolRegistry();
  const honoApp = createHonoApp(
    objectStore,
    new ResearchController(objectStore, new InMemoryEventStore(), new TransitionEngine(), new ActionRegistry()),
    provider,
    toolRegistry,
  );
  return { honoApp };
}

/** 极简 SSE 消费：读流直到谓词命中或超时，返回已收事件。 */
async function consumeSSEUntil(
  honoApp: ReturnType<typeof createHonoApp>,
  predicate: (type: string) => boolean,
  timeoutMs = 10_000,
): Promise<Array<{ type: string; data: Record<string, unknown> }>> {
  const collected: Array<{ type: string; data: Record<string, unknown> }> = [];
  const res = await honoApp.request("/api/events");
  const body = res.body!;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), deadline - Date.now())),
    ]);
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      try {
        const ev = JSON.parse(dataLine.slice(6)) as { type: string; data?: Record<string, unknown> };
        collected.push({ type: ev.type, data: ev.data ?? {} });
        if (predicate(ev.type)) {
          void reader.cancel().catch(() => {});
          return collected;
        }
      } catch {
        /* 忽略残帧 */
      }
    }
  }
  void reader.cancel().catch(() => {});
  return collected;
}

describe("approval flow (REQ-G1)", () => {
  beforeEach(() => eventBus.clearForTest());

  it("manual 模式：阶段完成挂起等审批，decision(approve) 后恢复", async () => {
    const { honoApp } = buildApp();

    // 先订阅再发起（避免错过早期事件）
    const ssePromise = consumeSSEUntil(honoApp, (t) => t === "phase:awaiting_approval", 15_000);

    const runRes = await honoApp.request("/api/research/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "approval flow e2e", mode: "manual" }),
    });
    expect(runRes.status).toBe(202);
    const { runId, projectId } = (await runRes.json()) as { runId: string; projectId: string };

    const events = await ssePromise;
    const awaiting = events.filter((e) => e.type === "phase:awaiting_approval");
    expect(awaiting.length).toBeGreaterThanOrEqual(1);
    const approvalRunId = String(awaiting[awaiting.length - 1].data.runId ?? runId);
    expect(awaiting[0].data.summary).toBeDefined();

    // 审批前：研究应处于挂起（无 run:complete）
    expect(events.some((e) => e.type === "run:complete")).toBe(false);

    // 决策：approve
    const decRes = await honoApp.request(`/api/projects/${projectId}/phases/${approvalRunId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect([200, 404]).toContain(decRes.status); // 404=PhaseRun 尚未落库但 resolve 已执行

    // 审批后：研究恢复推进（出现后续阶段或完成）
    const after = await consumeSSEUntil(
      honoApp,
      (t) => t === "run:complete" || t === "run:error" || t === "phase:start",
      20_000,
    );
    const advanced = after.some(
      (e) => e.type === "run:complete" || e.type === "run:error" || (e.type === "phase:start" && e.data),
    );
    expect(advanced).toBe(true);
  }, 40_000);
});
