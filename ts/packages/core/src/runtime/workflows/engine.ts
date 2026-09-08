import * as Effect from "effect/Effect";

export interface WorkflowPhase {
  name: string;
  execute: (input: Record<string, unknown>) => Effect.Effect<Record<string, unknown>, string>;
}

export interface WorkflowState {
  status: "running" | "paused" | "completed" | "failed";
  phaseIndex: number;
  phaseResults: ReadonlyArray<Record<string, unknown>>;
  error?: string;
}

export interface WorkflowPause {
  phaseName: string;
  data: Record<string, unknown>;
}

export async function runWorkflow(
  phases: ReadonlyArray<WorkflowPhase>,
  initialInput: Record<string, unknown> = {}
): Promise<WorkflowState> {
  const engine = new WorkflowEngine(phases, initialInput);

  let state = engine.getState();
  while (state.status === "running") {
    try {
      state = await Effect.runPromise(engine.executeNext());
    } catch (e) {
      engine.fail(String(e));
      state = engine.getState();
      break;
    }
  }
  return state;
}

export class WorkflowEngine {
  private phases: ReadonlyArray<WorkflowPhase>;
  private state: WorkflowState;
  private mutableResults: Array<Record<string, unknown>>;

  constructor(phases: ReadonlyArray<WorkflowPhase>, initialInput?: Record<string, unknown>) {
    this.phases = phases;
    this.mutableResults = initialInput ? [initialInput] : [];
    this.state = { status: "running", phaseIndex: 0, phaseResults: [] };
  }

  fail(errorMessage: string): void {
    this.state.status = "failed";
    this.state.error = errorMessage;
  }

  getState(): WorkflowState {
    this.state.phaseResults = [...this.mutableResults];
    return { ...this.state };
  }

  executeNext(): Effect.Effect<WorkflowState, string> {
    if (this.state.status !== "running") {
      return Effect.succeed({ ...this.state });
    }

    if (this.state.phaseIndex >= this.phases.length) {
      this.state.status = "completed";
      return Effect.succeed({ ...this.state });
    }

    const phase = this.phases[this.state.phaseIndex];
    return Effect.flatMap(
      phase.execute(
        this.mutableResults[this.mutableResults.length - 1] ?? {}
      ),
      (result) =>
        Effect.sync(() => {
          this.mutableResults.push(result);
          this.state.phaseIndex++;
          if (this.state.phaseIndex >= this.phases.length) {
            this.state.status = "completed";
          }
          this.state.phaseResults = [...this.mutableResults];
          return { ...this.state };
        })
    );
  }

  pause(): Effect.Effect<WorkflowPause, never> {
    return Effect.sync(() => {
      this.state.status = "paused";
      return {
        phaseName: this.phases[this.state.phaseIndex]?.name ?? "",
        data:
          this.mutableResults[this.mutableResults.length - 1] ?? {},
      };
    });
  }

  resume(): Effect.Effect<WorkflowState, string> {
    return Effect.sync(() => {
      if (this.state.status !== "paused") {
        return { ...this.state };
      }
      this.state.status = "running";
      return { ...this.state };
    }).pipe(Effect.flatMap(() => this.executeNext()));
  }
}
