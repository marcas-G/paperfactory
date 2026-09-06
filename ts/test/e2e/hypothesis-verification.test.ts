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
import { createEvidence } from "@domain/objects/evidence";
import type { WorkflowPhase } from "@runtime/workflows/engine";
import { createEmptyManifest } from "@runtime/workflows/manifest";

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createPartialWorkflow(ctx: {
  hypothesisId: string;
  projectId: string;
  branchId: string;
  objectStore: ReturnType<typeof createTestContext>["objectStore"];
  controller: ReturnType<typeof createTestContext>["controller"];
}): ReadonlyArray<WorkflowPhase> {
  const manifest = createEmptyManifest();
  return [
    {
      name: "evidence_collection",
      execute: () => {
        return Effect.promise(async () => {
          const evidence = createEvidence({
            evidenceId: generateUuid(),
            projectId: ctx.projectId,
            branchId: ctx.branchId,
            resultId: generateUuid(),
            summary: "Evidence for hypothesis",
            direction: "SUPPORTING",
            status: "VALIDATED",
            strength: 0.75,
          });
          await Effect.runPromise(ctx.objectStore.save(evidence));
          manifest.evidence = [...manifest.evidence, evidence];
          return { evidence, phase: "evidence_collection" };
        });
      },
    },
    {
      name: "link_evidence_and_assess",
      execute: () => {
        return Effect.promise(async () => {
          const opt = await Effect.runPromise(
            ctx.objectStore.get(ctx.hypothesisId, "Hypothesis")
          );

          const evidenceList = await Effect.runPromise(
            ctx.objectStore.list("Evidence")
          );
          const evidenceIds = evidenceList
            .map((e) => e.evidenceId)
            .filter((id): id is string => typeof id === "string");

          if (opt.isSome()) {
            const hypothesis = opt.value as Record<string, unknown>;
            const updatedHypothesis = {
              ...hypothesis,
              supportingEvidenceIds: evidenceIds,
            };
            await Effect.runPromise(ctx.objectStore.save(updatedHypothesis));
          }

          const assessResult = await ctx.controller.execute({
            actionName: "assess_hypothesis",
            objectId: ctx.hypothesisId,
            objectType: "Hypothesis",
          });

          const activateResult = await ctx.controller.execute({
            actionName: "activate_hypothesis",
            objectId: ctx.hypothesisId,
            objectType: "Hypothesis",
          });

          return {
            assessResult,
            activateResult,
            phase: "link_evidence_and_assess",
          };
        });
      },
    },
  ];
}

describe("E2E: Hypothesis Verification", () => {
  it("hypothesis -> verify -> confirm", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ output: "Experiment executed", isError: false }), { status: 200 }))
    ) as any;

    try {
      await runHypothesisTest();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  async function runHypothesisTest() {
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
  }

  it("workflow completes without literature results", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ output: "Experiment executed", isError: false }), { status: 200 }))
    ) as any;

    try {
      await runNoLitTest();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  async function runNoLitTest() {
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
  }

  it("domain events are recorded during workflow", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ output: "Experiment executed", isError: false }), { status: 200 }))
    ) as any;

    try {
      await runDomainEventsTest();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  async function runDomainEventsTest() {
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
  }
});

