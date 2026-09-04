import { describe, it, expect, beforeEach } from "vitest";
import { ResearchController } from "../../src/control/controller";
import { InMemoryObjectStore } from "../../src/persistence/object-store";
import { InMemoryEventStore } from "../../src/persistence/event-store";
import { createQuestion } from "@domain/objects/question";
import * as Effect from "effect/Effect";

describe("ResearchController", () => {
  let controller: ResearchController;
  let objectStore: InMemoryObjectStore;
  let eventStore: InMemoryEventStore;

  beforeEach(async () => {
    objectStore = new InMemoryObjectStore();
    eventStore = new InMemoryEventStore();
    controller = new ResearchController(objectStore, eventStore);
  });

  it("executes valid transition", async () => {
    const q = createQuestion({ questionId: "q1", status: "DRAFT" });
    await Effect.runPromise(objectStore.save(q));

    const result = await controller.execute({
      actionName: "scope_question",
      objectId: "q1",
      objectType: "ResearchQuestion",
    });

    expect(result.success).toBe(true);
    expect(result.action?.name).toBe("scope_question");
    expect(result.event).toBeDefined();
    expect(result.event?.type).toBe("STATE_TRANSITION");
  });

  it("rejects unknown action", async () => {
    const result = await controller.execute({
      actionName: "unknown_action",
      objectId: "q1",
      objectType: "ResearchQuestion",
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("Unknown action");
  });

  it("rejects object not found", async () => {
    const result = await controller.execute({
      actionName: "scope_question",
      objectId: "nonexistent",
      objectType: "ResearchQuestion",
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("not found");
  });

  it("emits event on successful transition", async () => {
    const q = createQuestion({ questionId: "q1", status: "DRAFT" });
    await Effect.runPromise(objectStore.save(q));

    await controller.execute({
      actionName: "scope_question",
      objectId: "q1",
      objectType: "ResearchQuestion",
    });

    const events = await Effect.runPromise(eventStore.getAll());
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("STATE_TRANSITION");
    expect(events[0].objectId).toBe("q1");
  });

  it("scores candidates", async () => {
    const q = createQuestion({ questionId: "q1", status: "DRAFT" });
    await Effect.runPromise(objectStore.save(q));

    const result = await controller.execute({
      actionName: "scope_question",
      objectId: "q1",
      objectType: "ResearchQuestion",
    });

    expect(result.scores.length).toBeGreaterThan(0);
  });
});
