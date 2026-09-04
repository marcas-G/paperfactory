import * as Effect from "effect/Effect";
import { WorkflowPhase } from "../workflows/engine";

export interface ParallelConfig {
  branches: ReadonlyArray<WorkflowPhase>;
  aggregator: (results: ReadonlyArray<Record<string, unknown>>) => Record<string, unknown>;
}

export class ParallelWorkflow {
  private branches: ReadonlyArray<WorkflowPhase>;
  private aggregator: (results: ReadonlyArray<Record<string, unknown>>) => Record<string, unknown>;

  constructor(config: ParallelConfig) {
    this.branches = config.branches;
    this.aggregator = config.aggregator;
  }

  execute(input: Record<string, unknown>): Effect.Effect<Record<string, unknown>, string> {
    const effects = this.branches.map((branch) => branch.execute(input));
    return Effect.all(effects, { concurrency: "unbounded" }).pipe(
      Effect.map((results) => this.aggregator(results))
    );
  }

  executeSequential(input: Record<string, unknown>): Effect.Effect<ReadonlyArray<Record<string, unknown>>, string> {
    const effects = this.branches.map((branch) => branch.execute(input));
    return Effect.all(effects, { concurrency: 1 });
  }
}
