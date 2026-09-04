import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { experimentCapability, ExperimentResult } from "@capabilities/research/experiment";

describe("Experiment Capability", () => {
  it("runs full experiment pipeline", async () => {
    const result = await Effect.runPromise(
      experimentCapability.execute({ hypothesis: "X causes Y" })
    ) as unknown as ExperimentResult;

    expect(result.design).toContain("X causes Y");
    expect(Array.isArray(result.execution)).toBe(true);
    expect(result.execution.length).toBe(3);
    expect(result.analysis.findings).toBeTruthy();
    expect(result.analysis.significance).toBeCloseTo(0.85);
  });

  it("has correct skills", () => {
    expect(experimentCapability.skills).toHaveLength(3);
    expect(experimentCapability.skills[0].name).toBe("experiment_design");
    expect(experimentCapability.skills[1].name).toBe("experiment_execute");
    expect(experimentCapability.skills[2].name).toBe("experiment_analyze");
  });

  it("design skill produces output", async () => {
    const result = await Effect.runPromise(
      experimentCapability.skills[0].execute({ hypothesis: "test" })
    );
    expect(result.design).toContain("test");
  });

  it("execution skill produces steps", async () => {
    const result = await Effect.runPromise(
      experimentCapability.skills[1].execute({})
    );
    expect(result.execution).toHaveLength(3);
  });

  it("analysis skill produces findings", async () => {
    const result = await Effect.runPromise(
      experimentCapability.skills[2].execute({ execution: [{}, {}, {}] })
    ) as unknown as { analysis: { findings: string; significance: number } };
    expect(result.analysis.significance).toBeGreaterThan(0);
  });
});
