import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createExecutionBlock } from "../../../src/runtime/blocks/execution-block";
import { BlockExecutor } from "../../../src/runtime/blocks/executor";

describe("ExecutionBlock", () => {
  it("executes block with steps successfully on first try", async () => {
    const block = createExecutionBlock(
      "test_block",
      "Test",
      [
        {
          type: "TOOL_CALL",
          name: "step1",
          execute: (ctx) => Effect.succeed({ ...ctx, data: { ...ctx.data, step1: true } }),
        },
        {
          type: "VALIDATE",
          name: "validate",
          execute: (ctx) => Effect.succeed({ ...ctx, data: { ...ctx.data, validated: true } }),
        },
      ],
      (input) => Effect.succeed({ data: input, metadata: {} }),
      (ctx) => ctx.data.step1 === true && ctx.data.validated === true,
      (_error, ctx) => Effect.succeed(ctx)
    );

    const executor = new BlockExecutor();
    const result = await Effect.runPromise(executor.execute(block, { query: "test" }));

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.context.data.step1).toBe(true);
    expect(result.context.data.validated).toBe(true);
  });

  it("passes on retry after validation failure", async () => {
    let attempts = 0;
    const block = createExecutionBlock(
      "retry_block",
      "Retry",
      [
        {
          type: "TOOL_CALL",
          name: "step1",
          execute: (ctx) => {
            attempts++;
            return Effect.succeed({
              ...ctx,
              data: { ...ctx.data, attempt: attempts, success: attempts >= 2 },
            });
          },
        },
      ],
      (input) => Effect.succeed({ data: input, metadata: {} }),
      (ctx) => ctx.data.success === true,
      (_error, ctx) => Effect.succeed(ctx)
    );

    const executor = new BlockExecutor(5);
    const result = await Effect.runPromise(executor.execute(block, { query: "test" }));

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(2);
  });

  it("fails after max iterations", async () => {
    const block = createExecutionBlock(
      "fail_block",
      "Always fail",
      [
        {
          type: "TOOL_CALL",
          name: "step1",
          execute: (ctx) => Effect.succeed({ ...ctx, data: { ...ctx.data, fail: true } }),
        },
      ],
      (input) => Effect.succeed({ data: input, metadata: {} }),
      (_ctx) => false,
      (_error, ctx) => Effect.succeed(ctx)
    );

    const executor = new BlockExecutor(3);
    const result = await Effect.runPromise(executor.execute(block, { query: "test" }));

    expect(result.success).toBe(false);
    expect(result.iterations).toBe(3);
    expect(result.error).toContain("Max iterations");
  });
});
