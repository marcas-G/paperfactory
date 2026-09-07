import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { ObjectStore } from "@persistence/object-store";
import { generateUuid, apiError, validateString } from "../utils";
import { toProjectSummary, toProjectDetail } from "../types";

export function createProjectRoutes(objectStore: ObjectStore): Hono {
  const router = new Hono();

  router.post("/api/projects", async (c) => {
    const body = await c.req.json();
    const name = validateString(body?.name, 512);
    if (!name) {
      return c.json(apiError("VALIDATION_ERROR", "name is required (max 512 chars)"), 400);
    }
    const id = generateUuid();
    const now = new Date();
    const project = {
      projectId: id,
      name,
      status: "ACTIVE",
      description: "",
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    await Effect.runPromise(objectStore.save(project));
    return c.json(
      { id, name: project.name, status: project.status, createdAt: now.toISOString() },
      201
    );
  });

  router.get("/api/projects", async (c) => {
    const projects = await Effect.runPromise(objectStore.list("Project"));
    return c.json(
      projects.map((p: Record<string, unknown>) => toProjectSummary(p))
    );
  });

  router.get("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const opt = await Effect.runPromise(objectStore.get(id, "Project"));
    if (opt.isNone()) {
      return c.json(apiError("NOT_FOUND", "Project not found"), 404);
    }
    const project = opt.value as Record<string, unknown>;
    return c.json(toProjectDetail(project));
  });

  router.put("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const opt = await Effect.runPromise(objectStore.get(id, "Project"));
    if (opt.isNone()) {
      return c.json(apiError("NOT_FOUND", "Project not found"), 404);
    }
    const existing = opt.value as Record<string, unknown>;
    const updated = {
      ...existing,
      ...(body.name !== undefined && { name: body.name }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.metadata !== undefined && { metadata: body.metadata }),
      updatedAt: new Date(),
    };
    await Effect.runPromise(objectStore.save(updated));
    return c.json({
      id,
      name: updated.name,
      status: updated.status,
      description: updated.description,
      metadata: updated.metadata,
      updatedAt: updated.updatedAt,
    });
  });

  router.delete("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const opt = await Effect.runPromise(objectStore.get(id, "Project"));
    if (opt.isNone()) {
      return c.json(apiError("NOT_FOUND", "Project not found"), 404);
    }

    const cascadeTypes = ["PhaseRun", "EvidenceChain", "Citation", "Evidence", "Result", "Experiment", "Report", "Hypothesis", "ResearchGap", "KnowledgeItem", "ResearchQuestion", "ResearchFailure"];
    for (const type of cascadeTypes) {
      const items = await Effect.runPromise(objectStore.list(type));
      for (const item of items) {
        const itemRecord = item as Record<string, unknown>;
        const itemId = itemRecord.citationId || itemRecord.evidenceChainId || itemRecord.phaseRunId || itemRecord.evidenceId || itemRecord.resultId || itemRecord.experimentId || itemRecord.reportId || itemRecord.hypothesisId || itemRecord.gapId || itemRecord.knowledgeId || itemRecord.questionId || itemRecord.failureId || itemRecord.id;
        if (itemRecord.projectId === id && itemId) {
          await Effect.runPromise(objectStore.delete(String(itemId), type)).catch(() => {});
        }
      }
    }

    await Effect.runPromise(objectStore.delete(id, "Project"));
    return c.json({ deleted: id });
  });

  router.get("/api/projects/:id/hypotheses", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("Hypothesis"));
    return c.json(all.filter((h: Record<string, unknown>) => h.projectId === id));
  });

  router.get("/api/projects/:id/evidence", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("Evidence"));
    return c.json(all.filter((e: Record<string, unknown>) => e.projectId === id));
  });

  router.get("/api/projects/:id/knowledge", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("KnowledgeItem"));
    return c.json(all.filter((k: Record<string, unknown>) => k.projectId === id));
  });

  router.get("/api/projects/:id/reports", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("Report"));
    return c.json(all.filter((r: Record<string, unknown>) => r.projectId === id));
  });

  router.get("/api/projects/:id/all", async (c) => {
    const id = c.req.param("id");
    const hypotheses = await Effect.runPromise(objectStore.list("Hypothesis"));
    const evidence = await Effect.runPromise(objectStore.list("Evidence"));
    const knowledge = await Effect.runPromise(objectStore.list("KnowledgeItem"));
    const reports = await Effect.runPromise(objectStore.list("Report"));
    const experiments = await Effect.runPromise(objectStore.list("Experiment"));
    const citations = await Effect.runPromise(objectStore.list("Citation"));
    return c.json({
      hypotheses: hypotheses.filter((h: Record<string, unknown>) => h.projectId === id),
      evidence: evidence.filter((e: Record<string, unknown>) => e.projectId === id),
      knowledge: knowledge.filter((k: Record<string, unknown>) => k.projectId === id),
      reports: reports.filter((r: Record<string, unknown>) => r.projectId === id),
      experiments: experiments.filter((e: Record<string, unknown>) => e.projectId === id),
      citations: citations.filter((ci: Record<string, unknown>) => ci.projectId === id),
    });
  });

  return router;
}
