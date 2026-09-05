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

  app.get("/api/projects/:id/hypotheses", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("Hypothesis"));
    return c.json(all.filter((h: any) => h.projectId === id));
  });

  app.get("/api/projects/:id/evidence", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("Evidence"));
    return c.json(all.filter((e: any) => e.projectId === id));
  });

  app.get("/api/projects/:id/knowledge", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("KnowledgeItem"));
    return c.json(all.filter((k: any) => k.projectId === id));
  });

  app.get("/api/projects/:id/reports", async (c) => {
    const id = c.req.param("id");
    const all = await Effect.runPromise(objectStore.list("Report"));
    return c.json(all.filter((r: any) => r.projectId === id));
  });

  app.get("/api/projects/:id/all", async (c) => {
    const id = c.req.param("id");
    const hypotheses = await Effect.runPromise(objectStore.list("Hypothesis"));
    const evidence = await Effect.runPromise(objectStore.list("Evidence"));
    const knowledge = await Effect.runPromise(objectStore.list("KnowledgeItem"));
    const reports = await Effect.runPromise(objectStore.list("Report"));
    const experiments = await Effect.runPromise(objectStore.list("Experiment"));
    return c.json({
      hypotheses: hypotheses.filter((h: any) => h.projectId === id),
      evidence: evidence.filter((e: any) => e.projectId === id),
      knowledge: knowledge.filter((k: any) => k.projectId === id),
      reports: reports.filter((r: any) => r.projectId === id),
      experiments: experiments.filter((e: any) => e.projectId === id),
    });
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
      { maxIterations: 20 }
    );
    return c.json({
      runId,
      status: "completed",
      prompt: body.prompt ?? "",
      startedAt: new Date().toISOString(),
      result: loopResult.finalContent,
      events: loopResult.events,
    });
  });

  // SSE streaming endpoint
  app.post("/api/agent/stream", async (c) => {
    const body = await c.req.json();
    const runId = generateUuid();
    const toolRegistry = new ToolRegistry();

    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    const events: Array<Record<string, unknown>> = [];

    await runAgentLoop(
      provider,
      toolRegistry,
      [{ role: "user", content: body.prompt ?? "" }],
      {
        maxIterations: 20,
        onEvent: (event) => {
          const data = JSON.stringify(event);
          c.respondWith(new Response(
            `event: ${event.type}\ndata: ${data}\n\n`,
            { headers: { "Content-Type": "text/event-stream" } }
          ));
          events.push(event);
        },
      }
    );

    // Send final event
    const finalEvent = { type: "done", content: "完成", timestamp: new Date().toISOString() };
    return new Response(
      `event: done\ndata: ${JSON.stringify(finalEvent)}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );
  });

  // Blocking research run (legacy)
  app.post("/api/research/run", async (c) => {
    const body = await c.req.json();
    const projectId = generateUuid();
    const questionId = generateUuid();
    const branchId = generateUuid();
    const hypothesisId = generateUuid();

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

    const { InMemoryObjectStore } = await import("@persistence/object-store");
    const { InMemoryEventStore } = await import("@persistence/event-store");
    const memStore = new InMemoryObjectStore();
    const memEventStore = new InMemoryEventStore();

    await Effect.runPromise(memStore.save({
      hypothesisId,
      projectId,
      branchId,
      statement: body.question ?? "",
      falsificationCondition: "Evidence contradicts hypothesis",
      status: "PROPOSED",
      createdAt: now,
    }));

    const { TransitionEngine } = await import("@control/engine");
    const { ActionRegistry } = await import("@control/registry");
    const memController = new (await import("@control/controller")).ResearchController(
      memStore,
      memEventStore,
      new TransitionEngine(),
      new ActionRegistry()
    );

    const { runAgentDrivenResearch } = await import("@runtime/workflows/agent-research");
    const toolRegistry = new ToolRegistry();
    const events: Array<Record<string, unknown>> = [];
    let stopped = false;

    const researchResult = await runAgentDrivenResearch({
      hypothesisId,
      projectId,
      branchId,
      question: body.question ?? "",
      provider,
      objectStore: memStore,
      eventStore: memEventStore,
      controller: memController,
      toolRegistry,
      onEvent: (event) => events.push(event),
      shouldStop: () => stopped,
    });

    // Persist to PG
    for (const item of [...researchResult.knowledgeItems, ...researchResult.evidence, ...researchResult.experiments, ...researchResult.results, ...researchResult.reports]) {
      await Effect.runPromise(objectStore.save(item));
    }

    return c.json({
      runId: generateUuid(),
      projectId,
      questionId,
      hypothesisId,
      status: "completed",
      hypothesis: [{ id: hypothesisId, statement: body.question, status: researchResult.hypothesisStatus }],
      evidenceCount: researchResult.evidence.length,
      knowledgeCount: researchResult.knowledgeItems.length,
      reportCount: researchResult.reports.length,
      events,
      completedAt: new Date().toISOString(),
    });
  });

  // SSE streaming research run - Agent 实时工作流
  app.post("/api/research/stream", async (c) => {
    const body = await c.req.json();
    const runId = generateUuid();
    const projectId = generateUuid();
    const branchId = generateUuid();
    const hypothesisId = generateUuid();

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

    const { InMemoryObjectStore } = await import("@persistence/object-store");
    const { InMemoryEventStore } = await import("@persistence/event-store");
    const memStore = new InMemoryObjectStore();
    const memEventStore = new InMemoryEventStore();

    await Effect.runPromise(memStore.save({
      hypothesisId,
      projectId,
      branchId,
      statement: body.question ?? "",
      falsificationCondition: "Evidence contradicts hypothesis",
      status: "PROPOSED",
      createdAt: now,
    }));

    const { TransitionEngine } = await import("@control/engine");
    const { ActionRegistry } = await import("@control/registry");
    const memController = new (await import("@control/controller")).ResearchController(
      memStore,
      memEventStore,
      new TransitionEngine(),
      new ActionRegistry()
    );

    const { runAgentDrivenResearch } = await import("@runtime/workflows/agent-research");
    const toolRegistry = new ToolRegistry();
    let stopped = false;

    // Store run state for interrupt
    (globalThis as any).__researchRuns = (globalThis as any).__researchRuns ?? new Map();
    (globalThis as any).__researchRuns.set(runId, { stopped: () => stopped, setStopped: (v: boolean) => { stopped = v; } });

    const encoder = new TextEncoder();
    let controllerRef: ReadableStreamDefaultController | null = null;
    let closed = false;

    const stream = new ReadableStream({
      start(controller) {
        controllerRef = controller;
        const sendEvent = (eventType: string, data: Record<string, unknown>) => {
          if (closed) return;
          try {
            const line = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(line));
          } catch {
            closed = true;
          }
        };

        (async () => {
          try {
            sendEvent("run:start", { runId, projectId, question: body.question });

            const researchResult = await runAgentDrivenResearch({
              hypothesisId,
              projectId,
              branchId,
              question: body.question ?? "",
              provider,
              objectStore: memStore,
              eventStore: memEventStore,
              controller: memController,
              toolRegistry,
              onEvent: (event) => {
                sendEvent(event.type, event);
              },
              shouldStop: () => stopped,
            });

            // Persist to PG
            for (const item of [...researchResult.knowledgeItems, ...researchResult.evidence, ...researchResult.experiments, ...researchResult.results, ...researchResult.reports]) {
              await Effect.runPromise(objectStore.save(item));
            }

            sendEvent("run:complete", {
              runId,
              projectId,
              hypothesisId,
              hypothesisStatus: researchResult.hypothesisStatus,
              evidenceCount: researchResult.evidence.length,
              knowledgeCount: researchResult.knowledgeItems.length,
              reportCount: researchResult.reports.length,
              completedAt: new Date().toISOString(),
            });
          } catch (err: any) {
            sendEvent("run:error", { runId, error: String(err) });
          } finally {
            if (!closed) {
              closed = true;
              try { controllerRef?.close(); } catch { /* already closed */ }
            }
            (globalThis as any).__researchRuns.delete(runId);
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Run-Id": runId,
      },
    });
  });

  // Interrupt a running research
  app.post("/api/research/:runId/stop", async (c) => {
    const runId = c.req.param("runId");
    const runs = (globalThis as any).__researchRuns as Map<string, { stopped: () => boolean; setStopped: (v: boolean) => void }>;
    const run = runs?.get(runId);
    if (run) {
      run.setStopped(true);
      return c.json({ runId, stopped: true });
    }
    return c.json({ runId, stopped: false, error: "Run not found" }, 404);
  });

  // Get current run status
  app.get("/api/research/:runId/status", async (c) => {
    const runId = c.req.param("runId");
    const runs = (globalThis as any).__researchRuns as Map<string, { stopped: () => boolean }>;
    const run = runs?.get(runId);
    if (run) {
      return c.json({ runId, status: run.stopped() ? "stopped" : "running" });
    }
    return c.json({ runId, status: "not_found" }, 404);
  });

  return app;
}
