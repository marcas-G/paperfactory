import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { Provider } from "@runtime/provider";
import { ObjectStore } from "@persistence/object-store";
import { ResearchController } from "@control/controller";
import { ToolRegistry } from "@runtime/tools/registry";
import { apiError, generateUuid, buildToolDefs, validateString } from "../utils";
import type { AgentEvent } from "@runtime/agent/loop";

export type PhaseDecision = "approve" | "modify" | "reject";

export interface ResearchRunState {
  stopped: () => boolean;
  setStopped: (v: boolean) => void;
  approvalResolve: ((v: PhaseDecision) => void) | null;
  approvalPhase: string | null;
  approvalRunId: string | null;
}

export function createResearchRunRoutes(
  objectStore: ObjectStore,
  controller: ResearchController,
  provider: Provider,
  toolRegistry: ToolRegistry,
  researchRuns: Map<string, ResearchRunState>
): Hono {
  const router = new Hono();

  router.post("/api/research/run", async (c) => {
    const body = await c.req.json();
    const question = validateString(body?.question, 2048);
    if (!question) {
      return c.json(apiError("VALIDATION_ERROR", "question is required (max 2048 chars)"), 400);
    }
    const projectId = generateUuid();
    const questionId = generateUuid();
    const branchId = generateUuid();
    const hypothesisId = generateUuid();

    const now = new Date();
    const project = {
      projectId,
      name: question,
      status: "ACTIVE",
      description: question,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    await Effect.runPromise(objectStore.save(project));

    await Effect.runPromise(objectStore.save({
      hypothesisId,
      projectId,
      branchId,
      statement: question,
      falsificationCondition: "Evidence contradicts hypothesis",
      status: "PROPOSED",
      createdAt: now,
    }));

    const { runAgentDrivenResearch } = await import("@orchestration/agent-research");
    const toolDefinitions = buildToolDefs(toolRegistry);
    const events: AgentEvent[] = [];
    // 非流式端点不支持中途 stop:保持 false(researchRuns 注册只在 stream 端点)
    const stopped = false;

    const researchResult = await runAgentDrivenResearch({
      projectId,
      branchId,
      question,
      provider,
      objectStore,
      eventStore: controller.eventStore,
      controller,
      toolRegistry,
      toolDefinitions,
      onEvent: (event) => events.push(event),
      shouldStop: () => stopped,
    });

    return c.json({
      runId: generateUuid(),
      projectId,
      questionId,
      status: "completed",
      hypotheses: researchResult.hypotheses.map((h: Record<string, unknown>) => ({ id: h.hypothesisId, statement: h.statement, status: h.status })),
      researchGaps: researchResult.researchGaps,
      evidenceCount: researchResult.evidence.length,
      knowledgeCount: researchResult.knowledgeItems.length,
      reportCount: researchResult.reports.length,
      events,
      completedAt: new Date().toISOString(),
    });
  });

  const startResearchStream = (question: string, mode: "manual" | "auto") => {
    const runId = generateUuid();
    const projectId = generateUuid();
    const branchId = generateUuid();
    const hypothesisId = generateUuid();

    const now = new Date();
    const project = {
      projectId,
      name: question,
      status: "ACTIVE",
      description: question,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };

    const encoder = new TextEncoder();
    let controllerRef: ReadableStreamDefaultController | null = null;
    let closed = false;
    let stopped = false;

    const stream = new ReadableStream({
      async start(ctrl) {
        controllerRef = ctrl;
        const sendEvent = (eventType: string, data: unknown) => {
          if (closed) return;
          try {
            const line = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
            ctrl.enqueue(encoder.encode(line));
          } catch {
            closed = true;
          }
        };

        try {
          await Effect.runPromise(objectStore.save(project));
          await Effect.runPromise(objectStore.save({
            hypothesisId,
            projectId,
            branchId,
            statement: question,
            falsificationCondition: "Evidence contradicts hypothesis",
            status: "PROPOSED",
            createdAt: now,
          }));

          researchRuns.set(runId, { stopped: () => stopped, setStopped: (v: boolean) => { stopped = v; }, approvalResolve: null, approvalPhase: null, approvalRunId: null });

          const { runAgentDrivenResearch } = await import("@orchestration/agent-research");
          const toolDefinitions = buildToolDefs(toolRegistry);

          sendEvent("run:start", { runId, projectId, question });

          const researchResult = await runAgentDrivenResearch({
            projectId,
            branchId,
            question,
            provider,
            objectStore,
            eventStore: controller.eventStore,
            controller,
            toolRegistry,
            toolDefinitions,
            mode,
            onEvent: (event) => sendEvent(event.type, event),
            onApprovalNeeded: async (runId2: string, phaseName: string, summary: string) => {
              if (mode === "auto") return "approve";
              sendEvent("phase:awaiting_approval", { runId: runId2, phaseName, summary });
              return new Promise<PhaseDecision>((resolve) => {
                const runState = researchRuns.get(runId);
                if (runState) {
                  runState.approvalPhase = phaseName;
                  runState.approvalRunId = runId2;
                  runState.approvalResolve = resolve;
                }
              });
            },
            shouldStop: () => stopped,
          });

          sendEvent("run:complete", {
            runId,
            projectId,
            hypothesisId,
            hypothesisStatements: researchResult.hypothesisStatements,
            evidenceCount: researchResult.evidence.length,
            knowledgeCount: researchResult.knowledgeItems.length,
            reportCount: researchResult.reports.length,
            completedAt: new Date().toISOString(),
          });
        } catch (err: unknown) {
          sendEvent("run:error", { runId, error: String(err) });
        } finally {
          if (!closed) {
            closed = true;
            try { controllerRef?.close(); } catch { /* already closed */ }
          }
          researchRuns.delete(runId);
        }
      },
    });

    return { stream, runId };
  };

  router.post("/api/research/stream", async (c) => {
    const body = await c.req.json();
    const question = validateString(body?.question, 2048);
    if (!question) {
      return c.json(apiError("VALIDATION_ERROR", "question is required (max 2048 chars)"), 400);
    }
    const { stream, runId } = startResearchStream(question, body?.mode ?? "manual");
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Run-Id": runId,
      },
    });
  });

  router.get("/api/research/stream", async (c) => {
    const question = validateString(c.req.query("q"), 2048);
    if (!question) {
      return c.json(apiError("VALIDATION_ERROR", "q parameter is required (max 2048 chars)"), 400);
    }
    const { stream, runId } = startResearchStream(question, "manual");
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Run-Id": runId,
      },
    });
  });

  router.post("/api/research/:runId/stop", async (c) => {
    const runId = c.req.param("runId");
    const run = researchRuns.get(runId);
    if (run) {
      run.setStopped(true);
      return c.json({ runId, stopped: true });
    }
    return c.json(apiError("NOT_FOUND", "Run not found"), 404);
  });

  router.get("/api/research/:runId/status", async (c) => {
    const runId = c.req.param("runId");
    const run = researchRuns.get(runId);
    if (run) {
      return c.json({ runId, status: run.stopped() ? "stopped" : "running" });
    }
    return c.json(apiError("NOT_FOUND", "Run not found"), 404);
  });

  return router;
}
