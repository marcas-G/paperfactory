import { describe, it, expect, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import { TransitionEngine } from "../../src/control/engine";

describe("TransitionEngine", () => {
  let engine: TransitionEngine;

  beforeEach(() => {
    engine = new TransitionEngine();
  });

  it("valid transition succeeds", async () => {
    const result = await Effect.runPromise(
      engine.validateTransition({
        actionName: "activate_question",
        currentObjectState: { status: "DRAFT", title: "Q1" },
        gateResults: [],
      })
    );
    expect(result.success).toBe(true);
    expect(result.newState?.status).toBe("ACTIVE");
  });

  it("invalid state transition rejected", async () => {
    const result = await Effect.runPromise(
      engine.validateTransition({
        actionName: "activate_question",
        currentObjectState: { status: "ARCHIVED" },
        gateResults: [],
      })
    );
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("Cannot perform");
  });

  it("unknown action rejected", async () => {
    const result = await Effect.runPromise(
      engine.validateTransition({
        actionName: "nonexistent_action",
        currentObjectState: { status: "DRAFT" },
        gateResults: [],
      })
    );
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("Unknown action");
  });

  it("failing gate blocks transition", async () => {
    const result = await Effect.runPromise(
      engine.validateTransition({
        actionName: "activate_question",
        currentObjectState: { status: "DRAFT" },
        gateResults: [
          { name: "TEST_GATE", status: "FAIL", reason: "test failure" },
        ],
      })
    );
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("FAIL");
  });

  it("blocked gate blocks transition", async () => {
    const result = await Effect.runPromise(
      engine.validateTransition({
        actionName: "freeze_protocol",
        currentObjectState: { status: "REVIEWED" },
        gateResults: [
          { name: "FROZEN_PROTOCOL", status: "BLOCKED", reason: "already frozen" },
        ],
      })
    );
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain("BLOCKED");
  });

  it("passing gate allows transition", async () => {
    const result = await Effect.runPromise(
      engine.validateTransition({
        actionName: "activate_question",
        currentObjectState: { status: "DRAFT" },
        gateResults: [
          { name: "TEST_GATE", status: "PASS", reason: "all good" },
        ],
      })
    );
    expect(result.success).toBe(true);
  });

  it("preserves existing state fields", async () => {
    const result = await Effect.runPromise(
      engine.validateTransition({
        actionName: "activate_question",
        currentObjectState: { status: "DRAFT", title: "My Question", extra: "data" },
        gateResults: [],
      })
    );
    expect(result.newState?.title).toBe("My Question");
    expect(result.newState?.extra).toBe("data");
    expect(result.newState?.status).toBe("ACTIVE");
  });
});
