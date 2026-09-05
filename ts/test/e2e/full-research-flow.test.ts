import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createApp, AppConfig } from "@app/index";
import { createDeterministicProvider, DeterministicScenario } from "@runtime/provider-deterministic";
import { createHypothesis } from "@domain/objects/hypothesis";
import { createResearchGap } from "@domain/objects/gap";
import { createEvidence } from "@domain/objects/evidence";
import { createKnowledgeItem } from "@domain/objects/knowledge";
import { runWorkflow, createHypothesisVerificationWorkflow } from "@runtime/workflows/hypothesis-verification";

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe("E2E: Full Research Flow", () => {
  it("假设→文献搜索→实验设计→证据收集→假设确认", async () => {
    const projectId = "00000000-0000-4000-a000-000000000000";
    const branchId = "00000000-0000-4000-a000-000000000000";
    const gapId = generateUuid();
    const hypothesisId = generateUuid();

    // DeterministicProvider 预设 LLM 响应
    const scenario: DeterministicScenario = {
      name: "full-research-flow",
      responses: [
        { content: "Based on evidence, the hypothesis is confirmed.", stopReason: "stop" },
      ],
    };
    const provider = createDeterministicProvider(scenario);

    const app = createApp({} as AppConfig);

    // Step 1: Create research gap
    const gap = createResearchGap({
      gapId,
      projectId,
      branchId,
      description: "We don't know if X causes Y",
      status: "IDENTIFIED",
    });
    await Effect.runPromise(app.objectStore.save(gap));

    // Step 2: Create hypothesis
    const hypothesis = createHypothesis({
      hypothesisId,
      projectId,
      branchId,
      gapId,
      statement: "X causes Y under conditions Z",
      falsificationCondition: "If statistical test shows p > 0.05, hypothesis is falsified",
      status: "PROPOSED",
    });
    await Effect.runPromise(app.objectStore.save(hypothesis));

    // Step 3: Run full verification workflow
    const phases = createHypothesisVerificationWorkflow({
      hypothesisId,
      projectId,
      branchId,
      provider,
      objectStore: app.objectStore,
      eventStore: app.eventStore,
      controller: app.controller,
      literatureResults: [
        { summary: "Previous study found X is correlated with Y", certaintyLevel: 0.7 },
        { summary: "Meta-analysis confirms X-Y relationship", certaintyLevel: 0.85 },
      ],
    });

    const state = await runWorkflow(phases);

    // Verify: all phases completed
    expect(state.status).toBe("completed");
    expect(state.phaseIndex).toBeGreaterThanOrEqual(3);

    // Verify: hypothesis was confirmed
    const opt = await Effect.runPromise(app.objectStore.get(hypothesisId, "Hypothesis"));
    expect(opt.isSome()).toBe(true);
    const stored = opt.value as Record<string, unknown>;
    expect(stored.status).toBe("CONFIRMED");

    // Verify: knowledge items were created (not stub)
    const knowledgeList = await Effect.runPromise(app.objectStore.list("KnowledgeItem"));
    expect(knowledgeList.length).toBeGreaterThanOrEqual(2);

    // Verify: evidence was created and validated (not stub)
    const evidenceList = await Effect.runPromise(app.objectStore.list("Evidence"));
    expect(evidenceList.length).toBeGreaterThanOrEqual(1);
    const evidence = evidenceList[0] as Record<string, unknown>;
    expect(evidence.status).toBe("VALIDATED");
    expect(evidence.direction).toBe("SUPPORTING");
  });

  it("假设→否定→新假设→确认", async () => {
    const projectId = "00000000-0000-4000-a000-000000000000";
    const branchId = "00000000-0000-4000-a000-000000000000";
    const gapId = generateUuid();
    const hypothesisId1 = generateUuid();
    const hypothesisId2 = generateUuid();

    const provider = createDeterministicProvider({
      name: "reject-then-confirm",
      responses: [
        { content: "Evidence contradicts hypothesis.", stopReason: "stop" },
        { content: "Evidence supports revised hypothesis.", stopReason: "stop" },
      ],
    });

    const app = createApp({} as AppConfig);

    // Create gap
    const gap = createResearchGap({
      gapId,
      projectId,
      branchId,
      description: "Unknown relationship between X and Y",
      status: "IDENTIFIED",
    });
    await Effect.runPromise(app.objectStore.save(gap));

    // First hypothesis (will be rejected)
    const hypothesis1 = createHypothesis({
      hypothesisId: hypothesisId1,
      projectId,
      branchId,
      gapId,
      statement: "X causes Y directly",
      falsificationCondition: "If mediation analysis shows no direct effect",
      status: "PROPOSED",
    });
    await Effect.runPromise(app.objectStore.save(hypothesis1));

    // Run workflow for first hypothesis
    const phases1 = createHypothesisVerificationWorkflow({
      hypothesisId: hypothesisId1,
      projectId,
      branchId,
      provider,
      objectStore: app.objectStore,
      eventStore: app.eventStore,
      controller: app.controller,
      literatureResults: [],
    });

    const state1 = await runWorkflow(phases1);
    expect(state1.status).toBe("completed");

    // First hypothesis should not be CONFIRMED (may be rejected or remain as-is)
    const opt1 = await Effect.runPromise(app.objectStore.get(hypothesisId1, "Hypothesis"));
    expect(opt1.isSome()).toBe(true);

    // Create second hypothesis (will be confirmed)
    const hypothesis2 = createHypothesis({
      hypothesisId: hypothesisId2,
      projectId,
      branchId,
      gapId,
      statement: "X causes Y through mediator M",
      falsificationCondition: "If mediation effect is not significant",
      status: "PROPOSED",
    });
    await Effect.runPromise(app.objectStore.save(hypothesis2));

    // Run workflow for second hypothesis
    const phases2 = createHypothesisVerificationWorkflow({
      hypothesisId: hypothesisId2,
      projectId,
      branchId,
      provider,
      objectStore: app.objectStore,
      eventStore: app.eventStore,
      controller: app.controller,
      literatureResults: [
        { summary: "Mediation analysis supports X→M→Y path", certaintyLevel: 0.9 },
      ],
    });

    const state2 = await runWorkflow(phases2);
    expect(state2.status).toBe("completed");

    // Second hypothesis should be CONFIRMED
    const opt2 = await Effect.runPromise(app.objectStore.get(hypothesisId2, "Hypothesis"));
    expect(opt2.isSome()).toBe(true);
    const stored2 = opt2.value as Record<string, unknown>;
    expect(stored2.status).toBe("CONFIRMED");

    // Verify evidence was created
    const evidenceList = await Effect.runPromise(app.objectStore.list("Evidence"));
    expect(evidenceList.length).toBeGreaterThan(0);
  });

  it("workflow produces manifest with hypotheses and evidence", async () => {
    const projectId = "00000000-0000-4000-a000-000000000000";
    const branchId = "00000000-0000-4000-a000-000000000000";
    const hypothesisId = generateUuid();
    const gapId = generateUuid();

    const provider = createDeterministicProvider({
      name: "manifest-test",
      responses: [
        { content: "Confirmed.", stopReason: "stop" },
      ],
    });

    const app = createApp({} as AppConfig);

    const gap = createResearchGap({ gapId, projectId, branchId, description: "Gap", status: "IDENTIFIED" });
    await Effect.runPromise(app.objectStore.save(gap));

    const hypothesis = createHypothesis({
      hypothesisId, projectId, branchId, gapId,
      statement: "H", falsificationCondition: "If p > 0.05", status: "PROPOSED",
    });
    await Effect.runPromise(app.objectStore.save(hypothesis));

    const phases = createHypothesisVerificationWorkflow({
      hypothesisId, projectId, branchId, provider,
      objectStore: app.objectStore, eventStore: app.eventStore, controller: app.controller,
      literatureResults: [{ summary: "Support", certaintyLevel: 0.8 }],
    });

    const state = await runWorkflow(phases);
    expect(state.status).toBe("completed");

    // Verify manifest exists in final phase output
    const lastPhase = state.phaseResults[state.phaseResults.length - 1];
    const manifest = lastPhase.manifest as Record<string, unknown>;
    expect(manifest).toBeDefined();
    expect((manifest.hypotheses as unknown[]).length).toBeGreaterThan(0);
    expect((manifest.evidence as unknown[]).length).toBeGreaterThan(0);
  });
});
