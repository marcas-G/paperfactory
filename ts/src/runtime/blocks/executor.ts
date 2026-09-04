import * as Effect from "effect/Effect";
import { ExecutionBlock, BlockContext } from "./execution-block";

export interface BlockExecutionResult {
  success: boolean;
  context: BlockContext;
  iterations: number;
  error?: string;
}

export class BlockExecutor {
  constructor(readonly maxIterations: number = 5) {}

  execute(block: ExecutionBlock, input: Record<string, unknown>): Effect.Effect<BlockExecutionResult, never> {
    return Effect.sync(() => {
      let context: BlockContext = { data: input, metadata: {} };
      let iterations = 0;

      while (iterations < this.maxIterations) {
        iterations++;

        // Run entry point
        const entryEffect = block.entryPoint(input);
        const entryResult = Effect.runSync(entryEffect);
        if (entryResult) {
          context = entryResult as BlockContext;
        }

        // Run steps
        let _error: string | undefined;
        for (const step of block.steps) {
          const stepResult = Effect.runSync(step.execute(context));
          if (stepResult) {
            context = stepResult as BlockContext;
          }
        }

        // Check success condition
        if (block.successCondition(context)) {
          return {
            success: true,
            context,
            iterations,
          };
        }

        // Try failure handler for fix loop
        if (iterations < this.maxIterations) {
          const fixResult = Effect.runSync(block.failureHandler("Validation failed", context));
          context = fixResult as BlockContext;
        }
      }

      return {
        success: false,
        context,
        iterations,
        error: `Max iterations (${this.maxIterations}) reached`,
      };
    });
  }
}
