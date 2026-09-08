import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import {
  ResearchFailure,
  createResearchFailure,
} from "../../../src/domain/objects/failure";

const HYP_ID = "dddddddd-dddd-4ddd-dddd-dddddddddddd";

describe("ResearchFailure Schema", () => {
  const decode = Schema.decodeSync(ResearchFailure);
  const base = createResearchFailure({ failedHypothesisId: HYP_ID });

  it("accepts a valid failure with SCIENTIFIC default", () => {
    // Constitution §26: Runtime Failure ≠ Scientific Failure;
    // design §4.4: Hypothesis (REJECTED) → ResearchFailure
    const f = decode(base);
    expect(f.failureType).toBe("SCIENTIFIC");
    expect(f.failedHypothesisId).toBe(HYP_ID);
    expect(f.metadata).toEqual({});
  });

  it("requires non-empty rootCause", () => {
    // persistence DDL: root_cause TEXT NOT NULL
    expect(() => decode({ ...base, rootCause: "" })).toThrow();
  });

  it("accepts RUNTIME and SCIENTIFIC failure types", () => {
    for (const failureType of ["RUNTIME", "SCIENTIFIC"]) {
      expect(decode({ ...base, failureType }).failureType).toBe(failureType);
    }
  });

  it("rejects unknown failure types", () => {
    expect(() => decode({ ...base, failureType: "MAYBE" })).toThrow();
  });

  it("allows null failedHypothesisId and optional lessons", () => {
    // Design §4.3 fields: failedHypothesisId / failureType / rootCause /
    // evidence / reusableLesson / retryCondition
    const f = decode({
      ...createResearchFailure(),
      evidence: "Experiment produced null result",
      reusableLesson: "Check statistical power first",
      retryCondition: "If sample size doubles",
    });
    expect(f.failedHypothesisId).toBeNull();
    expect(f.evidence).toBe("Experiment produced null result");
    expect(f.reusableLesson).toBe("Check statistical power first");
    expect(f.retryCondition).toBe("If sample size doubles");
  });

  it("honours overrides (not hard-coded)", () => {
    const f = decode(
      createResearchFailure({ failureType: "RUNTIME", rootCause: "OOM" })
    );
    expect(f.failureType).toBe("RUNTIME");
    expect(f.rootCause).toBe("OOM");
  });
});
