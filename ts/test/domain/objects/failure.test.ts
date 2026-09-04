import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { ResearchFailure, createResearchFailure } from "../../../src/domain/objects/failure";

const anotherUUID = "11111111-1111-4111-a111-111111111111";

describe("ResearchFailure Schema", () => {
  const decode = Schema.decodeSync(ResearchFailure);
  const base = createResearchFailure();

  it("accepts valid failure", () => {
    const f = decode(base);
    expect(f.failedHypothesisId).toBeNull();
    expect(f.evidence).toBe("");
    expect(f.reusableLesson).toBe("");
    expect(f.retryCondition).toBe("");
    expect(f.createdAt).toBeInstanceOf(Date);
  });

  it("requires non-empty root cause", () => {
    expect(() => decode({ ...base, rootCause: "" })).toThrow();
  });

  it("accepts all failure types", () => {
    for (const type of ["SCIENTIFIC", "METHODOLOGICAL", "TECHNICAL", "RESOURCE"]) {
      expect(decode({ ...base, failureType: type }).failureType).toBe(type);
    }
  });

  it("validates failure type enum", () => {
    expect(() => decode({ ...base, failureType: "INVALID" })).toThrow();
  });

  it("accepts hypothesis reference", () => {
    const f = decode({ ...base, failedHypothesisId: anotherUUID });
    expect(f.failedHypothesisId).toBe(anotherUUID);
  });

  it("accepts reusable lesson and retry condition", () => {
    const f = decode({
      ...base,
      evidence: "Data shows X",
      reusableLesson: "Control for Z",
      retryCondition: "When controls available",
    });
    expect(f.evidence).toBe("Data shows X");
    expect(f.reusableLesson).toBe("Control for Z");
    expect(f.retryCondition).toBe("When controls available");
  });

  it("factory with override", () => {
    const f = createResearchFailure({ failureType: "TECHNICAL" });
    expect(f.failureType).toBe("TECHNICAL");
  });
});
