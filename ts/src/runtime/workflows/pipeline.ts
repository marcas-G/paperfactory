import * as Effect from "effect/Effect";
import { WorkflowPhase } from "./engine";

export interface PipelineConfig {
  phases: ReadonlyArray<WorkflowPhase>;
  allowPause: boolean;
}

export class Pipeline {
  private phases: ReadonlyArray<WorkflowPhase>;
  private allowPause: boolean;

  constructor(config: PipelineConfig) {
    this.phases = config.phases;
    this.allowPause = config.allowPause;
  }

  execute(): Effect.Effect<ReadonlyArray<Record<string, unknown>>, string> {
    const phases = this.phases;
    return Effect.gen(function* () {
      const results: Array<Record<string, unknown>> = [];
      let input: Record<string, unknown> = {};
      for (const phase of phases) {
        const result = yield* phase.execute(input);
        results.push(result);
        input = result;
      }
      return results as ReadonlyArray<Record<string, unknown>>;
    });
  }
}
