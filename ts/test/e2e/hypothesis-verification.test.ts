import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createTestContext } from "../fixtures/test-context";
import { createDeterministicProvider } from "@runtime/provider-deterministic";
import {
  createHypothesisVerificationWorkflow,
  runWorkflow,
} from "@runtime/workflows/hypothesis-verification";
import { createHypothesis } from "@domain/objects/hypothesis";
import { createResearchGap } from "@domain/objects/gap";

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe("E2E: Hypothesis Verification", () => {
  it("hypothesis -> verify -> confirm", async () => {
    const projectId = "00000000-0000-4000-a000-000000000000";
    const branchId = "00000000-0000-4000-a000-000000000000";
    const gapId = generateUuid();
    const hypothesisId = generateUuid();

    const provider = createDeterministicProvider({
      name: "confirm-hypothesis",
      responses: [
        {
          content: "Based on the evidence, the hypothesis is confirmed.",
          stopReason: "stop",
        },
      ],
    });

    const ctx = createTestContext({ provider });

    const gap = createResearchGap({
      gapId,
      projectId,
      branchId,
      description: "We don't know if X causes Y",
      status: "IDENTIFIED",
    });
    await Effect.runPromise(ctx.objectStore.save(gap));

    const hypothesis = createHypothesis({
      hypothesisId,
      projectId,
      branchId,
      gapId,
      statement: "X causes Y under conditions Z",
      falsificationCondition: "If statistical test shows p > 0.05, hypothesis is falsified",
      status: "PROPOSED",
    });
    await Effect.runPromise(ctx.objectStore.save(hypothesis));

    const phases = createHypothesisVerificationWorkflow({
      hypothesisId,
      projectId,
      branchId,
      objectStore: ctx.objectStore,
      eventStore: ctx.eventStore,
      controller: ctx.controller,
      literatureResults: [
        { summary: "Previous study found X is correlated with Y", certaintyLevel: 0.7 },
        { summary: "Meta-analysis confirms X-Y relationship", certaintyLevel: 0.85 },
      ],
    });

    const state = await runWorkflow(phases);
    expect(state.status).toBe("completed");
    expect(state.phaseIndex).toBe(6);

    const opt = await Effect.runPromise(ctx.objectStore.get(hypothesisId, "Hypothesis"));
    expect(opt.isSome()).toBe(true);
    const stored = opt.value as Record<string, unknown>;
    expect(stored.status).toBe("CONFIRMED");

    const evidenceList = await Effect.runPromise(ctx.objectStore.list("Evidence"));
    expect(evidenceList.length).toBeGreaterThanOrEqual(1);
    const evidence = evidenceList[0] as Record<string, unknown>;
    expect(evidence.status).toBe("VALIDATED");
    expect(evidence.direction).toBe("SUPPORTING");

    const knowledgeList = await Effect.runPromise(ctx.objectStore.list("KnowledgeItem"));
    expect(knowledgeList.length).toBeGreaterThanOrEqual(2);
  });

  it("workflow completes without literature results", async () => {
    const projectId = "00000000-0000-4000-a000-000000000000";
    const branchId = "00000000-0000-4000-a000-000000000000";
    const hypothesisId = generateUuid();

    const ctx = createTestContext();

    const hypothesis = createHypothesis({
      hypothesisId,
      projectId,
      branchId,
      gapId: null,
      statement: "X causes Y",
      falsificationCondition: "If Y does not occur",
      status: "PROPOSED",
    });
    await Effect.runPromise(ctx.objectStore.save(hypothesis));

    const phases = createHypothesisVerificationWorkflow({
      hypothesisId,
      projectId,
      branchId,
      objectStore: ctx.objectStore,
      eventStore: ctx.eventStore,
      controller: ctx.controller,
    });

    const state = await runWorkflow(phases);
    expect(state.status).toBe("completed");

    const opt = await Effect.runPromise(ctx.objectStore.get(hypothesisId, "Hypothesis"));
    expect(opt.isSome()).toBe(true);
    const stored = opt.value as Record<string, unknown>;
    expect(stored.status).toBe("CONFIRMED");
  });

  it("domain events are recorded during workflow", async () => {
    const projectId = "00000000-0000-4000-a000-000000000000";
    const branchId = "00000000-0000-4000-a000-000000000000";
    const hypothesisId = generateUuid();

    const ctx = createTestContext();

    const hypothesis = createHypothesis({
      hypothesisId,
      projectId,
      branchId,
      gapId: null,
      statement: "Test hypothesis",
      falsificationCondition: "Test condition",
      status: "PROPOSED",
    });
    await Effect.runPromise(ctx.objectStore.save(hypothesis));

    const phases = createHypothesisVerificationWorkflow({
      hypothesisId,
      projectId,
      branchId,
      objectStore: ctx.objectStore,
      eventStore: ctx.eventStore,
      controller: ctx.controller,
    });

    await runWorkflow(phases);

    const events = await Effect.runPromise(ctx.eventStore.getByObjectId(hypothesisId));
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0].type).toBe("STATE_TRANSITION");
  });
});
