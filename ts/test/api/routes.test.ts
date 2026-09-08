import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import * as Effect from "effect/Effect";
import { APIRouter, APIRequest, createHonoApp, HonoApp } from "@api/routes";
import { InMemoryObjectStore } from "@persistence/object-store";
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
  const provider = new DeterministicProvider({
    name: "test",
    responses: [{ content: "ok", stopReason: "stop" }],
  });
  const app = createHonoApp(objectStore, controller, provider);
  return { app, objectStore, controller, provider };
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

  it("GET / returns React SPA entry point", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("<div id=\"root\"");
  });

  it("GET known SPA routes returns index.html fallback", async () => {
    // React Router 客户端路由:后端仅对白名单路由回退 index.html
    for (const path of ["/projects", "/papers", "/research/abcd-1234"]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("<div id=\"root\"");
    }
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

/* ------------------------------------------------------------------ */
/*  7. Papers API                                                      */
/* ------------------------------------------------------------------ */

describe("Papers API", () => {
  let app: HonoApp;
  let objectStore: InMemoryObjectStore;

  const mockProvider = new MockProvider([
    { pattern: "", response: { content: "ok", stopReason: "stop" } },
  ]);
  const mockController = {} as ResearchController;

  beforeEach(() => {
    objectStore = new InMemoryObjectStore();
    app = createHonoApp(
      objectStore,
      mockController,
      mockProvider
    );
  });

  it("GET /api/projects/:id/papers returns citations as Paper objects", async () => {
    const projectRes = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    const project = (await projectRes.json()) as Record<string, unknown>;
    const projectId = project.id as string;

    await Effect.runPromise(objectStore.save({
      citationId: "cit-1",
      projectId,
      sourceTitle: "Paper One",
      sourceAuthors: ["Author A"],
      sourceYear: 2024,
      abstract: "Abstract one",
      sourceUrl: "https://example.com/1",
      relevanceScore: 0.9,
      localPdfPath: null,
      metadata: { citationCount: 10 },
      createdAt: new Date(),
    }));

    const res = await app.request(`/api/projects/${projectId}/papers`);
    expect(res.status).toBe(200);
    const papers = (await res.json()) as Record<string, unknown>[];
    expect(papers.length).toBe(1);
    expect(papers[0].citationId).toBe("cit-1");
    expect(papers[0].sourceTitle).toBe("Paper One");
    expect(papers[0].sourceAuthors).toEqual(["Author A"]);
    expect(papers[0].sourceYear).toBe(2024);
    expect(papers[0].abstract).toBe("Abstract one");
    expect(papers[0].sourceUrl).toBe("https://example.com/1");
    expect(papers[0].citationCount).toBe(10);
    expect(papers[0].relevanceScore).toBe(0.9);
    expect(papers[0].localPdfPath).toBeNull();
    expect(papers[0].pdfDownloadStatus).toBe("pending");
    expect(papers[0]).toHaveProperty("createdAt");
  });

  it("GET /api/projects/:id/papers sorted by createdAt desc", async () => {
    const projectRes = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    const project = (await projectRes.json()) as Record<string, unknown>;
    const projectId = project.id as string;

    await Effect.runPromise(objectStore.save({
      citationId: "cit-old",
      projectId,
      sourceTitle: "Old Paper",
      sourceAuthors: [],
      sourceYear: 2020,
      abstract: "",
      sourceUrl: "",
      relevanceScore: 0.5,
      localPdfPath: null,
      metadata: {},
      createdAt: new Date("2024-01-01"),
    }));
    await Effect.runPromise(objectStore.save({
      citationId: "cit-new",
      projectId,
      sourceTitle: "New Paper",
      sourceAuthors: [],
      sourceYear: 2024,
      abstract: "",
      sourceUrl: "",
      relevanceScore: 0.9,
      localPdfPath: null,
      metadata: {},
      createdAt: new Date("2024-12-01"),
    }));

    const res = await app.request(`/api/projects/${projectId}/papers`);
    const papers = (await res.json()) as Record<string, unknown>[];
    expect(papers.length).toBe(2);
    expect(papers[0].citationId).toBe("cit-new");
    expect(papers[1].citationId).toBe("cit-old");
  });

  it("GET /api/projects/:id/papers returns empty for project with no citations", async () => {
    const projectRes = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Empty" }),
    });
    const project = (await projectRes.json()) as Record<string, unknown>;
    const projectId = project.id as string;

    const res = await app.request(`/api/projects/${projectId}/papers`);
    expect(res.status).toBe(200);
    const papers = (await res.json()) as Record<string, unknown>[];
    expect(papers.length).toBe(0);
  });

  it("GET /api/papers/:citationId returns single citation", async () => {
    await Effect.runPromise(objectStore.save({
      citationId: "cit-single",
      projectId: "proj-1",
      sourceTitle: "Single Paper",
      sourceAuthors: ["Author B"],
      sourceYear: 2023,
      abstract: "Single abstract",
      sourceUrl: "https://example.com/single",
      relevanceScore: 0.85,
      localPdfPath: null,
      metadata: { citationCount: 5 },
      createdAt: new Date(),
    }));

    const res = await app.request("/api/papers/cit-single");
    expect(res.status).toBe(200);
    const paper = (await res.json()) as Record<string, unknown>;
    expect(paper.citationId).toBe("cit-single");
    expect(paper.sourceTitle).toBe("Single Paper");
    expect(paper.sourceAuthors).toEqual(["Author B"]);
    expect(paper.citationCount).toBe(5);
    expect(paper.relevanceScore).toBe(0.85);
    expect(paper.pdfDownloadStatus).toBe("pending");
  });

  it("GET /api/papers/:citationId returns 404 for unknown citation", async () => {
    const res = await app.request("/api/papers/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("POST /api/papers/:citationId/download-pdf returns ok with pdfPath", async () => {
    await Effect.runPromise(objectStore.save({
      citationId: "cit-pdf",
      projectId: "proj-1",
      sourceTitle: "PDF Paper",
      sourceAuthors: [],
      sourceYear: 2024,
      abstract: "",
      sourceUrl: "",
      relevanceScore: 0.7,
      localPdfPath: null,
      metadata: {},
      createdAt: new Date(),
    }));

    const res = await app.request("/api/papers/cit-pdf/download-pdf", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.pdfPath).toBeDefined();
    expect(typeof body.pdfPath).toBe("string");

    const opt = await Effect.runPromise(objectStore.get("cit-pdf", "Citation"));
    expect(opt.isSome()).toBe(true);
    const saved = opt.value as Record<string, unknown>;
    expect(saved.localPdfPath).toBe(body.pdfPath);
  });

  it("POST /api/papers/:citationId/download-pdf uses openAccessPdf URL when available", async () => {
    await Effect.runPromise(objectStore.save({
      citationId: "cit-oa",
      projectId: "proj-1",
      sourceTitle: "Open Access Paper",
      sourceAuthors: [],
      sourceYear: 2024,
      abstract: "",
      sourceUrl: "",
      relevanceScore: 0.8,
      localPdfPath: null,
      metadata: { openAccessPdf: { url: "https://arxiv.org/pdf/2401.12345.pdf" } },
      createdAt: new Date(),
    }));

    const res = await app.request("/api/papers/cit-oa/download-pdf", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect((body.pdfPath as string).includes("2401.12345")).toBe(true);
  });

  it("POST /api/papers/:citationId/download-pdf returns 404 for unknown citation", async () => {
    const res = await app.request("/api/papers/nonexistent/download-pdf", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toEqual({ code: "NOT_FOUND", message: "Citation not found" });
  });
});

/* ------------------------------------------------------------------ */
/*  8. Phase Versions API                                              */
/* ------------------------------------------------------------------ */

describe("Phase Versions API", () => {
  let app: HonoApp;
  let objectStore: InMemoryObjectStore;

  const mockProvider = new MockProvider([
    { pattern: "", response: { content: "ok", stopReason: "stop" } },
  ]);
  const mockController = {} as ResearchController;

  beforeEach(() => {
    objectStore = new InMemoryObjectStore();
    app = createHonoApp(
      objectStore,
      mockController,
      mockProvider
    );
  });

  it("GET /api/projects/:id/phases/:phaseName/versions returns sorted versions", async () => {
    await Effect.runPromise(objectStore.save({
      phaseRunId: "run-1",
      projectId: "proj-1",
      phaseName: "literature_review",
      phaseVersion: 1,
      status: "COMPLETED",
      artifacts: {},
      agentOutput: "Output v1",
      toolCalls: [],
      selfReview: null,
      active: false,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    }));
    await Effect.runPromise(objectStore.save({
      phaseRunId: "run-2",
      projectId: "proj-1",
      phaseName: "literature_review",
      phaseVersion: 2,
      status: "COMPLETED",
      artifacts: { citationIds: ["cit-1"] },
      agentOutput: "Output v2 updated",
      toolCalls: [{ name: "search" }],
      selfReview: { passed: true, rounds: 1, issues: [] },
      active: true,
      createdAt: new Date("2024-01-02"),
      updatedAt: new Date("2024-01-02"),
    }));
    await Effect.runPromise(objectStore.save({
      phaseRunId: "run-3",
      projectId: "proj-1",
      phaseName: "hypothesis_generation",
      phaseVersion: 1,
      status: "PENDING",
      artifacts: {},
      agentOutput: null,
      toolCalls: [],
      selfReview: null,
      active: false,
      createdAt: new Date("2024-01-03"),
      updatedAt: new Date("2024-01-03"),
    }));

    const res = await app.request("/api/projects/proj-1/phases/literature_review/versions");
    expect(res.status).toBe(200);
    const versions = (await res.json()) as Record<string, unknown>[];
    expect(versions.length).toBe(2);
    expect(versions[0].phaseVersion).toBe(1);
    expect(versions[1].phaseVersion).toBe(2);
    expect(versions[0].phaseRunId).toBe("run-1");
    expect(versions[1].phaseRunId).toBe("run-2");
    expect((versions[1].selfReview as { passed: boolean } | null)?.passed).toBe(true);
    expect((versions[1].toolCalls as unknown[]).length).toBe(1);
  });

  it("GET /api/projects/:id/phases/:phaseName/versions returns empty for unknown phase", async () => {
    const res = await app.request("/api/projects/proj-1/phases/unknown_phase/versions");
    expect(res.status).toBe(200);
    const versions = (await res.json()) as Record<string, unknown>[];
    expect(versions.length).toBe(0);
  });

  it("GET /api/projects/:id/phases/:phaseName/compare returns diff", async () => {
    await Effect.runPromise(objectStore.save({
      phaseRunId: "run-a",
      projectId: "proj-1",
      phaseName: "literature_review",
      phaseVersion: 1,
      status: "COMPLETED",
      artifacts: {},
      agentOutput: "Line 1\nLine 2\nLine 3",
      toolCalls: [],
      selfReview: null,
      active: false,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    }));
    await Effect.runPromise(objectStore.save({
      phaseRunId: "run-b",
      projectId: "proj-1",
      phaseName: "literature_review",
      phaseVersion: 2,
      status: "COMPLETED",
      artifacts: {},
      agentOutput: "Line 1\nModified Line 2\nLine 3\nNew Line 4",
      toolCalls: [{ name: "search" }],
      selfReview: { passed: true, rounds: 2, issues: [] },
      active: true,
      createdAt: new Date("2024-01-02"),
      updatedAt: new Date("2024-01-02"),
    }));

    const res = await app.request("/api/projects/proj-1/phases/literature_review/compare");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const versions = body.versions as Record<string, unknown>[];
    expect(versions.length).toBe(2);
    expect(versions[0].runId).toBe("run-a");
    expect(versions[1].runId).toBe("run-b");

    const diff = body.diff as Array<{ field: string; changes: Array<{ from: string; to: string }> }>;
    expect(diff.length).toBe(1);
    expect(diff[0].changes.length).toBe(2);
    expect(diff[0].changes[0].from).toBe("Line 2");
    expect(diff[0].changes[0].to).toBe("Modified Line 2");
    expect(diff[0].changes[1].to).toBe("New Line 4");
  });

  it("GET /api/projects/:id/phases/:phaseName/compare filters by runIds", async () => {
    await Effect.runPromise(objectStore.save({
      phaseRunId: "run-x",
      projectId: "proj-1",
      phaseName: "hypothesis_generation",
      phaseVersion: 1,
      status: "COMPLETED",
      artifacts: {},
      agentOutput: "Output X",
      toolCalls: [],
      selfReview: null,
      active: false,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    }));
    await Effect.runPromise(objectStore.save({
      phaseRunId: "run-y",
      projectId: "proj-1",
      phaseName: "hypothesis_generation",
      phaseVersion: 2,
      status: "COMPLETED",
      artifacts: {},
      agentOutput: "Output Y",
      toolCalls: [],
      selfReview: null,
      active: true,
      createdAt: new Date("2024-01-02"),
      updatedAt: new Date("2024-01-02"),
    }));

    const res = await app.request("/api/projects/proj-1/phases/hypothesis_generation/compare?runIds=run-y");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const versions = body.versions as Record<string, unknown>[];
    expect(versions.length).toBe(1);
    expect(versions[0].runId).toBe("run-y");
  });

  it("GET /api/projects/:id/phases/:phaseName/compare includes toolCalls and selfReview", async () => {
    await Effect.runPromise(objectStore.save({
      phaseRunId: "run-detail",
      projectId: "proj-1",
      phaseName: "hypothesis_generation",
      phaseVersion: 1,
      status: "COMPLETED",
      artifacts: {},
      agentOutput: "Detail output",
      toolCalls: [{ name: "search", input: { q: "test" } }],
      selfReview: { passed: true, rounds: 3, issues: [{ severity: "warning", category: "style", message: "Minor" }] },
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const res = await app.request("/api/projects/proj-1/phases/hypothesis_generation/compare");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const versions = body.versions as Record<string, unknown>[];
    expect((versions[0].toolCalls as unknown[]).length).toBe(1);
    expect(versions[0].selfReview).not.toBeNull();
    expect((versions[0].selfReview as { passed: boolean } | null)?.passed).toBe(true);
    expect((versions[0].selfReview as { rounds: number } | null)?.rounds).toBe(3);
  });
});
