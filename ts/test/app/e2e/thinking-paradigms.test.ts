import { describe, it, expect } from "vitest";
import { runAgentLoop } from "@pf/core/runtime/agent/loop";
import { beamSearch } from "@pf/core/runtime/workflows/tot-engine";
import { sampleConsensus } from "@pf/core/runtime/workflows/self-consistency";
import { debate } from "@pf/core/runtime/workflows/debate";
import { chainOfVerification } from "@pf/core/runtime/workflows/cove";
import { createDeterministicProvider } from "@pf/core/runtime/provider-deterministic";
import { ToolRegistry } from "@pf/core/runtime/tools/registry";

describe("E2E: Thinking Paradigms Integration", () => {
  it("ReAct loop produces thinking events", async () => {
    const provider = createDeterministicProvider({
      name: "react-thinking-events",
      responses: [
        {
          content: "Based on the analysis, the key finding is X.",
          stopReason: "end_turn",
        },
      ],
    });

    const capturedEvents: Array<{ type: string; content: string }> = [];
    const result = await runAgentLoop(
      provider,
      new ToolRegistry(),
      [{ role: "user", content: "Analyze the research question about X" }],
      {
        maxIterations: 5,
        onEvent: (e) => capturedEvents.push({ type: e.type, content: e.content }),
      }
    );

    const thinkingEvents = capturedEvents.filter((e) => e.type === "thinking");
    expect(thinkingEvents.length).toBeGreaterThanOrEqual(1);
    expect(result.finalContent).toContain("key finding");
    expect(provider.getCallCount()).toBe(1);
  });

  it("ToT explores multiple paths in hypothesis generation", async () => {
    const provider = createDeterministicProvider({
      name: "tot-multi-path",
      responses: [
        {
          content:
            "H1: Neural attention improves efficiency---H2: Transformers scale better---H3: CNNs remain competitive",
          stopReason: "stop",
        },
        {
          content:
            '[{"feasibility":9,"novelty":8,"relevance":9},{"feasibility":7,"novelty":9,"relevance":7},{"feasibility":8,"novelty":7,"relevance":8}]',
          stopReason: "stop",
        },
        {
          content: "H1a: Multi-head attention---H1b: Cross-attention",
          stopReason: "stop",
        },
        {
          content:
            '[{"feasibility":9,"novelty":9,"relevance":9},{"feasibility":8,"novelty":8,"relevance":8}]',
          stopReason: "stop",
        },
        {
          content: "H2a: Linear scaling---H2b: Logarithmic scaling",
          stopReason: "stop",
        },
        {
          content:
            '[{"feasibility":7,"novelty":8,"relevance":7},{"feasibility":7,"novelty":7,"relevance":8}]',
          stopReason: "stop",
        },
        {
          content: "H3a: Residual CNNs---H3b: Hybrid CNN-Transformer",
          stopReason: "stop",
        },
        {
          content:
            '[{"feasibility":8,"novelty":9,"relevance":7},{"feasibility":8,"novelty":8,"relevance":7}]',
          stopReason: "stop",
        },
      ],
    });

    const result = await beamSearch(
      "What are the best approaches for NLP?",
      provider,
      { beamWidth: 3, depth: 2 }
    );

    expect(result.exploredCount).toBeGreaterThan(3);
    expect(result.bestPath.length).toBeGreaterThanOrEqual(2);
    expect(result.bestPath[0].thought).toContain("What are the best approaches for NLP?");
    expect(result.bestPath[1].thought.length).toBeGreaterThan(0);
    expect(provider.getCallCount()).toBeGreaterThan(1);
  });

  it("Self-Consistency used for evidence scoring", async () => {
    const provider = createDeterministicProvider({
      name: "self-consistency-scoring",
      responses: Array.from({ length: 7 }, (_, i) => ({
        content: `Relevance: ${8 + (i % 3)}, Reliability: ${7 + (i % 2)}, Impact: ${9 - (i % 3)}`,
        stopReason: "stop",
      })),
    });

    const result = await sampleConsensus(
      "Rate this evidence on relevance, reliability, and impact (1-10 each):\nStrong correlation between X and Y found in 3 independent studies.",
      provider,
      { samples: 7, temperature: 0.7 }
    );

    expect(result.paths.length).toBe(7);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.distribution.size).toBeGreaterThanOrEqual(1);
    expect(result.answer.length).toBeGreaterThan(0);
    expect(provider.getCallCount()).toBe(7);
  });

  it("Debate conducted for hypothesis evaluation", async () => {
    const provider = createDeterministicProvider({
      name: "debate-hypothesis",
      responses: [
        { content: "Pro: The evidence strongly supports X causes Y through mechanism A.", stopReason: "stop" },
        { content: "Con: The correlation does not imply causation; confounding variables exist.", stopReason: "stop" },
        { content: "Judge: The pro side presents stronger evidence. Confidence: 0.8", stopReason: "stop" },
        { content: "Pro: Additional studies confirm the causal link with controlled experiments.", stopReason: "stop" },
        { content: "Con: Sample sizes are too small and methodology has flaws.", stopReason: "stop" },
        { content: "Judge: Both sides have merit, but pro has more evidence. Confidence: 0.75", stopReason: "stop" },
        { content: "Pro: Meta-analysis of 50 studies confirms the effect.", stopReason: "stop" },
        { content: "Con: Publication bias inflates the meta-analysis results.", stopReason: "stop" },
        { content: "Judge: The weight of evidence favors the hypothesis. Confidence: 0.85", stopReason: "stop" },
      ],
    });

    const result = await debate(
      "Does X cause Y?",
      ["Study 1 shows correlation 0.7", "Study 2 shows causation in controlled setting"],
      provider,
      { rounds: 3 }
    );

    expect(result.debates.length).toBe(3);
    expect(result.debates[0].pro).toContain("Pro");
    expect(result.debates[0].con).toContain("Con");
    expect(result.confidence).toBe(0.85);
    expect(result.conclusion.length).toBeGreaterThan(0);
    expect(provider.getCallCount()).toBe(9);
  });

  it("CoVe verification catches unsupported claims", async () => {
    const provider = createDeterministicProvider({
      name: "cove-verification",
      responses: [
        {
          content: '["The treatment reduced mortality by 50%", "Study had 1000 participants", "Results were published in Nature"]',
          stopReason: "stop",
        },
        {
          content: '{"status": "CONTRADICTED", "reason": "Available data shows only 20% reduction", "important": true}',
          stopReason: "stop",
        },
        {
          content: '{"status": "VERIFIED", "reason": "Study size confirmed in methodology section", "important": true}',
          stopReason: "stop",
        },
        {
          content: '{"status": "NOT_VERIFIED", "reason": "No publication venue mentioned in evidence", "important": false}',
          stopReason: "stop",
        },
      ],
    });

    const output =
      "The treatment reduced mortality by 50%. Study had 1000 participants. Results were published in Nature.";
    const context =
      "Study methodology: 1000 participants randomized. Results: 20% mortality reduction. No journal mentioned.";

    const result = await chainOfVerification(
      output,
      "evidence_assessment",
      provider,
      context,
      new ToolRegistry()
    );

    expect(result.issues.length).toBe(3);
    const contradicted = result.issues.find((i) => i.status === "CONTRADICTED");
    expect(contradicted).toBeDefined();
    expect(contradicted?.claim).toContain("mortality by 50%");
    const verified = result.issues.find((i) => i.status === "VERIFIED");
    expect(verified).toBeDefined();
    expect(verified?.claim).toContain("1000 participants");
    expect(result.revisedOutput).not.toBeNull();
    expect(result.revisedOutput).toContain("[CONTRADICTED:");
    expect(provider.getCallCount()).toBe(4);
  });
});
