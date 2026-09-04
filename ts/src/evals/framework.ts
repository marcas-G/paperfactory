export interface EvalScenario {
  name: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  scorer: (output: Record<string, unknown>) => EvalScore;
}

export interface EvalScore {
  score: number;
  details: string;
}

export interface EvalReport {
  scenario: string;
  score: number;
  details: string;
  passed: boolean;
}

export interface EvalFramework {
  addScenario(scenario: EvalScenario): void;
  run(scenarios?: ReadonlyArray<EvalScenario>): ReadonlyArray<EvalReport>;
  getReport(): ReadonlyArray<EvalReport>;
}

export class DefaultEvalFramework implements EvalFramework {
  private scenarios: EvalScenario[] = [];
  private reports: EvalReport[] = [];

  addScenario(scenario: EvalScenario): void {
    this.scenarios.push(scenario);
  }

  run(scenarios?: ReadonlyArray<EvalScenario>): ReadonlyArray<EvalReport> {
    const toRun = scenarios ?? this.scenarios;
    this.reports = toRun.map((scenario) => {
      const output = scenario.input;
      const score = scenario.scorer(output);
      return {
        scenario: scenario.name,
        score: score.score,
        details: score.details,
        passed: score.score >= 0.8,
      };
    });
    return [...this.reports];
  }

  getReport(): ReadonlyArray<EvalReport> {
    return [...this.reports];
  }
}
