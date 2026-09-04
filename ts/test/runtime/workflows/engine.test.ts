import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { WorkflowEngine } from "../../../src/runtime/workflows/engine";

describe("WorkflowEngine", () => {
  it("executes sequential pipeline", async () => {
    const engine = new WorkflowEngine([
      {
        name: "phase1",
        execute: () => Effect.succeed({ step: 1 }),
      },
      {
        name: "phase2",
        execute: (input) => Effect.succeed({ step: 2, prev: input.step }),
      },
      {
        name: "phase3",
        execute: (input) => Effect.succeed({ step: 3, prev: input.step }),
      },
    ]);

    await Effect.runPromise(engine.executeNext());
    await Effect.runPromise(engine.executeNext());
    await Effect.runPromise(engine.executeNext());

    const state = engine.getState();
    expect(state.status).toBe("completed");
    expect(state.phaseResults.length).toBe(3);
    expect(state.phaseResults[0].step).toBe(1);
    expect(state.phaseResults[1].step).toBe(2);
  });

  it("pauses and resumes workflow", async () => {
    const engine = new WorkflowEngine([
      {
        name: "phase1",
        execute: () => Effect.succeed({ step: 1 }),
      },
      {
        name: "phase2",
        execute: () => Effect.succeed({ step: 2 }),
      },
    ]);

    await Effect.runPromise(engine.executeNext());
    const pause = await Effect.runPromise(engine.pause());
    expect(pause.phaseName).toBe("phase2");

    const resumed = await Effect.runPromise(engine.resume());
    expect(resumed.status).toBe("completed");
  });

  it("handles completed workflow", async () => {
    const engine = new WorkflowEngine([
      {
        name: "phase1",
        execute: () => Effect.succeed({ done: true }),
      },
    ]);

    await Effect.runPromise(engine.executeNext());
    const state = engine.getState();
    expect(state.status).toBe("completed");

    const final = await Effect.runPromise(engine.executeNext());
    expect(final.status).toBe("completed");
  });
});
