import { describe, it, expect } from "vitest";
import { beamSearch } from "@runtime/workflows/tot-engine";
import { createDeterministicProvider } from "@runtime/provider-deterministic";

describe("Tree of Thoughts Engine", () => {
  it("generates multiple candidate thoughts and selects best", async () => {
    /*
      beamSearch(depth=2, beamWidth=3) makes:
      - depth 0: 1 generate call (from root), 1 evaluate call
      - depth 1: 3 generate calls (one per beam node), 3 evaluate calls
      Total: 8 calls minimum
    */
    const provider = createDeterministicProvider({
      name: "tot-beam-search",
      responses: [
        /* depth 0: generate */
        {
          content:
            "Thought A: Study attention patterns in transformers---Thought B: Analyze layer normalization effects---Thought C: Explore positional encoding alternatives",
          stopReason: "stop",
        },
        /* depth 0: evaluate */
        {
          content:
            '[{"feasibility": 8, "novelty": 7, "relevance": 9}, {"feasibility": 6, "novelty": 9, "relevance": 7}, {"feasibility": 7, "novelty": 6, "relevance": 8}]',
          stopReason: "stop",
        },
        /* depth 1: generate for node 0 (best avg: A=8.0) */
        {
          content:
            "A1: Quantify attention head specialization---A2: Measure cross-layer attention transfer---A3: Map attention to linguistic features",
          stopReason: "stop",
        },
        /* depth 1: evaluate for node 0 */
        {
          content:
            '[{"feasibility": 9, "novelty": 8, "relevance": 9}, {"feasibility": 7, "novelty": 7, "relevance": 8}, {"feasibility": 8, "novelty": 9, "relevance": 7}]',
          stopReason: "stop",
        },
        /* depth 1: generate for node 1 */
        {
          content:
            "C1: Compare rotary vs absolute positioning---C2: Learn positional embeddings---C3: Hybrid position encoding",
          stopReason: "stop",
        },
        /* depth 1: evaluate for node 1 */
        {
          content:
            '[{"feasibility": 7, "novelty": 8, "relevance": 7}, {"feasibility": 8, "novelty": 5, "relevance": 8}, {"feasibility": 6, "novelty": 7, "relevance": 9}]',
          stopReason: "stop",
        },
        /* depth 1: generate for node 2 */
        {
          content:
            "B1: Study residual stream dynamics---B2: Analyze norm scaling---B3: Explore adaptive normalization",
          stopReason: "stop",
        },
        /* depth 1: evaluate for node 2 */
        {
          content:
            '[{"feasibility": 8, "novelty": 6, "relevance": 6}, {"feasibility": 5, "novelty": 8, "relevance": 5}, {"feasibility": 7, "novelty": 7, "relevance": 7}]',
          stopReason: "stop",
        },
      ],
    });

    const result = await beamSearch(
      "What hypothesis should we test about transformers?",
      provider,
      { beamWidth: 3, depth: 2 }
    );

    expect(result.bestPath).toBeDefined();
    expect(result.bestPath.length).toBeGreaterThanOrEqual(1);
    expect(result.exploredCount).toBeGreaterThan(3);
    expect(result.bestScore.relevance).toBeGreaterThan(0);

    // The best node after depth 1 should be A1 (avg 8.67) or A3 (avg 8.0)
    // A1 has the highest average score (9+8+9)/3 = 8.67
    expect(result.bestScore.feasibility).toBeGreaterThanOrEqual(7);
    expect(result.bestScore.novelty).toBeGreaterThanOrEqual(5);
    expect(result.bestScore.relevance).toBeGreaterThanOrEqual(5);

    // Provider should have been called (not hardcoded)
    expect(provider.getCallCount()).toBeGreaterThan(0);
  });

  it("prunes low-scoring paths", async () => {
    /*
      beamWidth=2, depth=1:
      - 1 generate call from root
      - 1 evaluate call
      - Only top 2 nodes survive to next depth
      So we should see exactly 2 calls for depth=1
    */
    const provider = createDeterministicProvider({
      name: "tot-pruning",
      responses: [
        /* generate */
        {
          content:
            "Great idea---OK idea---Bad idea---Terrible idea---Worst idea",
          stopReason: "stop",
        },
        /* evaluate */
        {
          content:
            '[{"feasibility": 10, "novelty": 10, "relevance": 10}, {"feasibility": 7, "novelty": 6, "relevance": 7}, {"feasibility": 3, "novelty": 2, "relevance": 3}, {"feasibility": 2, "novelty": 1, "relevance": 2}, {"feasibility": 1, "novelty": 1, "relevance": 1}]',
          stopReason: "stop",
        },
        /* depth 1: generate for top node */
        {
          content: "Child of best---Another child of best",
          stopReason: "stop",
        },
        /* depth 1: evaluate for top node */
        {
          content:
            '[{"feasibility": 9, "novelty": 9, "relevance": 9}, {"feasibility": 8, "novelty": 8, "relevance": 8}]',
          stopReason: "stop",
        },
        /* depth 1: generate for 2nd node */
        {
          content: "Child of second---Another child of second",
          stopReason: "stop",
        },
        /* depth 1: evaluate for 2nd node */
        {
          content:
            '[{"feasibility": 6, "novelty": 5, "relevance": 6}, {"feasibility": 5, "novelty": 4, "relevance": 5}]',
          stopReason: "stop",
        },
      ],
    });

    const result = await beamSearch(
      "How to improve model efficiency?",
      provider,
      { beamWidth: 2, depth: 2 }
    );

    // 5 thoughts generated at depth 0, only 2 survive pruning
    // Then 2 more per surviving node at depth 1
    expect(result.exploredCount).toBe(9); // 5 + 2 + 2
    expect(result.bestPath.length).toBeGreaterThanOrEqual(1);
    // Best should be "Child of best" with score (9,9,9)
    expect(result.bestScore.feasibility).toBe(9);
    expect(result.bestScore.novelty).toBe(9);
    expect(result.bestScore.relevance).toBe(9);

    // Prove provider was actually called
    expect(provider.getCallCount()).toBeGreaterThan(0);
  });

  it("returns empty result when no viable thoughts", async () => {
    const provider = createDeterministicProvider({
      name: "tot-empty",
      responses: [
        /* generate returns empty content */
        {
          content: "",
          stopReason: "stop",
        },
      ],
    });

    const result = await beamSearch(
      "Unanswerable question?",
      provider,
      { beamWidth: 3, depth: 2 }
    );

    expect(result.bestPath).toBeDefined();
    expect(result.exploredCount).toBe(0);
    expect(result.bestScore.feasibility).toBe(0);
    expect(result.bestScore.novelty).toBe(0);
    expect(result.bestScore.relevance).toBe(0);
  });

  it("handles malformed JSON from evaluation gracefully", async () => {
    const provider = createDeterministicProvider({
      name: "tot-malformed",
      responses: [
        /* generate */
        {
          content: "Thought one---Thought two",
          stopReason: "stop",
        },
        /* evaluate returns garbage */
        {
          content: "This is not valid JSON at all",
          stopReason: "stop",
        },
        /* depth 1: generate for best (fallback scores) */
        {
          content: "Child one---Child two",
          stopReason: "stop",
        },
        /* depth 1: evaluate returns garbage too */
        {
          content: "Still not JSON",
          stopReason: "stop",
        },
      ],
    });

    const result = await beamSearch(
      "What to study?",
      provider,
      { beamWidth: 2, depth: 2 }
    );

    // Should use fallback scores (5,5,5) when JSON is malformed
    expect(result.exploredCount).toBeGreaterThan(0);
    expect(result.bestPath.length).toBeGreaterThanOrEqual(1);
    // Fallback score
    expect(result.bestScore.feasibility).toBe(5);
    expect(result.bestScore.novelty).toBe(5);
    expect(result.bestScore.relevance).toBe(5);

    // Prove provider was called (not hardcoded response)
    expect(provider.getCallCount()).toBeGreaterThan(0);
  });

  it("traces path from best node to root", async () => {
    const provider = createDeterministicProvider({
      name: "tot-path-trace",
      responses: [
        /* depth 0: generate */
        {
          content: "Root thought A---Root thought B",
          stopReason: "stop",
        },
        /* depth 0: evaluate */
        {
          content:
            '[{"feasibility": 9, "novelty": 9, "relevance": 9}, {"feasibility": 3, "novelty": 3, "relevance": 3}]',
          stopReason: "stop",
        },
        /* depth 1: generate for best */
        {
          content: "Child of A",
          stopReason: "stop",
        },
        /* depth 1: evaluate for best */
        {
          content: '[{"feasibility": 10, "novelty": 10, "relevance": 10}]',
          stopReason: "stop",
        },
      ],
    });

    const result = await beamSearch(
      "Root question?",
      provider,
      { beamWidth: 2, depth: 2 }
    );

    // Path should include root + at least one child
    expect(result.bestPath.length).toBeGreaterThanOrEqual(2);
    // First node in path should be the root question
    expect(result.bestPath[0].thought).toBe("Root question?");
    // Last node should have the best score
    expect(result.bestPath[result.bestPath.length - 1].score.feasibility).toBe(10);
  });

  it("uses custom system prompt when provided", async () => {
    let receivedMessages = null;
    const provider = createDeterministicProvider({
      name: "tot-custom-prompt",
      responses: [
        {
          content: "Custom thought---Another thought",
          stopReason: "stop",
        },
        {
          content:
            '[{"feasibility": 8, "novelty": 8, "relevance": 8}, {"feasibility": 5, "novelty": 5, "relevance": 5}]',
          stopReason: "stop",
        },
      ],
    });

    // Override sendMessages to capture messages
    const originalSend = provider.sendMessages.bind(provider);
    provider.sendMessages = (messages, options) => {
      if (receivedMessages === null) {
        receivedMessages = messages;
      }
      return originalSend(messages, options);
    };

    await beamSearch(
      "Test question",
      provider,
      { beamWidth: 2, depth: 1, systemPrompt: "You are a quantum physicist." }
    );

    expect(receivedMessages).toBeDefined();
    expect(receivedMessages[0].role).toBe("system");
    expect(receivedMessages[0].content).toBe("You are a quantum physicist.");
  });

  it("defaults to beamWidth 3 and depth 3 when not specified", async () => {
    /*
      Default: beamWidth=3, depth=3
      Each depth: 3 generate + 3 evaluate = 6 calls per depth (starting from 1 node)
      But depth 0 starts with 1 node, then beamWidth=3
      depth 0: 1 gen + 1 eval = 2 calls, produces 3 nodes
      depth 1: 3 gen + 3 eval = 6 calls, keeps top 3
      depth 2: 3 gen + 3 eval = 6 calls, keeps top 3
      Total: 14 calls needed
    */
    const responses = [];
    // Generate responses for each call
    // depth 0
    responses.push({ content: "T1---T2---T3", stopReason: "stop" });
    responses.push({
      content: '[{"feasibility":8,"novelty":7,"relevance":9},{"feasibility":7,"novelty":8,"relevance":7},{"feasibility":9,"novelty":6,"relevance":8}]',
      stopReason: "stop",
    });
    // depth 1 (3 nodes)
    for (let i = 0; i < 3; i++) {
      responses.push({ content: `C${i}a---C${i}b---C${i}c`, stopReason: "stop" });
      responses.push({
        content: `[{"feasibility":${8-i},"novelty":${7+i},"relevance":${8}},{"feasibility":${7+i},"novelty":${8-i},"relevance":${7}},{"feasibility":${6+i},"novelty":${9-i},"relevance":${6+i}}]`,
        stopReason: "stop",
      });
    }
    // depth 2 (3 nodes)
    for (let i = 0; i < 3; i++) {
      responses.push({ content: `D${i}a---D${i}b---D${i}c`, stopReason: "stop" });
      responses.push({
        content: `[{"feasibility":${7+i},"novelty":${8-i},"relevance":${7+i}},{"feasibility":${8-i},"novelty":${7+i},"relevance":${8}},{"feasibility":${6+i},"novelty":${9-i},"relevance":${6+i}}]`,
        stopReason: "stop",
      });
    }

    const provider = createDeterministicProvider({
      name: "tot-defaults",
      responses,
    });

    const result = await beamSearch("Default params?", provider);

    expect(result.exploredCount).toBeGreaterThan(0);
    expect(result.bestPath.length).toBeGreaterThanOrEqual(1);
    expect(provider.getCallCount()).toBeGreaterThan(0);
  });
});
