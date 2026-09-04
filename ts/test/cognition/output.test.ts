import { describe, it, expect } from "vitest";
import { OutputValidator } from "@cognition/output";

describe("OutputValidator", () => {
  it("rejects hypothesis output missing falsificationCondition", () => {
    const result = OutputValidator.validate("PROPOSE_HYPOTHESIS", {
      statement: "X causes Y",
    });
    expect(result._tag).toBe("Fail");
  });

  it("accepts valid hypothesis output with falsificationCondition", () => {
    const result = OutputValidator.validate("PROPOSE_HYPOTHESIS", {
      statement: "X causes Y under Z conditions",
      falsificationCondition: "If Y does not occur when X is applied under Z",
    });
    expect(result._tag).toBe("Ok");
  });

  it("rejects hypothesis output with empty falsificationCondition", () => {
    const result = OutputValidator.validate("PROPOSE_HYPOTHESIS", {
      statement: "X causes Y",
      falsificationCondition: "",
    });
    expect(result._tag).toBe("Fail");
  });

  it("rejects hypothesis output with whitespace-only falsificationCondition", () => {
    const result = OutputValidator.validate("PROPOSE_HYPOTHESIS", {
      statement: "X causes Y",
      falsificationCondition: "   ",
    });
    expect(result._tag).toBe("Fail");
  });

  it("accepts valid evidence output", () => {
    const result = OutputValidator.validate("PROPOSE_EVIDENCE", {
      summary: "Evidence supporting hypothesis",
      direction: "SUPPORTING",
      strength: 0.8,
    });
    expect(result._tag).toBe("Ok");
  });

  it("rejects evidence output missing required fields", () => {
    const result = OutputValidator.validate("PROPOSE_EVIDENCE", {
      summary: "Evidence",
    });
    expect(result._tag).toBe("Fail");
  });

  it("returns error details on validation failure", () => {
    const result = OutputValidator.validate("PROPOSE_HYPOTHESIS", {
      statement: "X causes Y",
    });
    if (result._tag === "Fail") {
      expect(result.errors.length).toBeGreaterThan(0);
    } else {
      throw new Error("Expected validation to fail");
    }
  });

  it("accepts valid experiment output", () => {
    const result = OutputValidator.validate("DESIGN_STUDY", {
      description: "Test X under controlled conditions",
      steps: ["Apply X", "Measure Y"],
    });
    expect(result._tag).toBe("Ok");
  });

  it("rejects unknown action type", () => {
    const result = OutputValidator.validate("UNKNOWN_ACTION", {});
    expect(result._tag).toBe("Fail");
  });
});
