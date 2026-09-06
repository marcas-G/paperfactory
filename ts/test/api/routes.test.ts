import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import * as Effect from "effect/Effect";
import { APIRouter, APIRequest, createHonoApp, HonoApp } from "@api/routes";
import { ObjectStore, InMemoryObjectStore } from "@persistence/object-store";
import { InMemoryEventStore } from "@persistence/event-store";
import { ResearchController } from "@control/controller";
import { TransitionEngine } from "@control/engine";
import { ActionRegistry } from "@control/registry";
import { MockProvider } from "@runtime/provider";
import { DeterministicProvider } from "@runtime/provider-deterministic";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildFullApp() {
  const objectStore = new InMemoryObjectStore();
  const eventStore = new InMemoryEventStore();
  const transitionEngine = new TransitionEngine();
  const actionRegistry = new ActionRegistry();
  const controller = new ResearchController(
    objectStore,
    eventStore,
    transitionEngine,
    actionRegistry
  );
  const router = new APIRouter();
  const provider = new DeterministicProvider({
    name: "test",
    responses: [{ content: "ok", stopReason: "stop" }],
  });
  const app = createHonoApp(router, objectStore, controller, provider);
  return { app, objectStore, controller, provider };
}

function buildMockApp() {
  const store = new InMemoryObjectStore();
  const mockProvider = new MockProvider([
    { pattern: "", response: { content: "ok", stopReason: "stop" } },
  ]);
  const mockController = {} as ResearchController;
  return createHonoApp(
    { use: () => {} } as any,
    store,
    mockController,
    mockProvider
  );
}

/* ------------------------------------------------------------------ */
/*  1. APIRouter — raw router class                                   */
/* ------------------------------------------------------------------ */

describe("APIRouter", () => {
  it("handles GET route", () => {
    const router = new APIRouter();
    router.get("/items", (_req: APIRequest) => ({
      status: 200,
      body: { items: [] },
    }));
    const response = router.handle("GET", "/items", {});
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it("handles POST route", () => {
    const router = new APIRouter();
    router.post("/items", (req: APIRequest) => ({
      status: 201,
      body: { created: true, data: req.body },
    }));
    const response = router.handle("POST", "/items", { body: { name: "test" } });
    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ name: "test" });
  });

  it("returns 404 for unknown route", () => {
    const router = new APIRouter();
    const response = router.handle("GET", "/unknown", {});
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Not found");
  });
});

/* ------------------------------------------------------------------ */
/*  2. CRUD Endpoints — project / question lifecycle                   */
/* ------------------------------------------------------------------ */

