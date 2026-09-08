import { describe, it, expect } from "vitest";
import { chainOfVerification } from "@pf/core/runtime/workflows/cove";
import { Provider } from "@pf/core/runtime/provider";
import { ToolRegistry } from "@pf/core/runtime/tools/registry";
import * as Effect from "effect/Effect";

/*
 * SequenceProvider tracks call index and returns responses in order.
 * This avoids the pattern-matching collision issue in MockProvider
 * where extraction and verification prompts share the same claim text.
 */
class SequenceProvider implements Provider {
  constructor(
    private responses: Array<{
      content: string;
      toolCalls?: any[];
      stopReason: string;
    }> = []
  ) {}

  private idx = 0;

  sendMessages(
    _messages: ReadonlyArray<{ role: string; content: string }>,
    _options?: any
  ): Effect.Effect<any, string> {
    const resp = this.responses[this.idx % this.responses.length];
    this.idx++;
    return Effect.succeed({
      content: resp.content,
      toolCalls: resp.toolCalls,
      stopReason: resp.stopReason,
    });
  }

  streamResponse(
    _messages: ReadonlyArray<{ role: string; content: string }>,
    _options?: any
  ): Effect.Effect<any, string> {
    return Effect.fail("not implemented");
  }

  get callCount(): number {
    return this.idx;
  }
}

describe("chainOfVerification", () => {
  it("returns no issues when no claims are extracted", async () => {
    const provider = new SequenceProvider([
      {
        content: "[]",
        stopReason: "end_turn",
      },
    ]);

    const result = await chainOfVerification(
      "This is just a summary with no factual claims.",
      "report_generation",
      provider
    );

    expect(result.issues).toEqual([]);
    expect(result.revisedOutput).toBeNull();
  });

  it("verifies claims and returns VERIFIED status", async () => {
    // Call 1: extract claims
    // Call 2: verify claim 1
    const provider = new SequenceProvider([
      {
        content: JSON.stringify(["The treatment reduced symptoms by 40%"]),
        stopReason: "end_turn",
      },
      {
        content: JSON.stringify({
          status: "VERIFIED",
          reason: "Supported by study data in context",
          important: true,
        }),
        stopReason: "end_turn",
      },
    ]);

    const result = await chainOfVerification(
      "The treatment reduced symptoms by 40% according to the trial.",
      "evidence_assessment",
      provider,
      "Study showed 40% reduction (p<0.01)"
    );

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].status).toBe("VERIFIED");
    expect(result.revisedOutput).toBeNull();
  });

  it("marks CONTRADICTED claims", async () => {
    const provider = new SequenceProvider([
      {
        content: JSON.stringify(["Drug X causes liver damage"]),
        stopReason: "end_turn",
      },
      {
        content: JSON.stringify({
          status: "CONTRADICTED",
          reason: "Context shows Drug X has no liver toxicity",
          important: true,
        }),
        stopReason: "end_turn",
      },
    ]);

    const result = await chainOfVerification(
      "Drug X causes liver damage in 30% of patients.",
      "evidence_assessment",
      provider,
      "Safety profile: Drug X has no known liver toxicity."
    );

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].status).toBe("CONTRADICTED");
    expect(result.revisedOutput).toContain("[CONTRADICTED:");
  });

  it("handles UNVERIFIED_IMPORTANT claims without search tool", async () => {
    const provider = new SequenceProvider([
      {
        content: JSON.stringify(["Gene Y is associated with cancer"]),
        stopReason: "end_turn",
      },
      {
        content: JSON.stringify({
          status: "NOT_VERIFIED",
          reason: "Not enough context to verify",
          important: true,
        }),
        stopReason: "end_turn",
      },
    ]);

    const result = await chainOfVerification(
      "Gene Y is associated with cancer risk.",
      "literature_search",
      provider,
      "Some general context about genetics."
    );

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].status).toBe("UNVERIFIED_IMPORTANT");
    expect(result.revisedOutput).toContain("未验证");
  });

  it("removes UNIMPORTANT unverifiable claims", async () => {
    const provider = new SequenceProvider([
      {
        content: JSON.stringify(["The study was conducted in 2023"]),
        stopReason: "end_turn",
      },
      {
        content: JSON.stringify({
          status: "NOT_VERIFIED",
          reason: "Date not in context but minor detail",
          important: false,
        }),
        stopReason: "end_turn",
      },
    ]);

    const result = await chainOfVerification(
      "The study was conducted in 2023 and showed significant results.",
      "report_generation",
      provider,
      "Results were significant."
    );

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].status).toBe("REMOVED_UNIMPORTANT");
  });

  it("attempts search verification when tool registry has search", async () => {
    const mockSearchTool = {
      name: "search",
      execute: () =>
        Effect.succeed({
          content: JSON.stringify({ results: [{ title: "Gene Y Cancer Study", snippet: "Gene Y significantly associated with cancer risk" }] }),
        }),
    };

    const registry = new ToolRegistry();
    registry.register(mockSearchTool as any, {
      name: "search",
      description: "Search tool",
      schema: {},
      writeOnly: false,
    });

    // Call 1: extract claims
    // Call 2: verify claim -> NOT_VERIFIED
    // Call 3: search verify
    const provider = new SequenceProvider([
      {
        content: JSON.stringify(["Gene Y is associated with cancer"]),
        stopReason: "end_turn",
      },
      {
        content: JSON.stringify({
          status: "NOT_VERIFIED",
          reason: "Not in local context",
          important: true,
        }),
        stopReason: "end_turn",
      },
      {
        content: JSON.stringify({
          verified: true,
          reason: "Search results confirm the association",
        }),
        stopReason: "end_turn",
      },
    ]);

    const result = await chainOfVerification(
      "Gene Y is associated with cancer risk.",
      "literature_search",
      provider,
      "Local context about genetics.",
      registry
    );

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].status).toBe("VERIFIED_BY_SEARCH");
  });

  it("handles multiple claims in sequence", async () => {
    // Call 1: extract claims (returns 2 claims)
    // Call 2: verify claim 1
    // Call 3: verify claim 2
    const provider = new SequenceProvider([
      {
        content: JSON.stringify([
          "Method A outperforms Method B",
          "Sample size was 1000",
        ]),
        stopReason: "end_turn",
      },
      {
        content: JSON.stringify({
          status: "VERIFIED",
          reason: "Context supports this",
          important: true,
        }),
        stopReason: "end_turn",
      },
      {
        content: JSON.stringify({
          status: "VERIFIED",
          reason: "Context confirms n=1000",
          important: true,
        }),
        stopReason: "end_turn",
      },
    ]);

    const result = await chainOfVerification(
      "Method A outperforms Method B. Sample size was 1000.",
      "experiment_design",
      provider,
      "Comparison: A > B, n=1000"
    );

    expect(result.issues.length).toBe(2);
    expect(result.issues[0].status).toBe("VERIFIED");
    expect(result.issues[1].status).toBe("VERIFIED");
  });

  it("proves real LLM calls were made (not stub)", async () => {
    const provider = new SequenceProvider([
      {
        content: JSON.stringify(["X is Y"]),
        stopReason: "end_turn",
      },
      {
        content: JSON.stringify({
          status: "VERIFIED",
          reason: "Yes",
          important: true,
        }),
        stopReason: "end_turn",
      },
    ]);

    const result = await chainOfVerification(
      "X is Y according to the study.",
      "hypothesis_generation",
      provider,
      "X=Y confirmed."
    );

    expect(provider.callCount).toBeGreaterThanOrEqual(2);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0].status).toBe("VERIFIED");
  });
});
