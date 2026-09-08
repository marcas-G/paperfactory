import { Hono } from "hono";
import { Provider } from "@pf/core/runtime/provider";
import { ToolRegistry } from "@pf/core/runtime/tools/registry";
import { runAgentLoop } from "@pf/core/runtime/agent/loop";
import { generateUuid, validateString, apiError } from "../utils";

export function createAgentRoutes(
  provider: Provider,
  toolRegistry: ToolRegistry
): Hono {
  const router = new Hono();

  router.post("/api/agent/run", async (c) => {
    const body = await c.req.json();
    const prompt = validateString(body?.prompt, 4096);
    if (!prompt) {
      return c.json(apiError("VALIDATION_ERROR", "prompt is required (max 4096 chars)"), 400);
    }
    const runId = generateUuid();
    const loopResult = await runAgentLoop(
      provider,
      toolRegistry,
      [{ role: "user", content: prompt }],
      { maxIterations: 20 }
    );
    return c.json({
      runId,
      status: "completed",
      prompt,
      startedAt: new Date().toISOString(),
      result: loopResult.finalContent,
      events: loopResult.events,
    });
  });

  router.post("/api/agent/stream", async (c) => {
    const body = await c.req.json();
    const prompt = validateString(body?.prompt, 4096);
    if (!prompt) {
      return c.json(apiError("VALIDATION_ERROR", "prompt is required (max 4096 chars)"), 400);
    }
    const runId = generateUuid();

    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (eventType: string, data: unknown) => {
          if (closed) return;
          try {
            const line = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(line));
          } catch {
            closed = true;
          }
        };

        runAgentLoop(
          provider,
          toolRegistry,
          [{ role: "user", content: prompt }],
          {
            maxIterations: 20,
            onEvent: (event) => {
              sendEvent(event.type, event);
            },
          }
        ).finally(() => {
          sendEvent("done", { runId, content: "完成", timestamp: new Date().toISOString() });
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  });

  return router;
}
