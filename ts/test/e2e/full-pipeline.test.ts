import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createApp, AppConfig } from "@app/index";
import { createDeterministicProvider, DeterministicScenario } from "@runtime/provider-deterministic";
import { createResearchGap } from "@domain/objects/gap";
import { createHypothesis } from "@domain/objects/hypothesis";
import { createKnowledgeItem } from "@domain/objects/knowledge";
import { runWorkflow, createHypothesisVerificationWorkflow } from "@runtime/workflows/hypothesis-verification";
import { createReport } from "@domain/objects/report";

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe("E2E: Literature → Experiment → Evidence → Report", () => {
  it("complete flow: research gap → hypothesis → evidence → report", async () => {
    const projectId = "00000000-0000-4000-a000-000000000000";
    const branchId = "00000000-0000-4000-a000-000000000000";
    const gapId = generateUuid();
    const hypothesisId = generateUuid();
    const reportId = generateUuid();

    const scenario: DeterministicScenario = {
      name: "complete-flow",
      responses: [
        { content: "Hypothesis confirmed with strong evidence.", stopReason: "stop" },
        { content: "# Title\n\n## Abstract\n\nThis paper presents findings on X.\n\n## Introduction\n\nWe investigate X.\n\n## Conclusion\n\nX is confirmed.", stopReason: "stop" },
      ],
    };
    const provider = createDeterministicProvider(scenario);

    const app = createApp({} as AppConfig);

    // 1. Research gap identified
    const gap = createResearchGap({
      gapId,
      projectId,
      branchId,
      description: "We don't know if X causes Y",
      status: "IDENTIFIED",
    });
    await Effect.runPromise(app.objectStore.save(gap));

    // 2. Hypothesis proposed
    const hypothesis = createHypothesis({
      hypothesisId,
      projectId,
      branchId,
      gapId,
      statement: "X causes Y under conditions Z",
      falsificationCondition: "If p > 0.05, falsified",
      status: "PROPOSED",
    });
    await Effect.runPromise(app.objectStore.save(hypothesis));

    // 3. Literature search (via workflow)
    const phases = createHypothesisVerificationWorkflow({
      hypothesisId,
      projectId,
      branchId,
      provider,
      objectStore: app.objectStore,
      eventStore: app.eventStore,
      controller: app.controller,
      literatureResults: [
        { summary: "Study 1: X correlates with Y (r=0.7)", certaintyLevel: 0.8 },
        { summary: "Study 2: Meta-analysis confirms X-Y link", certaintyLevel: 0.9 },
      ],
    });

    const state = await runWorkflow(phases);
    expect(state.status).toBe("completed");

    // 4. Hypothesis confirmed
    const hypothesisOpt = await Effect.runPromise(app.objectStore.get(hypothesisId, "Hypothesis"));
    expect(hypothesisOpt.isSome()).toBe(true);
    const storedH = hypothesisOpt.value as Record<string, unknown>;
    expect(storedH.status).toBe("CONFIRMED");

    // 5. Evidence created
    const evidenceList = await Effect.runPromise(app.objectStore.list("Evidence"));
    expect(evidenceList.length).toBeGreaterThan(0);

    // 6. Knowledge items created
    const knowledgeList = await Effect.runPromise(app.objectStore.list("KnowledgeItem"));
    expect(knowledgeList.length).toBeGreaterThan(0);

    // 7. Report created from results
    const report = createReport({
      reportId,
      projectId,
      branchId,
      title: "X Causes Y: A Comprehensive Study",
      status: "DRAFT",
    });
    await Effect.runPromise(app.objectStore.save(report));

    const reportOpt = await Effect.runPromise(app.objectStore.get(reportId, "Report"));
    expect(reportOpt.isSome()).toBe(true);
    const storedReport = reportOpt.value as Record<string, unknown>;
    expect(storedReport.title).toBe("X Causes Y: A Comprehensive Study");
    expect(storedReport.status).toBe("DRAFT");

    // 8. Verify full chain exists
    const allObjects = {
      gaps: await Effect.runPromise(app.objectStore.list("ResearchGap")),
      hypotheses: await Effect.runPromise(app.objectStore.list("Hypothesis")),
      evidence: await Effect.runPromise(app.objectStore.list("Evidence")),
      knowledge: await Effect.runPromise(app.objectStore.list("KnowledgeItem")),
      reports: await Effect.runPromise(app.objectStore.list("Report")),
    };

    expect(allObjects.gaps.length).toBeGreaterThan(0);
    expect(allObjects.hypotheses.length).toBeGreaterThan(0);
    expect(allObjects.evidence.length).toBeGreaterThan(0);
    expect(allObjects.knowledge.length).toBeGreaterThan(0);
    expect(allObjects.reports.length).toBeGreaterThan(0);
  });
});
