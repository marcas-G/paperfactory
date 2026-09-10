import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { Provider } from "@pf/core/runtime/provider";
import { ObjectStore } from "@pf/core/persistence/object-store";
import { ResearchController } from "@pf/core/control/controller";
import { ToolRegistry } from "@pf/core/runtime/tools/registry";
import { apiError, generateUuid, buildToolDefs, validateString } from "../utils";
import { eventBus } from "@pf/core/ledger/events";
import type { AgentEvent } from "@pf/core/runtime/agent/loop";

export type PhaseDecision = "approve" | "modify" | "reject";

/**
 * 工具结果 → 有意义的内容摘要（信息透明度：SSE 流里除原始 JSON 外带一行可读摘要）。
 * 覆盖三种形态：
 *   - literature_search: ToolOutput 顶层带 papers 数组（title/url）
 *   - search: content 为 `{"query","results":[{title,...}],"count"}` JSON 字符串
 *   - 其余: content 纯文本（code 输出等）取首行
 */
export function extractToolSummary(toolResult: unknown): string {
  if (!toolResult || typeof toolResult !== "object") return "";
  const record = toolResult as { content?: unknown; papers?: unknown; results?: unknown };
  const titleList = (arr: unknown[]): string => {
    const titles = arr
      .slice(0, 3)
      .map((p) => (typeof p === "object" && p !== null ? String((p as { title?: unknown }).title ?? "").slice(0, 50) : ""))
      .filter(Boolean);
    return titles.length > 0 ? `${arr.length} results: ${titles.join(" / ")}` : `${arr.length} results`;
  };
  if (Array.isArray(record.papers)) return titleList(record.papers);
  if (Array.isArray(record.results)) return titleList(record.results);
  const content = typeof record.content === "string" ? record.content : "";
  if (!content) return "";
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) return titleList(parsed);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as { papers?: unknown; results?: unknown; count?: unknown };
      if (Array.isArray(obj.papers)) return titleList(obj.papers);
      if (Array.isArray(obj.results)) return titleList(obj.results);
      const keys = Object.keys(parsed as Record<string, unknown>).slice(0, 5).join(", ");
      return `{${keys}}`;
    }
  } catch {
    /* not JSON */
  }
  const firstLine = content.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return firstLine.slice(0, 100);
}

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
    const runId = generateUuid();
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

    let stopped = false;
    researchRuns.set(runId, {
      stopped: () => stopped,
      setStopped: (v: boolean) => { stopped = v; },
      approvalResolve: null,
      approvalPhase: null,
      approvalRunId: null,
    });

    // ★ 命令/事件分离（OpenCode admit 模式）：立即返回 runId，
    // 研究后台执行，全部进度经 /api/events 统一事件流广播给所有客户端。
    eventBus.emit("run:start", { runId, projectId, data: { question } });

    void (async () => {
      try {
        const { runAgentDrivenResearch } = await import("@pf/research/agent-research");
        const toolDefinitions = buildToolDefs(toolRegistry);
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
          mode: body?.mode === "manual" ? "manual" : "auto",
          onEvent: (event) => {
            eventBus.emit(event.type, {
              runId,
              projectId,
              phase: event.phase,
              data: {
                content: event.content,
                toolName: event.toolName,
                toolArgs: event.toolArgs,
                toolResult: event.toolResult,
                iteration: event.iteration,
                passed: event.passed,
                ...(event.type === "tool:result" && event.toolResult
                  ? { summary: extractToolSummary(event.toolResult) }
                  : {}),
              },
            });
          },
          onApprovalNeeded: async (rid: string, phaseName: string, summary: string) => {
            if (body?.mode === "manual") {
              eventBus.emit("phase:awaiting_approval", { runId: rid, projectId, phase: phaseName, data: { summary } });
              return new Promise<PhaseDecision>((resolve) => {
                const runState = researchRuns.get(runId);
                if (runState) {
                  runState.approvalPhase = phaseName;
                  runState.approvalRunId = rid;
                  runState.approvalResolve = resolve;
                } else {
                  resolve("approve");
                }
              });
            }
            return "approve";
          },
          shouldStop: () => stopped,
        });

        eventBus.emit("run:complete", {
          runId,
          projectId,
          data: {
            hypothesisStatements: researchResult.hypothesisStatements,
            evidenceCount: researchResult.evidence.length,
            knowledgeCount: researchResult.knowledgeItems.length,
            reportCount: researchResult.reports.length,
          },
        });
      } catch (err: unknown) {
        eventBus.emit("run:error", { runId, projectId, data: { error: String(err) } });
      } finally {
        researchRuns.delete(runId);
      }
    })();

    return c.json({ runId, projectId, questionId, status: "started" }, 202);
  });

  // REQ-REC4：断点续跑——中断（崩溃/stop）的 run 从未完成阶段继续，已完成阶段不重跑。
  // body { projectId }：查原项目（404 = 不存在）→ 取 question（Project.name）→
  // 依据 PhaseRun 记录算 resumeFromPhase → 复用原 projectId/branchId 后台执行。
  // 异步模式同 /api/research/run：202 秒回 runId，事件进 eventBus，stop/approval 纳入 researchRuns。
  router.post("/api/research/resume", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const projectId = validateString(body?.projectId, 128);
    if (!projectId) {
      return c.json(apiError("VALIDATION_ERROR", "projectId is required (max 128 chars)"), 400);
    }

    const projectOpt = await Effect.runPromise(objectStore.get(projectId, "Project"));
    if (projectOpt.isNone()) {
      return c.json(apiError("NOT_FOUND", "Project not found"), 404);
    }
    const project = projectOpt.value as Record<string, unknown>;
    const question = (project.name as string | undefined) ?? "";

    const { lastCompletedPhase } = await import("@pf/research/agent-research");
    const resumeFromPhase = await lastCompletedPhase(objectStore, projectId);

    // 复用原 branchId（run 时存在 Hypothesis 上；无则新开）
    const hypotheses = (await Effect.runPromise(objectStore.list("Hypothesis"))) as Array<Record<string, unknown>>;
    const originalBranchId = hypotheses.find((h) => h.projectId === projectId)?.branchId as string | undefined;
    const branchId = originalBranchId ?? generateUuid();

    const runId = generateUuid();
    let stopped = false;
    researchRuns.set(runId, {
      stopped: () => stopped,
      setStopped: (v: boolean) => { stopped = v; },
      approvalResolve: null,
      approvalPhase: null,
      approvalRunId: null,
    });

    eventBus.emit("run:start", { runId, projectId, data: { question, resumed: true, resumeFromPhase } });

    void (async () => {
      try {
        const { runAgentDrivenResearch } = await import("@pf/research/agent-research");
        const toolDefinitions = buildToolDefs(toolRegistry);
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
          resumeFromPhase: resumeFromPhase ?? undefined,
          mode: body?.mode === "manual" ? "manual" : "auto",
          onEvent: (event) => {
            eventBus.emit(event.type, {
              runId,
              projectId,
              phase: event.phase,
              data: {
                content: event.content,
                toolName: event.toolName,
                toolArgs: event.toolArgs,
                toolResult: event.toolResult,
                iteration: event.iteration,
                passed: event.passed,
                ...(event.type === "tool:result" && event.toolResult
                  ? { summary: extractToolSummary(event.toolResult) }
                  : {}),
              },
            });
          },
          onApprovalNeeded: async (rid: string, phaseName: string, summary: string) => {
            if (body?.mode === "manual") {
              eventBus.emit("phase:awaiting_approval", { runId: rid, projectId, phase: phaseName, data: { summary } });
              return new Promise<PhaseDecision>((resolve) => {
                const runState = researchRuns.get(runId);
                if (runState) {
                  runState.approvalPhase = phaseName;
                  runState.approvalRunId = rid;
                  runState.approvalResolve = resolve;
                } else {
                  resolve("approve");
                }
              });
            }
            return "approve";
          },
          shouldStop: () => stopped,
        });

        eventBus.emit("run:complete", {
          runId,
          projectId,
          data: {
            resumed: true,
            resumeFromPhase,
            hypothesisStatements: researchResult.hypothesisStatements,
            evidenceCount: researchResult.evidence.length,
            knowledgeCount: researchResult.knowledgeItems.length,
            reportCount: researchResult.reports.length,
          },
        });
      } catch (err: unknown) {
        eventBus.emit("run:error", { runId, projectId, data: { error: String(err) } });
      } finally {
        researchRuns.delete(runId);
      }
    })();

    return c.json({ runId, projectId, resumeFromPhase, status: "started" }, 202);
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
            // 注意：不发送 SSE 的 `event:` 行 —— 带 event 名的消息不会触发浏览器
            // EventSource.onmessage（只触发 addEventListener）。统一只发 data 行，
            // 事件类型放在 JSON 的 type 字段里，由前端按 parsed.type 分发。
            const line = `data: ${JSON.stringify({ type: eventType, ...((typeof data === "object" && data !== null) ? data : { content: data }) })}\n\n`;
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

          const { runAgentDrivenResearch } = await import("@pf/research/agent-research");
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