describe("CRUD Endpoints", () => {
  let app: HonoApp;
  const mockProvider = new MockProvider([
    { pattern: "", response: { content: "ok", stopReason: "stop" } },
  ]);
  const mockController = {} as ResearchController;

  beforeEach(() => {
    const store = new InMemoryObjectStore();
    app = createHonoApp(
      { use: () => {} } as any,
      store,
      mockController,
      mockProvider
    );
  });

  it("GET /api/projects/:id returns existing project", async () => {
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });
    const created = (await createRes.json()) as Record<string, unknown>;
    const projectId = created.id as string;

    const getRes = await app.request(`/api/projects/${projectId}`);
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as Record<string, unknown>;
    expect(fetched.id).toBe(projectId);
    expect(fetched.name).toBe("Test Project");
    expect(fetched.status).toBe("ACTIVE");
  });

  it("GET /api/projects/:id returns 404 for unknown project", async () => {
    const getRes = await app.request(
      "/api/projects/00000000-0000-4000-a000-000000000001"
    );
    expect(getRes.status).toBe(404);
  });

  it("GET /api/projects lists all projects", async () => {
    await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Project A" }),
    });
    await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Project B" }),
    });

    const listRes = await app.request("/api/projects");
    expect(listRes.status).toBe(200);
    const projects = (await listRes.json()) as Record<string, unknown>[];
    expect(projects.length).toBe(2);
  });

  it("PUT /api/projects/:id updates project status", async () => {
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Update Test" }),
    });
    const created = (await createRes.json()) as Record<string, unknown>;
    const projectId = created.id as string;

    const updateRes = await app.request(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as Record<string, unknown>;
    expect(updated.status).toBe("ARCHIVED");
  });

  it("DELETE /api/projects/:id removes project", async () => {
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Delete Test" }),
    });
    const created = (await createRes.json()) as Record<string, unknown>;
    const projectId = created.id as string;

    const deleteRes = await app.request(`/api/projects/${projectId}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    const getRes = await app.request(`/api/projects/${projectId}`);
    expect(getRes.status).toBe(404);
  });

  it("GET /api/research/:objectId returns research object", async () => {
    const createRes = await app.request("/api/research/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Q", statement: "What is X?" }),
    });
    const created = (await createRes.json()) as Record<string, unknown>;
    const questionId = created.questionId as string;

    const getRes = await app.request(`/api/research/${questionId}`);
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as Record<string, unknown>;
    expect(fetched.questionId).toBe(questionId);
    expect(fetched.title).toBe("Test Q");
  });

  it("PUT /api/research/:objectId updates research object", async () => {
    const createRes = await app.request("/api/research/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Original", statement: "What is X?" }),
    });
    const created = (await createRes.json()) as Record<string, unknown>;
    const questionId = created.questionId as string;

    const updateRes = await app.request(`/api/research/${questionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as Record<string, unknown>;
    expect(updated.status).toBe("ACTIVE");
  });

  it("DELETE /api/research/:objectId removes research object", async () => {
    const createRes = await app.request("/api/research/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Delete Q", statement: "What is Y?" }),
    });
    const created = (await createRes.json()) as Record<string, unknown>;
    const questionId = created.questionId as string;

    const deleteRes = await app.request(`/api/research/${questionId}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    const getRes = await app.request(`/api/research/${questionId}`);
    expect(getRes.status).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  3. Agent Endpoints                                                 */
/* ------------------------------------------------------------------ */

describe("Agent Endpoints", () => {
  it("POST /api/agent/run returns completed with result", async () => {
    const { app } = buildFullApp();

    const res = await app.request("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Research quantum computing" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("completed");
    expect(body.prompt).toBe("Research quantum computing");
    expect(body).toHaveProperty("runId");
    expect(body).toHaveProperty("startedAt");
    expect(body).toHaveProperty("result");
  });

  it("POST /api/agent/run calls Provider (not hardcoded)", async () => {
    const { app, provider } = buildFullApp();

    const res = await app.request("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Research X" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("completed");
    expect(body.prompt).toBe("Research X");

    // Must have actually called the Provider, not returned a hardcoded response
    expect(provider.getCallCount()).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  4. Health & UI                                                     */
/* ------------------------------------------------------------------ */

describe("Health & UI", () => {
  let app: HonoApp;

  beforeAll(() => {
    const store = new InMemoryObjectStore();
    const mockProvider = new MockProvider([
      {
        pattern: "",
        response: { content: "Research result", stopReason: "stop" },
      },
    ]);
    const mockController = {} as ResearchController;
    app = createHonoApp(
      { use: () => {} } as any,
      store,
      mockController,
      mockProvider
    );
  });

  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("uptime");
  });

  it("GET / returns web interface", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("html");
    expect(body).toContain("PaperFactory");
  });

  it("GET / returns interactive research form", async () => {
    const res = await app.request("/");
    const body = await res.text();
    expect(body).toContain("research");
    expect(body).toContain("input");
    expect(body).toContain("button");
  });

  it("GET /ws returns 404", async () => {
    const res = await app.request("/ws");
    expect(res.status).toBe(404);
  });

  it("unknown route returns 404", async () => {
    const res = await app.request("/unknown");
    expect(res.status).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  5. UUID Validation                                                 */
/* ------------------------------------------------------------------ */

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("UUID Validation", () => {
  it("POST /api/projects creates real project with valid UUID", async () => {
    const { app, objectStore } = buildFullApp();

    const res = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.id).not.toBe("00000000-0000-4000-a000-000000000000");
    expect(body.id).toMatch(UUID_V4);
    expect(body.name).toBe("Test Project");
    expect(body.status).toBe("ACTIVE");
    expect(body).toHaveProperty("createdAt");

    // Must have been saved to objectStore
    const projects = await Effect.runPromise(objectStore.list("Project"));
    expect(projects.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/research/questions creates question with valid UUID", async () => {
    const { app, objectStore } = buildFullApp();

    const res = await app.request("/api/research/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "How does X work?",
        statement: "Investigate mechanism of X",
        domain: "Physics",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.questionId).not.toBe("00000000-0000-4000-a000-000000000000");
    expect(body.questionId).toMatch(UUID_V4);
    expect(body.title).toBe("How does X work?");
    expect(body.domain).toBe("Physics");
    expect(body.status).toBe("DRAFT");

    // Must have been saved to objectStore
    const questions = await Effect.runPromise(
      objectStore.list("ResearchQuestion")
    );
    expect(questions.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  6. Multiple Projects                                               */
/* ------------------------------------------------------------------ */

describe("Multiple Projects", () => {
  it("creates generate different UUIDs", async () => {
    const { app } = buildFullApp();

    const res1 = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Project A" }),
    });
    const body1 = await res1.json();

    const res2 = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Project B" }),
    });
    const body2 = await res2.json();

    expect(body1.id).not.toBe(body2.id);
  });
});
