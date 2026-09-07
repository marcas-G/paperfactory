import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { ObjectStore } from "@persistence/object-store";
import { generateUuid, apiError } from "../utils";

const RESEARCH_OBJECT_TYPES = [
  "ResearchQuestion",
  "Hypothesis",
  "Evidence",
  "Experiment",
  "Result",
  "ResearchGap",
  "KnowledgeItem",
  "Claim",
  "ResearchFailure",
  "Report",
  "Submission",
  "Protocol",
];

export function createResearchObjectRoutes(objectStore: ObjectStore): Hono {
  const router = new Hono();

  router.post("/api/research/questions", async (c) => {
    const body = await c.req.json();
    const questionId = generateUuid();
    const question = {
      questionId,
      title: body.title ?? "Untitled Question",
      statement: body.statement ?? "",
      domain: body.domain ?? "general",
      status: "DRAFT",
      createdAt: new Date().toISOString(),
    };
    await Effect.runPromise(objectStore.save(question));
    return c.json(
      {
        questionId,
        title: question.title,
        statement: question.statement,
        domain: question.domain,
        status: question.status,
        createdAt: question.createdAt,
      },
      201
    );
  });

  router.get("/api/research/:objectId", async (c) => {
    const objectId = c.req.param("objectId");
    for (const type of RESEARCH_OBJECT_TYPES) {
      const opt = await Effect.runPromise(objectStore.get(objectId, type));
      if (!opt.isNone()) {
        return c.json(opt.value);
      }
    }
    return c.json(apiError("NOT_FOUND", "Research object not found"), 404);
  });

  router.put("/api/research/:objectId", async (c) => {
    const objectId = c.req.param("objectId");
    const body = await c.req.json();
    for (const type of RESEARCH_OBJECT_TYPES) {
      const opt = await Effect.runPromise(objectStore.get(objectId, type));
      if (!opt.isNone()) {
        const existing = opt.value as Record<string, unknown>;
        const updated = {
          ...existing,
          ...(body.status !== undefined && { status: body.status }),
          ...(body.statement !== undefined && { statement: body.statement }),
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
        };
        await Effect.runPromise(objectStore.save(updated));
        return c.json(updated);
      }
    }
    return c.json(apiError("NOT_FOUND", "Research object not found"), 404);
  });

  router.delete("/api/research/:objectId", async (c) => {
    const objectId = c.req.param("objectId");
    const types = [
      "ResearchQuestion", "Hypothesis", "Evidence", "Experiment", "Result",
      "ResearchGap", "KnowledgeItem", "Protocol", "Claim", "Report",
      "Submission", "ResearchFailure", "PhaseRun", "EvidenceChain", "Citation",
    ];
    for (const type of types) {
      const opt = await Effect.runPromise(objectStore.get(objectId, type));
      if (opt.isSome()) {
        await Effect.runPromise(objectStore.delete(objectId, type));
        return c.json({ deleted: objectId, type });
      }
    }
    return c.json(apiError("NOT_FOUND", "Object not found"), 404);
  });

  return router;
}
