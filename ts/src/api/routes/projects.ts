import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { ObjectStore } from "@persistence/object-store";
import { generateUuid } from "../utils";

export function createProjectRoutes(objectStore: ObjectStore): Hono {
  const router = new Hono();

  router.post("/api/projects", async (c) => {
    const body = await c.req.json();
    const id = generateUuid();
    const now = new Date();
    const project = {
      projectId: id,
      name: body.name ?? "Untitled",
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
      projects.map((p: Record<string, unknown>) => ({
        id: p.projectId,
        name: p.name,
        status: p.status,
        createdAt: p.createdAt,
      }))
    );
  });

  router.get("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const opt = await Effect.runPromise(objectStore.get(id, "Project"));
    if (opt.isNone()) {
      return c.json({ error: "Project not found" }, 404);
    }
    const project = opt.value as Record<string, unknown>;
    return c.json({
      id: project.projectId,
      name: project.name,
      status: project.status,
      description: project.description,
      metadata: project.metadata,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  });

  router.put("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const opt = await Effect.runPromise(objectStore.get(id, "Project"));
    if (opt.isNone()) {
      return c.json({ error: "Project not found" }, 404);
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
      return c.json({ error: "Project not found" }, 404);
    }

    const cascadeTypes = ["PhaseRun", "EvidenceChain", "Citation", "Evidence", "Result", "Experiment", "Report", "Hypothesis", "ResearchGap", "KnowledgeItem", "ResearchQuestion", "ResearchFailure"];
    for (const type of cascadeTypes) {
      const items = await Effect.runPromise(objectStore.list(type));
      for (const item of items) {
        const itemId = (item as any).citationId || (item as any).evidenceChainId || (item as any).phaseRunId || (item as any).evidenceId || (item as any).resultId || (item as any).experimentId || (item as any).reportId || (item as any).hypothesisId || (item as any).gapId || (item as any).knowledgeId || (item as any).questionId || (item as any).failureId || (item as any).id;
        if ((item as any).projectId === id && itemId) {
          await Effect.runPromise(objectStore.delete(itemId, type)).catch(() => {});
        }
      }
    }

    await Effect.runPromise(objectStore.delete(id, "Project"));
    return c.json({ deleted: id });
  });

  router.get("/api/projects/:id/hypotheses", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("Hypothesis"));
    return c.json(all.filter((h: any) => h.projectId === id));
  });

  router.get("/api/projects/:id/evidence", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("Evidence"));
    return c.json(all.filter((e: any) => e.projectId === id));
  });

  router.get("/api/projects/:id/knowledge", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("KnowledgeItem"));
    return c.json(all.filter((k: any) => k.projectId === id));
  });

  router.get("/api/projects/:id/reports", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("Report"));
    return c.json(all.filter((r: any) => r.projectId === id));
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
      hypotheses: hypotheses.filter((h: any) => h.projectId === id),
      evidence: evidence.filter((e: any) => e.projectId === id),
      knowledge: knowledge.filter((k: any) => k.projectId === id),
      reports: reports.filter((r: any) => r.projectId === id),
      experiments: experiments.filter((e: any) => e.projectId === id),
      citations: citations.filter((ci: any) => ci.projectId === id),
    });
  });

  return router;
}
