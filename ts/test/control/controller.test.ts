import { describe, it, expect, beforeEach } from "vitest";
import { ResearchController } from "../../src/control/controller";
import { InMemoryObjectStore } from "../../src/persistence/object-store";
import { InMemoryEventStore } from "../../src/persistence/event-store";
import { createQuestion } from "@domain/objects/question";
import { createProtocol } from "@domain/objects/protocol";
import { createHypothesis } from "@domain/objects/hypothesis";
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

  it("runs gate evaluation for gated action and passes", async () => {
    // review_protocol requires gate: FROZEN gate PASSes for non-frozen protocol
    const p = createProtocol({ protocolId: "p1", status: "DRAFT" });
    await Effect.runPromise(objectStore.save(p));

    const result = await controller.execute({
      actionName: "review_protocol",
      objectId: "p1",
      objectType: "Protocol",
    });

    expect(result.success).toBe(true);
    expect(result.gateResults.length).toBeGreaterThan(0);
    expect(result.gateResults.every((r) => r.status !== "BLOCKED" && r.status !== "FAIL")).toBe(true);
  });

  it("blocks when a gate fails", async () => {
    // assess_hypothesis gates on EVIDENCE_SUFFICIENCY: no evidence → FAIL
    const h = createHypothesis({
      hypothesisId: "h1",
      status: "PROPOSED",
      supportingEvidenceIds: [],
    });
    await Effect.runPromise(objectStore.save(h));

    const result = await controller.execute({
      actionName: "assess_hypothesis",
      objectId: "h1",
      objectType: "Hypothesis",
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("Blocked by gate EVIDENCE_SUFFICIENCY");
  });

  it("fails transition when gates pass but state is not allowed", async () => {
    // activate_hypothesis requires ASSESSED; gates PASS with 2 evidence items
    const h = createHypothesis({
      hypothesisId: "h2",
      status: "PROPOSED",
      supportingEvidenceIds: ["e1", "e2"],
    });
    await Effect.runPromise(objectStore.save(h));

    const result = await controller.execute({
      actionName: "activate_hypothesis",
      objectId: "h2",
      objectType: "Hypothesis",
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain(
      "Cannot perform activate_hypothesis from state PROPOSED"
    );
  });
});
