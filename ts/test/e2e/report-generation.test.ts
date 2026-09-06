import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createApp, AppConfig } from "@app/index";
import { createDeterministicProvider } from "@runtime/provider-deterministic";
import { createResearchGap } from "@domain/objects/gap";
import { createHypothesis } from "@domain/objects/hypothesis";
import { runWorkflow, createHypothesisVerificationWorkflow } from "@orchestration/hypothesis-verification";

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe("E2E: Workflow includes report generation phase", () => {
  it("workflow includes report_generation phase after confirm", async () => {
    const projectId = "00000000-0000-4000-a000-000000000000";
    const branchId = "00000000-0000-4000-a000-000000000000";
    const gapId = generateUuid();
    const hypothesisId = generateUuid();

    const provider = createDeterministicProvider({
      name: "report-flow",
      responses: [
        { content: "Confirmed.", stopReason: "stop" },
        {
          content: "# Research Report\n\n## Abstract\n\nFindings on X.\n\n## Conclusion\n\nX is confirmed.",
          stopReason: "stop",
        },
      ],
    });

    const app = createApp({} as AppConfig);

    await Effect.runPromise(
      app.objectStore.save(
        createResearchGap({ gapId, projectId, branchId, description: "Gap", status: "IDENTIFIED" })
      )
    );
    await Effect.runPromise(
      app.objectStore.save(
        createHypothesis({
          hypothesisId,
          projectId,
          branchId,
          gapId,
          statement: "H",
          falsificationCondition: "If p > 0.05",
          status: "PROPOSED",
        })
      )
    );

    const phases = createHypothesisVerificationWorkflow({
      hypothesisId,
      projectId,
      branchId,
      provider,
      objectStore: app.objectStore,
      eventStore: app.eventStore,
      controller: app.controller,
      literatureResults: [{ summary: "Support", certaintyLevel: 0.8 }],
    });

    // Verify report_generation phase exists
    const reportPhase = phases.find((p) => p.name === "report_generation");
    expect(reportPhase).toBeDefined();

    const state = await runWorkflow(phases);
    expect(state.status).toBe("completed");

    // Verify report was created
    const reports = await Effect.runPromise(app.objectStore.list("Report"));
    expect(reports.length).toBeGreaterThan(0);

    // Verify manifest contains report
    const lastPhase = state.phaseResults[state.phaseResults.length - 1];
    expect(lastPhase.manifest).toBeDefined();
  });
});
