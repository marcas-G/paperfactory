import { Hono } from "hono";
import { Provider } from "@runtime/provider";

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

export function createHonoApp(
  _router: APIRouter,
  _objectStore: unknown,
  _controller: unknown,
  _provider: Provider
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
    return c.json(
      {
        id: "00000000-0000-4000-a000-000000000000",
        name: body.name ?? "Untitled",
        status: "created",
        createdAt: new Date().toISOString(),
      },
      201
    );
  });

  app.post("/api/research/questions", async (c) => {
    const body = await c.req.json();
    return c.json(
      {
        questionId: "00000000-0000-4000-a000-000000000000",
        title: body.title ?? "Untitled Question",
        statement: body.statement ?? "",
        domain: body.domain ?? "general",
        status: "DRAFT",
        createdAt: new Date().toISOString(),
      },
      201
    );
  });

  app.post("/api/agent/run", async (c) => {
    const body = await c.req.json();
    return c.json({
      runId: "00000000-0000-4000-a000-000000000000",
      status: "started",
      prompt: body.prompt ?? "",
      startedAt: new Date().toISOString(),
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
