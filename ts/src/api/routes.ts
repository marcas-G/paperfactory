import * as fs from "fs";
import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { Provider } from "@runtime/provider";
import { ObjectStore } from "@persistence/object-store";
import { ResearchController } from "@control/controller";
import { runAgentLoop } from "@runtime/agent/loop";
import { ToolRegistry } from "@runtime/tools/registry";

export interface APIRoute {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  handler: (request: APIRequest) => APIResponse;
}

export interface APIRequest {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export interface APIResponse {
  status: number;
  body: Record<string, unknown>;
}

export type HonoApp = ReturnType<typeof createHonoApp>;

export class APIRouter {
  private routes: Map<string, APIRoute> = new Map();

  use(route: APIRoute): void {
    const key = `${route.method}:${route.path}`;
    this.routes.set(key, route);
  }

  get(
    path: string,
    handler: (request: APIRequest) => APIResponse
  ): void {
    this.use({ method: "GET", path, handler });
  }

  post(
    path: string,
    handler: (request: APIRequest) => APIResponse
  ): void {
    this.use({ method: "POST", path, handler });
  }

  handle(
    method: string,
    path: string,
    request: APIRequest
  ): APIResponse {
    const key = `${method}:${path}`;
    const route = this.routes.get(key);
    if (!route) {
      return { status: 404, body: { error: "Not found" } };
    }
    return route.handler(request);
  }
}

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createHonoApp(
  _router: APIRouter,
  objectStore: ObjectStore,
  controller: ResearchController,
  provider: Provider
): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const html = fs.readFileSync("src/api/static/index.html", "utf8");
    return c.html(html);
  });

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  );

  app.post("/api/projects", async (c) => {
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

  app.get("/api/projects", async (c) => {
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

  app.get("/api/projects/:id", async (c) => {
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

  app.put("/api/projects/:id", async (c) => {
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

  app.delete("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const opt = await Effect.runPromise(objectStore.get(id, "Project"));
    if (opt.isNone()) {
      return c.json({ error: "Project not found" }, 404);
    }
    await Effect.runPromise(objectStore.delete(id, "Project"));
    return c.json({ deleted: id });
  });

  app.post("/api/research/questions", async (c) => {
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

  app.get("/api/research/:objectId", async (c) => {
    const objectId = c.req.param("objectId");
    const types = [
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
    for (const type of types) {
      const opt = await Effect.runPromise(objectStore.get(objectId, type));
      if (!opt.isNone()) {
        return c.json(opt.value);
      }
    }
    return c.json({ error: "Research object not found" }, 404);
  });

  app.put("/api/research/:objectId", async (c) => {
    const objectId = c.req.param("objectId");
    const body = await c.req.json();
    const types = [
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
    for (const type of types) {
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
    return c.json({ error: "Research object not found" }, 404);
  });

  app.delete("/api/research/:objectId", async (c) => {
    const objectId = c.req.param("objectId");
    await Effect.runPromise(objectStore.delete(objectId, "ResearchQuestion"));
    return c.json({ deleted: objectId });
  });

  app.post("/api/agent/run", async (c) => {
    const body = await c.req.json();
    const runId = generateUuid();
    const toolRegistry = new ToolRegistry();
    const loopResult = await runAgentLoop(
      provider,
      toolRegistry,
      [{ role: "user", content: body.prompt ?? "" }],
      20
    );
    return c.json({
      runId,
      status: "started",
      prompt: body.prompt ?? "",
      startedAt: new Date().toISOString(),
      result: loopResult.finalContent,
    });
  });

  app.post("/api/research/run", async (c) => {
    const body = await c.req.json();
    const projectId = generateUuid();
    const questionId = generateUuid();
    const branchId = generateUuid();
    const hypothesisId = generateUuid();
    const gapId = generateUuid();

    // Create project
    const now = new Date();
    const project = {
      projectId,
      name: body.question ?? "Untitled Research",
      status: "ACTIVE",
      description: body.question ?? "",
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    await Effect.runPromise(objectStore.save(project));

    // Create gap
    await Effect.runPromise(objectStore.save({
      gapId,
      projectId,
      branchId,
      description: body.question ?? "",
      status: "IDENTIFIED",
      createdAt: now,
    }));

    // Create hypothesis
    await Effect.runPromise(objectStore.save({
      hypothesisId,
      projectId,
      branchId,
      gapId,
      statement: body.question ?? "",
      falsificationCondition: "Evidence contradicts hypothesis",
      status: "PROPOSED",
      createdAt: now,
    }));

    // Run workflow
    const { createHypothesisVerificationWorkflow, runWorkflow } = await import(
      "@runtime/workflows/hypothesis-verification"
    );

    const phases = createHypothesisVerificationWorkflow({
      hypothesisId,
      projectId,
      branchId,
      provider,
      objectStore,
      eventStore: {} as any,
      controller,
    });

    // Run phase by phase, emitting events via SSE-like response
    const phaseResults: Array<{ name: string; status: string; data?: unknown }> = [];
    let status = "running";

    try {
    let prevResult: Record<string, unknown> = {};
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const phaseResult = await Effect.runPromise(phase.execute(prevResult));
      prevResult = phaseResult as Record<string, unknown>;

        phaseResults.push({
          name: phase.name,
          status: "completed",
          data: phaseResult,
        });
      }
      status = "completed";
    } catch (err: any) {
      status = "error";
      phaseResults.push({
        name: "error",
        status: "error",
        data: { error: String(err) },
      });
    }

    // Final state
    const evidenceList = await Effect.runPromise(objectStore.list("Evidence"));
    const knowledgeList = await Effect.runPromise(objectStore.list("KnowledgeItem"));
    const reports = await Effect.runPromise(objectStore.list("Report"));

    return c.json({
      runId: generateUuid(),
      projectId,
      questionId,
      hypothesisId,
      status,
      phases: phaseResults,
      evidenceCount: evidenceList.length,
      knowledgeCount: knowledgeList.length,
      reportCount: reports.length,
      completedAt: new Date().toISOString(),
    });
  });

  return app;
}