describe("E2E: Hypothesis Backtrack and Correction", () => {
  it("hypothesis -> assess -> activate -> reject -> new hypothesis -> verify -> confirm", async () => {
    const projectId = "00000000-0000-4000-a000-000000000000";
    const branchId = "00000000-0000-4000-a000-000000000000";
    const gapId = generateUuid();

    const ctx = createTestContext();

    const gap = createResearchGap({
      gapId,
      projectId,
      branchId,
      description: "We don't know if X causes Y",
      status: "IDENTIFIED",
    });
    await Effect.runPromise(ctx.objectStore.save(gap));

    const hypothesisId1 = generateUuid();
    const hypothesis1 = createHypothesis({
      hypothesisId: hypothesisId1,
      projectId,
      branchId,
      gapId,
      statement: "X causes Y (initial guess)",
      falsificationCondition: "If Y does not occur when X is applied",
      status: "PROPOSED",
    });
    await Effect.runPromise(ctx.objectStore.save(hypothesis1));

    const partialPhases1 = createPartialWorkflow({
      hypothesisId: hypothesisId1,
      projectId,
      branchId,
      objectStore: ctx.objectStore,
      controller: ctx.controller,
    });

    const state1 = await runWorkflow(partialPhases1);
    expect(state1.status).toBe("completed");

    const opt1 = await Effect.runPromise(ctx.objectStore.get(hypothesisId1, "Hypothesis"));
    expect(opt1.isSome()).toBe(true);
    const active1 = opt1.value as Record<string, unknown>;
    expect(active1.status).toBe("ACTIVE");

    const rejectResult = await ctx.controller.execute({
      actionName: "reject_hypothesis",
      objectId: hypothesisId1,
      objectType: "Hypothesis",
    });
    expect(rejectResult.success).toBe(true);

    const optRejected = await Effect.runPromise(
      ctx.objectStore.get(hypothesisId1, "Hypothesis")
    );
    expect(optRejected.isSome()).toBe(true);
    const rejected = optRejected.value as Record<string, unknown>;
    expect(rejected.status).toBe("REJECTED");

    const hypothesisId2 = generateUuid();
    const hypothesis2 = createHypothesis({
      hypothesisId: hypothesisId2,
      projectId,
      branchId,
      gapId,
      statement: "X causes Y under modified conditions Z2",
      falsificationCondition: "If statistical test shows p > 0.05 under Z2",
      status: "PROPOSED",
    });
    await Effect.runPromise(ctx.objectStore.save(hypothesis2));

    const partialPhases2 = createPartialWorkflow({
      hypothesisId: hypothesisId2,
      projectId,
      branchId,
      objectStore: ctx.objectStore,
      controller: ctx.controller,
    });

    const state2 = await runWorkflow(partialPhases2);
    expect(state2.status).toBe("completed");

    const active2Opt = await Effect.runPromise(ctx.objectStore.get(hypothesisId2, "Hypothesis"));
    expect(active2Opt.isSome()).toBe(true);
    const active2 = active2Opt.value as Record<string, unknown>;
    expect(active2.status).toBe("ACTIVE");

    const confirmResult = await ctx.controller.execute({
      actionName: "confirm_hypothesis",
      objectId: hypothesisId2,
      objectType: "Hypothesis",
    });
    expect(confirmResult.success).toBe(true);

    const confirmedOpt = await Effect.runPromise(ctx.objectStore.get(hypothesisId2, "Hypothesis"));
    expect(confirmedOpt.isSome()).toBe(true);
    const confirmed = confirmedOpt.value as Record<string, unknown>;
    expect(confirmed.status).toBe("CONFIRMED");

    const hypotheses = await Effect.runPromise(ctx.objectStore.list("Hypothesis"));
    expect(hypotheses.length).toBe(2);

    const evidenceList = await Effect.runPromise(ctx.objectStore.list("Evidence"));
    expect(evidenceList.length).toBeGreaterThanOrEqual(2);

    const allEvents = await Effect.runPromise(ctx.eventStore.getAll());
    expect(allEvents.length).toBeGreaterThan(0);
  });

  it("cannot confirm a rejected hypothesis", async () => {
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

    const phases = createPartialWorkflow({
      hypothesisId,
      projectId,
      branchId,
      objectStore: ctx.objectStore,
      controller: ctx.controller,
    });

    await runWorkflow(phases);

    const optActive = await Effect.runPromise(ctx.objectStore.get(hypothesisId, "Hypothesis"));
    expect(optActive.isSome()).toBe(true);
    const active = optActive.value as Record<string, unknown>;
    expect(active.status).toBe("ACTIVE");

    const rejectResult = await ctx.controller.execute({
      actionName: "reject_hypothesis",
      objectId: hypothesisId,
      objectType: "Hypothesis",
    });
    expect(rejectResult.success).toBe(true);

    const opt = await Effect.runPromise(ctx.objectStore.get(hypothesisId, "Hypothesis"));
    const stored = opt.value as Record<string, unknown>;
    expect(stored.status).toBe("REJECTED");

    const confirmRejected = await ctx.controller.execute({
      actionName: "confirm_hypothesis",
      objectId: hypothesisId,
      objectType: "Hypothesis",
    });
    expect(confirmRejected.success).toBe(false);
  });
});
