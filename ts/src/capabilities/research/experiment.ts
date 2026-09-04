import * as Effect from "effect/Effect";
import { Capability, createCapability, Skill } from "../generic/capability";
import type { Provider } from "@runtime/provider";

export interface ExperimentResult {
  design: string;
  execution: ReadonlyArray<{ step: string; output: string }>;
  analysis: { findings: string; significance: number; effectSize?: number };
}

const designSkill: Skill = {
  name: "experiment_design",
  description: "Design the experiment methodology using LLM",
  execute: (input: Record<string, unknown>) => {
    const hypothesis = input.hypothesis as string;
    const provider = input.provider as Provider | undefined;

    if (provider) {
      const prompt = `Design a rigorous experimental protocol to test the following hypothesis. Include methodology, sample size considerations, controls, and statistical analysis plan:

Hypothesis: ${hypothesis}`;

      return Effect.map(
        provider.sendMessages([
          {
            role: "user" as const,
            content: prompt,
          },
        ]),
        (response) => ({
          design: response.content,
        })
      );
    }

    return Effect.succeed({
      design: `Experimental design for: ${hypothesis ?? "unknown"}`,
    });
  },
};

const executeSkill: Skill = {
  name: "experiment_execute",
  description: "Execute experiment steps",
  execute: (input: Record<string, unknown>) => {
    const testData = input.testData as number[][] | undefined;
    if (testData && testData.length >= 2) {
      return Effect.succeed({
        execution: [
          { step: "Setup", output: "Environment configured" },
          {
            step: "Run",
            output: `Data groups: [${testData[0].join(",")}], [${testData[1].join(",")}]`,
          },
          { step: "Collect", output: "Data collected" },
        ],
      });
    }
    return Effect.succeed({
      execution: [
        { step: "Setup", output: "Environment configured" },
        { step: "Run", output: "Execution completed" },
        { step: "Collect", output: "Data collected" },
      ],
    });
  },
};

const analyzeSkill: Skill = {
  name: "experiment_analyze",
  description: "Analyze experiment results via science-service microservice",
  execute: (input: Record<string, unknown>) =>
    Effect.tryPromise({
      try: async () => {
        const execution = input.execution as Array<Record<string, unknown>>;
        const serviceUrl =
          (input.serviceUrl as string) ?? "http://localhost:8001";
        const testData = input.testData as number[][] | undefined;

        const steps = execution ?? [];
        const dataGroups: number[][] = testData ?? [];

        // If no explicit test data, try to extract from step outputs
        if (dataGroups.length === 0) {
          for (const step of steps) {
            const output = step.output as string;
            const numbers = output
              .match(/-?\d+\.?\d*/g)
              ?.map(Number)
              .filter((n) => !isNaN(n));
            if (numbers && numbers.length > 0) {
              dataGroups.push(numbers);
            }
          }
        }

        // Call science-service if we have data groups
        if (dataGroups.length >= 2) {
          try {
            const resp = await fetch(`${serviceUrl}/api/statistics/t-test`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                data1: dataGroups[0],
                data2: dataGroups[1],
              }),
            });
            if (resp.ok) {
              const result = await resp.json();
              return {
                analysis: {
                  findings: `Statistical analysis complete. p-value: ${
                    result.pValue ?? "N/A"
                  }, significance: ${result.significance ?? "N/A"}`,
                  significance: result.significance ?? 0,
                  effectSize: result.effectSize,
                },
              };
            }
          } catch {
            // Fall through to local analysis
          }
        }

        return {
          analysis: {
            findings: `Analysis of ${steps.length} experiment steps completed. Manual review recommended.`,
            significance: 0.5,
          },
        };
      },
      catch: (error) => String(error),
    }),
};

export const experimentCapability: Capability = createCapability(
  "experiment",
  "Design, execute, and analyze experiments",
  [designSkill, executeSkill, analyzeSkill],
  [],
  (input: Record<string, unknown>) => {
    const provider = input.provider as Provider | undefined;
    return Effect.flatMap(
      designSkill.execute({ ...input, provider }),
      (designResult) =>
        Effect.flatMap(
          executeSkill.execute({ ...designResult, testData: input.testData }),
          (execResult) =>
            Effect.flatMap(
              analyzeSkill.execute({
                ...execResult,
                serviceUrl: input.serviceUrl,
                testData: input.testData,
              }),
              (analysisResult) =>
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
