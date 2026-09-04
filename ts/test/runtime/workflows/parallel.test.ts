import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { ParallelWorkflow } from "../../../src/runtime/workflows/parallel";

describe("ParallelWorkflow", () => {
  it("executes branches concurrently", async () => {
    const workflow = new ParallelWorkflow({
      branches: [
        {
          name: "branch1",
          execute: () => Effect.succeed({ branch: 1, data: "A" }),
        },
        {
          name: "branch2",
          execute: () => Effect.succeed({ branch: 2, data: "B" }),
        },
        {
          name: "branch3",
          execute: () => Effect.succeed({ branch: 3, data: "C" }),
        },
      ],
      aggregator: (results) => ({
        combined: results.map((r) => r.data),
        count: results.length,
      }),
    });

    const result = await Effect.runPromise(workflow.execute({}));
    expect(result.count).toBe(3);
    expect(result.combined).toEqual(["A", "B", "C"]);
  });

  it("aggregates results", async () => {
    const workflow = new ParallelWorkflow({
      branches: [
        {
          name: "sum1",
          execute: () => Effect.succeed({ value: 10 }),
        },
        {
          name: "sum2",
          execute: () => Effect.succeed({ value: 20 }),
        },
      ],
      aggregator: (results) => ({
        total: results.reduce((sum, r) => sum + (r.value as number), 0),
      }),
    });

    const result = await Effect.runPromise(workflow.execute({}));
    expect(result.total).toBe(30);
  });

  it("executes sequentially when requested", async () => {
    const workflow = new ParallelWorkflow({
      branches: [
        {
          name: "s1",
          execute: () => Effect.succeed({ order: 1 }),
        },
        {
          name: "s2",
          execute: () => Effect.succeed({ order: 2 }),
        },
      ],
      aggregator: (results) => ({ results }),
    });

    const results = await Effect.runPromise(
      workflow.executeSequential({})
    );
    expect(results.length).toBe(2);
    expect(results[0].order).toBe(1);
    expect(results[1].order).toBe(2);
  });
});
