import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { Pipeline } from "../../../src/runtime/workflows/pipeline";

describe("Pipeline", () => {
  it("executes all phases in order", async () => {
    const pipeline = new Pipeline({
      phases: [
        {
          name: "extract",
          execute: () => Effect.succeed({ data: "raw" }),
        },
        {
          name: "transform",
          execute: (input) => Effect.succeed({ data: `processed_${input.data}` }),
        },
        {
          name: "load",
          execute: (input) => Effect.succeed({ data: input.data, loaded: true }),
        },
      ],
      allowPause: false,
    });

    const results = await Effect.runPromise(pipeline.execute());
    expect(results.length).toBe(3);
    expect(results[0].data).toBe("raw");
    expect(results[1].data).toBe("processed_raw");
    expect(results[2].loaded).toBe(true);
  });

  it("passes results between phases", async () => {
    const pipeline = new Pipeline({
      phases: [
        {
          name: "step1",
          execute: () => Effect.succeed({ value: 10 }),
        },
        {
          name: "step2",
          execute: (input) => Effect.succeed({ value: (input.value as number) * 2 }),
        },
      ],
      allowPause: false,
    });

    const results = await Effect.runPromise(pipeline.execute());
    expect(results[1].value).toBe(20);
  });

  it("handles phase dependencies", async () => {
    const pipeline = new Pipeline({
      phases: [
        {
          name: "setup",
          execute: () => Effect.succeed({ env: "prod", config: { timeout: 30 } }),
        },
        {
          name: "run",
          execute: (input) => Effect.succeed({ env: input.env, output: "done" }),
        },
      ],
      allowPause: true,
    });

    const results = await Effect.runPromise(pipeline.execute());
    expect(results[1].env).toBe("prod");
    expect(results[1].output).toBe("done");
  });
});
