import * as fs from "fs";
import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { Provider, ToolDefinition } from "@runtime/provider";
import { ObjectStore } from "@persistence/object-store";
import { ResearchController } from "@control/controller";
import { runAgentLoop } from "@runtime/agent/loop";
import { ToolRegistry } from "@runtime/tools/registry";
import { BaseTool } from "@runtime/tools/contracts";

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

function buildToolDefs(registry: ToolRegistry): ReadonlyArray<ToolDefinition> {
  return registry.list().map((info) => ({
    name: info.name,
    description: info.description,
    parameters: info.schema ?? {
      type: "object",
      properties: {},
    },
  }));
}

export function createHonoApp(
  _router: APIRouter,
  objectStore: ObjectStore,
  controller: ResearchController,
  provider: Provider,
  appToolRegistry?: ToolRegistry
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
    const researchToolRegistry = appToolRegistry ?? new ToolRegistry();
    const toolDefinitions = buildToolDefs(researchToolRegistry);
    const events: Array<Record<string, unknown>> = [];
    let stopped = false;

    const researchResult = await runAgentDrivenResearch({
      projectId,
      branchId,
      question: body.question ?? "",
      provider,
      objectStore: memStore,
      eventStore: memEventStore,
      controller: memController,
      toolRegistry: researchToolRegistry,
      toolDefinitions,
      onEvent: (event) => events.push(event),
      shouldStop: () => stopped,
    });

    // Persist PhaseRuns to PG
    const phaseRuns = await Effect.runPromise(memStore.list("PhaseRun"));
    for (const pr of phaseRuns) {
      await Effect.runPromise(objectStore.save(pr));
    }

    // Persist EvidenceChains to PG
    const chains = await Effect.runPromise(memStore.list("EvidenceChain"));
    for (const ch of chains) {
      await Effect.runPromise(objectStore.save(ch));
    }

    // Persist Citations to PG
    const citations = await Effect.runPromise(memStore.list("Citation"));
    for (const ci of citations) {
      await Effect.runPromise(objectStore.save(ci));
    }

    // Persist other objects to PG
    for (const item of [...researchResult.knowledgeItems, ...researchResult.evidence, ...researchResult.experiments, ...researchResult.results, ...researchResult.reports]) {
      await Effect.runPromise(objectStore.save(item));
    }

    return c.json({
      runId: generateUuid(),
      projectId,
      questionId,
      status: "completed",
      hypotheses: researchResult.hypotheses.map((h: any) => ({ id: h.hypothesisId, statement: h.statement, status: h.status })),
      researchGaps: researchResult.researchGaps,
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
    const researchToolRegistry = appToolRegistry ?? new ToolRegistry();
    const toolDefinitions = buildToolDefs(researchToolRegistry);
    let stopped = false;

    // Store run state for interrupt + approval pending
    (globalThis as any).__researchRuns = (globalThis as any).__researchRuns ?? new Map();
    (globalThis as any).__researchRuns.set(runId, { stopped: () => stopped, setStopped: (v: boolean) => { stopped = v; }, approvalResolve: null, approvalPhase: null, approvalRunId: null });

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
              projectId,
              branchId,
              question: body.question ?? "",
              provider,
              objectStore: memStore,
              eventStore: memEventStore,
              controller: memController,
              toolRegistry: researchToolRegistry,
              toolDefinitions,
              mode: body.mode ?? "manual",
              onEvent: (event) => {
                sendEvent(event.type, event);
              },
              onApprovalNeeded: async (runId2: string, phaseName: string, summary: string) => {
                if (body.mode === "auto") {
                  return "approve";
                }
                sendEvent("phase:awaiting_approval", { runId: runId2, phaseName, summary });
                // Wait for HTTP decision endpoint to resolve
                return new Promise<string>((resolve) => {
                  const runState = (globalThis as any).__researchRuns.get(runId);
                  runState.approvalPhase = phaseName;
                  runState.approvalRunId = runId2;
                  runState.approvalResolve = resolve;
                });
              },
              shouldStop: () => stopped,
            });

            // Persist PhaseRuns to PG
            const phaseRuns = await Effect.runPromise(memStore.list("PhaseRun"));
            for (const pr of phaseRuns) {
              await Effect.runPromise(objectStore.save(pr));
            }

            // Persist EvidenceChains to PG
            const chains = await Effect.runPromise(memStore.list("EvidenceChain"));
            for (const ch of chains) {
              await Effect.runPromise(objectStore.save(ch));
            }

            // Persist Citations to PG
            const citations = await Effect.runPromise(memStore.list("Citation"));
            for (const ci of citations) {
              await Effect.runPromise(objectStore.save(ci));
            }

            // Persist other objects to PG
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

  // Get all data for a project (phases, hypotheses, evidence, etc.)
  app.get("/api/projects/:id/all", async (c) => {
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

  // List phase runs for a project
  app.get("/api/projects/:id/phases", async (c) => {
    const id = c.req.param("id");
    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    const projectRuns = runs
      .filter((r: any) => r.projectId === id)
      .sort((a: any, b: any) => a.phase_version - b.phase_version);
    return c.json(projectRuns.map((r: any) => ({
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
    })));
  });

  // Get phases grouped by phase name
  app.get("/api/projects/:id/phases/grouped", async (c) => {
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

  // Get evidence chain for an object (bidirectional)
  app.get("/api/projects/:id/chain/:objectType/:objectId", async (c) => {
    const id = c.req.param("id");
    const objectType = c.req.param("objectType");
    const objectId = c.req.param("objectId");

    const chains = await Effect.runPromise(objectStore.list("EvidenceChain"));
    const projectChains = chains.filter((ch: any) => ch.projectId === id);

    // Upstream: things this object depends on
    const upstream = projectChains.filter((ch: any) =>
      ch.sourceType === objectType && ch.sourceId === objectId
    ).map((ch: any) => ({
      targetType: ch.targetType,
      targetId: ch.targetId,
      relation: ch.relation,
    }));

    // Downstream: things that depend on this object
    const downstream = projectChains.filter((ch: any) =>
      ch.targetType === objectType && ch.targetId === objectId
    ).map((ch: any) => ({
      sourceType: ch.sourceType,
      sourceId: ch.sourceId,
      relation: ch.relation,
    }));

    return c.json({ upstream, downstream });
  });

  // Approve/modify/reject a phase run
  app.post("/api/projects/:id/phases/:runId/decision", async (c) => {
    const id = c.req.param("id");
    const runId = c.req.param("runId");
    const body = await c.req.json();

    // Resolve pending approval in active research run
    const allRuns = (globalThis as any).__researchRuns ?? new Map();
    for (const [researchRunId, state] of allRuns.entries()) {
      if (state && state.approvalRunId === runId && state.approvalResolve) {
        const resolve = state.approvalResolve;
        state.approvalResolve = null;
        state.approvalRunId = null;
        resolve(body.decision ?? "approve");

        // Send SSE event after decision
        const eventType = body.decision === "approve" ? "phase:approved" : body.decision === "modify" ? "phase:modified" : "phase:rejected";
        // Will be handled by agent-research onApprovalNeeded callback
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

    // Deactivate other versions of same phase
    const samePhase = runs.filter((r: any) =>
      r.projectId === id && r.phaseName === run.phaseName && r.phaseRunId !== runId
    );
    for (const other of samePhase) {
      await Effect.runPromise(objectStore.save({ ...other, active: false, updatedAt: new Date() }));
    }

    await Effect.runPromise(objectStore.save(updated));
    return c.json(updated);
  });

  // Re-run a specific phase for a project
  app.post("/api/projects/:id/phases/:phaseName/run", async (c) => {
    const id = c.req.param("id");
    const phaseName = c.req.param("phaseName");
    const body = await c.req.json().catch(() => ({}));

    const { PHASE_CONTRACTS } = await import("@runtime/workflows/phase-contracts");
    const contract = PHASE_CONTRACTS.find((p) => p.name === phaseName);
    if (!contract) {
      return c.json({ error: `Unknown phase: ${phaseName}` }, 404);
    }

    const researchToolRegistry = appToolRegistry ?? new ToolRegistry();
    const toolDefinitions = buildToolDefs(researchToolRegistry);
    const events: Array<Record<string, unknown>> = [];

    const { runPhase } = await import("@runtime/workflows/phase-contracts");
    const result = await runPhase(
      contract,
      objectStore,
      provider,
      researchToolRegistry,
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

  return app;
}
