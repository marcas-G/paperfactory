import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import * as Effect from "effect/Effect";
import { ObjectStore } from "@persistence/object-store";
import { InMemoryObjectStore } from "@persistence/object-store";
import { ResearchController } from "@control/controller";
import { MockProvider } from "@runtime/provider";
import { createHonoApp, HonoApp } from "@api/routes";

describe("API CRUD Endpoints", () => {
  let app: HonoApp;
  let store: ObjectStore;
  const mockProvider = new MockProvider([
    { pattern: "", response: { content: "ok", stopReason: "stop" } },
  ]);
  const mockController = {} as ResearchController;

  beforeEach(async () => {
    store = new InMemoryObjectStore();
    app = createHonoApp({ use: () => {} } as any, store, mockController, mockProvider);
  });

  it("GET /api/projects/:id returns existing project", async () => {
    // Create a project first
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });
    const created = (await createRes.json()) as Record<string, unknown>;
    const projectId = created.id as string;

    // GET it back
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
    // Create two projects
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

    // Verify it's gone
    const getRes = await app.request(`/api/projects/${projectId}`);
    expect(getRes.status).toBe(404);
  });

  it("GET /api/research/:objectId returns research object", async () => {
    // Create a question first
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
