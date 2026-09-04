import { describe, it, expect } from "vitest";
import { createHonoApp, APIRouter } from "@api/routes";
import { MockProvider } from "@runtime/provider";
import { InMemoryObjectStore } from "@persistence/object-store";
import { InMemoryEventStore } from "@persistence/event-store";
import { ResearchController } from "@control/controller";
import { TransitionEngine } from "@control/engine";
import { ActionRegistry } from "@control/registry";

describe("Hono API Routes", () => {
  const router = new APIRouter();
  const mockProvider = new MockProvider();
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
  const app = createHonoApp(router, objectStore, controller, mockProvider);

  it("health endpoint returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("uptime");
  });

  it("creates a project", async () => {
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Project" }),
    });

    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.name).toBe("My Project");
    expect(body.status).toBe("created");
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("createdAt");
  });

  it("creates a research question", async () => {
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
    expect(body.title).toBe("How does X work?");
    expect(body.status).toBe("DRAFT");
    expect(body.domain).toBe("Physics");
  });

  it("triggers agent run", async () => {
    const res = await app.request("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Research quantum computing" }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("started");
    expect(body.prompt).toBe("Research quantum computing");
    expect(body).toHaveProperty("runId");
    expect(body).toHaveProperty("startedAt");
  });

  it("websocket endpoint returns info", async () => {
    const res = await app.request("/ws");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.message).toBe("WebSocket endpoint");
  });

  it("unknown route returns 404", async () => {
    const res = await app.request("/unknown");
    expect(res.status).toBe(404);
  });
});
