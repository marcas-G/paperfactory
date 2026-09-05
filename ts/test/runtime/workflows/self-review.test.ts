import { describe, it, expect } from "vitest";
import { selfReview } from "../../../src/runtime/workflows/self-review";
import { MockProvider } from "../../../src/runtime/provider";

describe("selfReview", () => {
  it("passes when output has no issues", async () => {
    const provider = new MockProvider([{
      pattern: "",
      response: {
        content: JSON.stringify({ passed: true, issues: [], reasoning: "Output is sound" }),
        stopReason: "end_turn",
      },
    }]);
    const result = await selfReview(
      JSON.stringify({ hypotheses: [{ statement: "X causes Y" }] }),
      "hypothesis_generation",
      provider
    );
    expect(result.passed).toBe(true);
    expect(result.rounds).toBe(1);
  });

  it("catches fabricated citations", async () => {
    const provider = new MockProvider([{
      pattern: "",
      response: {
        content: JSON.stringify({
          passed: false,
          issues: [{ severity: "blocking", category: "fabrication", message: "URL does not match a real paper" }],
          reasoning: "Found fabricated citation",
        }),
        stopReason: "end_turn",
      },
    }]);
    const result = await selfReview(
      JSON.stringify({ keyFindings: [{ finding: "X", sourceTitle: "Fake Paper", sourceUrl: "http://fake.com" }] }),
      "literature_search",
      provider
    );
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
