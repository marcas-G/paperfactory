import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { Provider } from "@runtime/provider";
import { ObjectStore } from "@persistence/object-store";
import { apiError, lineDiff } from "../utils";
import { ToolRegistry } from "@runtime/tools/registry";
import { buildToolDefs } from "../utils";
import { toPhaseRunDTO } from "../types";
import { ResearchRunState, type PhaseDecision } from "./research-runs";
import type { AgentEvent } from "@runtime/agent/loop";

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
      .filter((r: Record<string, unknown>) => r.projectId === id)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.phaseVersion || 0) - Number(b.phaseVersion || 0));
    const mapped = projectRuns.map((r: Record<string, unknown>) => toPhaseRunDTO(r));
    return c.json(mapped);
  });

  router.get("/api/projects/:id/phases/grouped", async (c) => {
    const id = c.req.param("id");
    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    const projectRuns = runs.filter((r: Record<string, unknown>) => r.projectId === id);

    const grouped: Record<string, Record<string, unknown>[]> = {};
    for (const run of projectRuns) {
      const name = String(run.phaseName);
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
    const projectChains = chains.filter((ch: Record<string, unknown>) => ch.projectId === id);

    const upstream = projectChains.filter((ch: Record<string, unknown>) =>
      ch.sourceType === objectType && ch.sourceId === objectId
    ).map((ch: Record<string, unknown>) => ({
      targetType: ch.targetType,
      targetId: ch.targetId,
      relation: ch.relation,
    }));

    const downstream = projectChains.filter((ch: Record<string, unknown>) =>
      ch.targetType === objectType && ch.targetId === objectId
    ).map((ch: Record<string, unknown>) => ({
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
    const dec = body?.decision as string | undefined;
    if (dec === undefined || !["approve", "modify", "reject"].includes(dec)) {
      return c.json(apiError("VALIDATION_ERROR", "decision must be approve, modify, or reject"), 400);
    }

    const allRuns = researchRuns;
    for (const [, state] of allRuns.entries()) {
      if (state && state.approvalRunId === runId && state.approvalResolve) {
        const resolve = state.approvalResolve;
        state.approvalResolve = null;
        state.approvalRunId = null;
        // dec 已通过上面的 guard 校验为三个合法值之一
        resolve(dec as PhaseDecision);
      }
    }

    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    const run = runs.find((r: Record<string, unknown>) => r.phaseRunId === runId && r.projectId === id);
    if (!run) {
      return c.json(apiError("NOT_FOUND", "Phase run not found"), 404);
    }

    const updated = {
      ...run,
      status: dec === "approve" ? "COMPLETED" : dec === "modify" ? "MODIFY_REQUESTED" : "REJECTED",
      human_feedback: body.feedback ?? run.humanFeedback,
      active: dec === "approve" ? true : run.active,
      updatedAt: new Date(),
    };

    const samePhase = runs.filter((r: Record<string, unknown>) =>
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
      return c.json(apiError("NOT_FOUND", `Unknown phase: ${phaseName}`), 404);
    }

    const toolDefinitions = buildToolDefs(toolRegistry);
    const events: AgentEvent[] = [];

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

  router.get("/api/projects/:id/phases/:phaseName/versions", async (c) => {
    const id = c.req.param("id");
    const phaseName = c.req.param("phaseName");
    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    const phaseVersions = runs
      .filter((r: Record<string, unknown>) => r.projectId === id && r.phaseName === phaseName)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.phaseVersion || 0) - Number(b.phaseVersion || 0));
    const mapped = phaseVersions.map((r: Record<string, unknown>) => toPhaseRunDTO(r));
    return c.json(mapped);
  });

  router.get("/api/projects/:id/phases/:phaseName/compare", async (c) => {
    const id = c.req.param("id");
    const phaseName = c.req.param("phaseName");
    const runIdsParam = c.req.query("runIds");
    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    let phaseVersions = runs
      .filter((r: Record<string, unknown>) => r.projectId === id && r.phaseName === phaseName)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.phaseVersion || 0) - Number(b.phaseVersion || 0));
    if (runIdsParam) {
      const runIds = runIdsParam.split(",").map((s) => s.trim());
      phaseVersions = phaseVersions.filter((r: Record<string, unknown>) => runIds.includes(String(r.phaseRunId)));
    }
    const versions = phaseVersions.map((r: Record<string, unknown>) => ({
      runId: r.phaseRunId,
      version: r.phaseVersion,
      summary: r.agentOutput ? String(r.agentOutput).substring(0, 200) : "",
      status: r.status,
      active: r.active,
      output: r.agentOutput ?? "",
      toolCalls: r.toolCalls ?? [],
      selfReview: r.selfReview ?? null,
      createdAt: r.createdAt,
    }));
    const diffs: Array<{ field: string; changes: Array<{ from: string; to: string }> }> = [];
    if (phaseVersions.length >= 2) {
      const baseOutput = (phaseVersions[0].agentOutput ?? "") as string;
      for (let i = 1; i < phaseVersions.length; i++) {
        const compareOutput = (phaseVersions[i].agentOutput ?? "") as string;
        const changes = lineDiff(baseOutput, compareOutput);
        diffs.push({
          field: `agentOutput (version ${phaseVersions[0].phaseVersion} vs ${phaseVersions[i].phaseVersion})`,
          changes,
        });
      }
    }
    return c.json({ versions, diff: diffs });
  });

  return router;
}
