import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { Provider } from "@runtime/provider";
import { ObjectStore } from "@persistence/object-store";
import { ToolRegistry } from "@runtime/tools/registry";
import { buildToolDefs } from "../utils";
import { ResearchRunState } from "./research-runs";

export function createPhaseRoutes(
  objectStore: ObjectStore,
  provider: Provider,
  toolRegistry: ToolRegistry,
  researchRuns: Map<string, ResearchRunState>
): Hono {
  const router = new Hono();

  router.get("/api/projects/:id/phases", async (c) => {
    const id = c.req.param("id");
    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    const projectRuns = runs
      .filter((r: any) => r.projectId === id)
      .sort((a: any, b: any) => (a.phaseVersion || 0) - (b.phaseVersion || 0));
    const mapped = projectRuns.map((r: any) => {
      const artifacts = r.artifacts || {};
      const firstKey = Object.keys(artifacts)[0];
      const typeMap: Record<string, string> = {
        knowledgeIds: "KnowledgeItem", hypothesisIds: "Hypothesis",
        gapIds: "ResearchGap", experimentIds: "Experiment",
        resultIds: "Result", evidenceIds: "Evidence",
        reportIds: "Report", citationIds: "Citation",
      };
      return {
        phaseRunId: r.phaseRunId,
        projectId: r.projectId,
        phase: r.phaseName,
        phaseName: r.phaseName,
        phaseVersion: r.phaseVersion,
        status: r.status,
        artifacts: r.artifacts,
        rawOutput: r.agentOutput,
        toolCalls: r.toolCalls,
        selfReview: r.selfReview,
        active: r.active,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        objectType: firstKey ? (typeMap[firstKey] ?? firstKey) : "",
        objectId: firstKey ? (artifacts[firstKey]?.[0] ?? "") : "",
      };
    });
    return c.json(mapped);
  });

  router.get("/api/projects/:id/phases/grouped", async (c) => {
    const id = c.req.param("id");
    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    const projectRuns = runs.filter((r: any) => r.projectId === id);

    const grouped: Record<string, any[]> = {};
    for (const run of projectRuns) {
      const name = (run as any).phaseName;
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push({
        phaseRunId: run.phaseRunId,
        phaseName: run.phaseName,
        phaseVersion: run.phaseVersion,
        status: run.status,
        active: run.active,
        createdAt: run.createdAt,
      });
    }
    return c.json(grouped);
  });

  router.get("/api/projects/:id/chain/:objectType/:objectId", async (c) => {
    const id = c.req.param("id");
    const objectType = c.req.param("objectType");
    const objectId = c.req.param("objectId");

    const chains = await Effect.runPromise(objectStore.list("EvidenceChain"));
    const projectChains = chains.filter((ch: any) => ch.projectId === id);

    const upstream = projectChains.filter((ch: any) =>
      ch.sourceType === objectType && ch.sourceId === objectId
    ).map((ch: any) => ({
      targetType: ch.targetType,
      targetId: ch.targetId,
      relation: ch.relation,
    }));

    const downstream = projectChains.filter((ch: any) =>
      ch.targetType === objectType && ch.targetId === objectId
    ).map((ch: any) => ({
      sourceType: ch.sourceType,
      sourceId: ch.sourceId,
      relation: ch.relation,
    }));

    return c.json({ upstream, downstream });
  });

  router.post("/api/projects/:id/phases/:runId/decision", async (c) => {
    const id = c.req.param("id");
    const runId = c.req.param("runId");
    const body = await c.req.json();

    const allRuns = researchRuns;
    for (const [researchRunId, state] of allRuns.entries()) {
      if (state && state.approvalRunId === runId && state.approvalResolve) {
        const resolve = state.approvalResolve;
        state.approvalResolve = null;
        state.approvalRunId = null;
        resolve(body.decision ?? "approve");

        const eventType = body.decision === "approve" ? "phase:approved" : body.decision === "modify" ? "phase:modified" : "phase:rejected";
        void eventType;
      }
    }

    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    const run = runs.find((r: any) => r.phaseRunId === runId && r.projectId === id);
    if (!run) {
      return c.json({ error: "Phase run not found" }, 404);
    }

    const updated = {
      ...run,
      status: body.decision === "approve" ? "COMPLETED" : body.decision === "modify" ? "MODIFY_REQUESTED" : "REJECTED",
      human_feedback: body.feedback ?? run.humanFeedback,
      active: body.decision === "approve" ? true : run.active,
      updatedAt: new Date(),
    };

    const samePhase = runs.filter((r: any) =>
      r.projectId === id && r.phaseName === run.phaseName && r.phaseRunId !== runId
    );
    for (const other of samePhase) {
      await Effect.runPromise(objectStore.save({ ...other, active: false, updatedAt: new Date() }));
    }

    await Effect.runPromise(objectStore.save(updated));
    return c.json(updated);
  });

  router.post("/api/projects/:id/phases/:phaseName/run", async (c) => {
    const id = c.req.param("id");
    const phaseName = c.req.param("phaseName");
    const body = await c.req.json().catch(() => ({}));

    const { PHASE_CONTRACTS } = await import("@orchestration/phase-contracts");
    const contract = PHASE_CONTRACTS.find((p) => p.name === phaseName);
    if (!contract) {
      return c.json({ error: `Unknown phase: ${phaseName}` }, 404);
    }

    const toolDefinitions = buildToolDefs(toolRegistry);
    const events: Array<Record<string, unknown>> = [];

    const { runPhase } = await import("@orchestration/phase-contracts");
    const result = await runPhase(
      contract,
      objectStore,
      provider,
      toolRegistry,
      toolDefinitions,
      id,
      body.question ?? "",
      (event) => events.push(event),
      () => false,
    );

    return c.json({
      phaseName: result.phaseName,
      status: result.status,
      output: result.output,
      rawOutput: result.rawOutput,
      savedIds: result.savedIds,
      toolCalls: result.toolCalls,
      events,
    });
  });

  return router;
}
