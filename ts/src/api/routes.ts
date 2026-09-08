import { Hono } from "hono";
import { Provider } from "@runtime/provider";
import { ObjectStore } from "@persistence/object-store";
import { ResearchController } from "@control/controller";
import { ToolRegistry } from "@runtime/tools/registry";
import { cors } from "./middleware/cors";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { createHealthRoutes } from "./routes/health";
import { createProjectRoutes } from "./routes/projects";
import { createResearchObjectRoutes } from "./routes/research-objects";
import { createAgentRoutes } from "./routes/agent";
import { createResearchRunRoutes, ResearchRunState } from "./routes/research-runs";
import { createPhaseRoutes } from "./routes/phases";
import { createPaperRoutes } from "./routes/papers";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_DIR = path.join(__dirname, "static");

function serveStaticFile(c: import("hono").Context, filePath: string): Response | undefined {
  const extMap: Record<string, string> = {
    ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  };
  const ext = path.extname(filePath);
  const contentType = extMap[ext] ?? "application/octet-stream";
  try {
    const data = fs.readFileSync(filePath);
    return new Response(data, { headers: { "Content-Type": contentType } });
  } catch {
    return undefined;
  }
}

// SPA 前端路由白名单:仅这些路径回退到 index.html(React Router 客户端路由)。
// 其余非 /api 路径(/ws、未知路径等)继续走 notFoundHandler → 404,
// 避免 SPA catch-all 吞掉 WebSocket 端点与 API typo。
const SPA_ROUTE_PREFIXES: ReadonlyArray<string> = [
  "/research", // /research/:projectId
];
const SPA_ROUTES: ReadonlyArray<string> = ["/projects", "/papers"];

function isSpaPath(urlPath: string): boolean {
  if (urlPath === "" || urlPath === "/") return true;
  if (SPA_ROUTES.includes(urlPath)) return true;
  return SPA_ROUTE_PREFIXES.some(
    (p) => urlPath === p || urlPath.startsWith(`${p}/`)
  );
}

function getStaticMiddleware() {
  return async (c: import("hono").Context, next: () => Promise<void>) => {
    if (c.req.method !== "GET") {
      return next();
    }
    const baseUrl = c.req.url.split("?")[0].split("/").slice(0, 3).join("/");
    const urlPath = c.req.url.replace(baseUrl, "").split("?")[0];

    if (urlPath.startsWith("/api/") || urlPath === "/health") {
      return next();
    }

    if (urlPath.startsWith("/js/") || urlPath.startsWith("/css/")) {
      const filePath = path.join(STATIC_DIR, urlPath);
      const resp = serveStaticFile(c, filePath);
      if (resp) return resp;
      return next();
    }

    if (isSpaPath(urlPath)) {
      const indexFile = path.join(STATIC_DIR, "index.html");
      const resp = serveStaticFile(c, indexFile);
      if (resp) return resp;
    }

    return next();
  };
}

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
  objectStore: ObjectStore,
  controller: ResearchController,
  provider: Provider,
  appToolRegistry?: ToolRegistry
): Hono {
  const researchToolRegistry = appToolRegistry ?? new ToolRegistry();
  const researchRuns = new Map<string, ResearchRunState>();
  const app = new Hono();

  app.use("/*", cors);
  app.use("/*", getStaticMiddleware());
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.route("", createHealthRoutes());
  app.route("", createProjectRoutes(objectStore));
  app.route("", createResearchRunRoutes(objectStore, controller, provider, researchToolRegistry, researchRuns));
  app.route("", createAgentRoutes(provider, researchToolRegistry));
  app.route("", createPhaseRoutes(objectStore, provider, researchToolRegistry, researchRuns));
  app.route("", createResearchObjectRoutes(objectStore));
  app.route("", createPaperRoutes(objectStore));

  return app;
}
