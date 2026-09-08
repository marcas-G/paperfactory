import { describe, it, expect } from "vitest";
import { DefaultEvalFramework } from "@pf/core/evals/framework";

describe("Eval Framework", () => {
  it("adds and runs scenario", () => {
    const framework = new DefaultEvalFramework();
    framework.addScenario({
      name: "accuracy_test",
      input: { output: 0.95, expected: 0.95 },
      expected: { output: 0.95 },
      scorer: (output: Record<string, unknown>) => ({
        score: output.output as number,
        details: "Accuracy check",
      }),
    });

    const reports = framework.run();
    expect(reports.length).toBe(1);
    expect(reports[0].score).toBe(0.95);
    expect(reports[0].passed).toBe(true);
  });

  it("marks failed scenarios", () => {
    const framework = new DefaultEvalFramework();
    framework.addScenario({
      name: "low_score",
      input: { value: 0.5 },
      expected: { value: 0.9 },
      scorer: (output: Record<string, unknown>) => ({
        score: output.value as number,
        details: "Score too low",
      }),
    });

    const reports = framework.run();
    expect(reports[0].passed).toBe(false);
    expect(reports[0].score).toBe(0.5);
  });

  it("runs inline scenarios", () => {
    const framework = new DefaultEvalFramework();

    const reports = framework.run([
      {
        name: "inline_test",
        input: { result: "pass" },
        expected: { result: "pass" },
        scorer: (_output: Record<string, unknown>) => ({ score: 1.0, details: "Passed" }),
      },
    ]);

    expect(reports.length).toBe(1);
    expect(reports[0].score).toBe(1.0);
  });

  it("generates report", () => {
    const framework = new DefaultEvalFramework();
    framework.addScenario({
      name: "s1",
      input: {},
      expected: {},
      scorer: () => ({ score: 0.9, details: "Good" }),
    });
    framework.run();

    const report = framework.getReport();
    expect(report.length).toBe(1);
    expect(report[0].scenario).toBe("s1");
  });

  it("handles multiple scenarios", () => {
    const framework = new DefaultEvalFramework();
    framework.addScenario({
      name: "test1",
      input: { val: 0.9 },
      expected: {},
      scorer: (o: Record<string, unknown>) => ({ score: o.val as number, details: "t1" }),
    });
    framework.addScenario({
      name: "test2",
      input: { val: 0.7 },
      expected: {},
      scorer: (o: Record<string, unknown>) => ({ score: o.val as number, details: "t2" }),
    });

    const reports = framework.run();
    expect(reports.length).toBe(2);
    expect(reports[0].passed).toBe(true);
    expect(reports[1].passed).toBe(false);
  });
});
