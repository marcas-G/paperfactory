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
      {
        id,
        name: project.name,
        status: project.status,
        createdAt: now.toISOString(),
      },
      201
    );
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

  app.get("/ws", (c) => {
    try {
      const upgradeHeader = c.req.raw.headers.get("upgrade");
      if (upgradeHeader?.toLowerCase() === "websocket") {
        return c.json({ message: "WebSocket upgrade" });
      }
    } catch {
      // not websocket
    }
    return c.json({ message: "WebSocket endpoint" });
  });

  return app;
}
