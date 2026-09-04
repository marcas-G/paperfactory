import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createHonoApp, APIRouter } from "@api/routes";
import { InMemoryObjectStore } from "@persistence/object-store";
import { DeterministicProvider } from "@runtime/provider-deterministic";
import { ResearchController } from "@control/controller";
import { InMemoryEventStore } from "@persistence/event-store";
import { TransitionEngine } from "@control/engine";
import { ActionRegistry } from "@control/registry";

describe("API Integration - Real Endpoints", () => {
  it("POST /api/projects creates real project with valid UUID", async () => {
    const objectStore = new InMemoryObjectStore();
    const router = new APIRouter();
    const provider = new DeterministicProvider({
      name: "test",
      responses: [{ content: "ok", stopReason: "stop" }],
    });
    const eventStore = new InMemoryEventStore();
    const transitionEngine = new TransitionEngine();
    const actionRegistry = new ActionRegistry();
    const controller = new ResearchController(
      objectStore,
      eventStore,
      transitionEngine,
      actionRegistry
    );

    const app = createHonoApp(router, objectStore, controller, provider);

    const res = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    // Must NOT be the hardcoded UUID
    expect(body.id).not.toBe("00000000-0000-4000-a000-000000000000");
    // Must be a valid UUID v4 pattern
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(body.name).toBe("Test Project");
    expect(body.status).toBe("created");
    expect(body).toHaveProperty("createdAt");

    // Must have been saved to objectStore
    const projects = await Effect.runPromise(objectStore.list("Project"));
    expect(projects.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/research/questions creates question via Controller", async () => {
    const objectStore = new InMemoryObjectStore();
    const router = new APIRouter();
    const provider = new DeterministicProvider({
      name: "test",
      responses: [{ content: "ok", stopReason: "stop" }],
    });
    const eventStore = new InMemoryEventStore();
    const transitionEngine = new TransitionEngine();
    const actionRegistry = new ActionRegistry();
    const controller = new ResearchController(
      objectStore,
      eventStore,
      transitionEngine,
      actionRegistry
    );

    const app = createHonoApp(router, objectStore, controller, provider);

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

    // Must NOT be hardcoded UUID
    expect(body.questionId).not.toBe("00000000-0000-4000-a000-000000000000");
    expect(body.questionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(body.title).toBe("How does X work?");
    expect(body.domain).toBe("Physics");
    expect(body.status).toBe("DRAFT");

    // Must have been saved to objectStore
    const questions = await Effect.runPromise(objectStore.list("ResearchQuestion"));
    expect(questions.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/agent/run calls Agent Loop (not hardcoded)", async () => {
    const objectStore = new InMemoryObjectStore();
    const router = new APIRouter();
    const provider = new DeterministicProvider({
      name: "agent-test",
      responses: [{ content: "Research analysis complete", stopReason: "stop" }],
    });
    const eventStore = new InMemoryEventStore();
    const transitionEngine = new TransitionEngine();
    const actionRegistry = new ActionRegistry();
    const controller = new ResearchController(
      objectStore,
      eventStore,
      transitionEngine,
      actionRegistry
    );

    const app = createHonoApp(router, objectStore, controller, provider);

    const res = await app.request("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Research X" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.status).toBe("started");
    expect(body.prompt).toBe("Research X");
    expect(body).toHaveProperty("runId");
    expect(body).toHaveProperty("startedAt");

    // Must have called Provider (not hardcoded response)
    expect(provider.getCallCount()).toBeGreaterThan(0);
  });

  it("Multiple project creates generate different UUIDs", async () => {
    const objectStore = new InMemoryObjectStore();
    const router = new APIRouter();
    const provider = new DeterministicProvider({
      name: "test",
      responses: [{ content: "ok", stopReason: "stop" }],
    });
    const eventStore = new InMemoryEventStore();
    const transitionEngine = new TransitionEngine();
    const actionRegistry = new ActionRegistry();
    const controller = new ResearchController(
      objectStore,
      eventStore,
      transitionEngine,
      actionRegistry
    );

    const app = createHonoApp(router, objectStore, controller, provider);

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
