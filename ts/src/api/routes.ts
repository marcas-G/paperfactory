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
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.route("", createHealthRoutes());
  app.route("", createProjectRoutes(objectStore));
  app.route("", createResearchObjectRoutes(objectStore));
  app.route("", createAgentRoutes(provider, researchToolRegistry));
  app.route("", createResearchRunRoutes(objectStore, controller, provider, researchToolRegistry, researchRuns));
  app.route("", createPhaseRoutes(objectStore, provider, researchToolRegistry, researchRuns));
  app.route("", createPaperRoutes(objectStore));

  return app;
}
