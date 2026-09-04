import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createTestContext } from "../fixtures/test-context";
import {
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

describe("E2E: Backtrack and Correction", () => {
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

    // First hypothesis - will be assessed, activated, then rejected
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

    // Run partial workflow to get hypothesis1 to ACTIVE state
    const partialPhases1 = createPartialWorkflow({
      hypothesisId: hypothesisId1,
      projectId,
      branchId,
      objectStore: ctx.objectStore,
      controller: ctx.controller,
    });

    const state1 = await runWorkflow(partialPhases1);
    expect(state1.status).toBe("completed");

    // Verify hypothesis1 is now ACTIVE
    const opt1 = await Effect.runPromise(ctx.objectStore.get(hypothesisId1, "Hypothesis"));
    expect(opt1.isSome()).toBe(true);
    const active1 = opt1.value as Record<string, unknown>;
    expect(active1.status).toBe("ACTIVE");

    // Now reject the first hypothesis
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

    // Create new hypothesis after rejecting the old one
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

    // Run partial workflow to get hypothesis2 to ACTIVE
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

    // Now confirm the second hypothesis
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

    // Verify both hypotheses exist in store
    const hypotheses = await Effect.runPromise(ctx.objectStore.list("Hypothesis"));
    expect(hypotheses.length).toBe(2);

    // Verify evidence was created for both workflows
    const evidenceList = await Effect.runPromise(ctx.objectStore.list("Evidence"));
    expect(evidenceList.length).toBeGreaterThanOrEqual(2);

    // Verify events were recorded
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

    // Run partial workflow to get to ACTIVE
    const phases = createPartialWorkflow({
      hypothesisId,
      projectId,
      branchId,
      objectStore: ctx.objectStore,
      controller: ctx.controller,
    });

    await runWorkflow(phases);

    // Verify hypothesis is ACTIVE
    const optActive = await Effect.runPromise(ctx.objectStore.get(hypothesisId, "Hypothesis"));
    expect(optActive.isSome()).toBe(true);
    const active = optActive.value as Record<string, unknown>;
    expect(active.status).toBe("ACTIVE");

    // Reject the hypothesis
    const rejectResult = await ctx.controller.execute({
      actionName: "reject_hypothesis",
      objectId: hypothesisId,
      objectType: "Hypothesis",
    });
    expect(rejectResult.success).toBe(true);

    const opt = await Effect.runPromise(ctx.objectStore.get(hypothesisId, "Hypothesis"));
    const stored = opt.value as Record<string, unknown>;
    expect(stored.status).toBe("REJECTED");

    // Verify we cannot confirm a rejected hypothesis (not in allowedSourceStates)
    const confirmRejected = await ctx.controller.execute({
      actionName: "confirm_hypothesis",
      objectId: hypothesisId,
      objectType: "Hypothesis",
    });
    expect(confirmRejected.success).toBe(false);
  });
});
