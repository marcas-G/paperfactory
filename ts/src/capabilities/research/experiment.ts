import * as Effect from "effect/Effect";
import { Capability, createCapability, Skill } from "../generic/capability";

export interface ExperimentResult {
  design: string;
  execution: ReadonlyArray<{ step: string; output: string }>;
  analysis: { findings: string; significance: number };
}

const designSkill: Skill = {
  name: "experiment_design",
  description: "Design the experiment methodology",
  execute: (_input: Record<string, unknown>) =>
    Effect.succeed({
      design: `Experimental design for: ${_input.hypothesis ?? "unknown"}`,
    }),
};

const executeSkill: Skill = {
  name: "experiment_execute",
  description: "Execute experiment steps",
  execute: (_input: Record<string, unknown>) =>
    Effect.succeed({
      execution: [
        { step: "Setup", output: "Environment configured" },
        { step: "Run", output: "Execution completed" },
        { step: "Collect", output: "Data collected" },
      ],
    }),
};

const analyzeSkill: Skill = {
  name: "experiment_analyze",
  description: "Analyze experiment results",
  execute: (_input: Record<string, unknown>) =>
    Effect.succeed({
      analysis: {
        findings: `Analysis of ${(_input.execution as Array<Record<string, unknown>>)?.length ?? 0} steps`,
        significance: 0.85,
      },
    }),
};

export const experimentCapability: Capability = createCapability(
  "experiment",
  "Design, execute, and analyze experiments",
  [designSkill, executeSkill, analyzeSkill],
  [],
  (input: Record<string, unknown>) => {
    return Effect.flatMap(designSkill.execute(input), (designResult) =>
      Effect.flatMap(executeSkill.execute(designResult), (execResult) =>
        Effect.flatMap(analyzeSkill.execute(execResult), (analysisResult) =>
          Effect.succeed({
            design: designResult.design,
            execution: execResult.execution,
            analysis: analysisResult.analysis,
          })
        )
      )
    );
  }
);
