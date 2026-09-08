import { describe, it, expect } from "vitest";
import { debate } from "../../../src/runtime/workflows/debate";
import { createDeterministicProvider } from "../../../src/runtime/provider-deterministic";
import type { Provider, Message, ProviderOptions } from "../../../src/runtime/provider";

/**
 * Records every sendMessages call (system + user) while delegating responses
 * to a DeterministicProvider — lets tests assert what prompt each agent
 * actually received instead of only checking result structure.
 */
class RecordingProvider implements Provider {
  readonly calls: Array<{ system: string | undefined; user: string }> = [];

  constructor(
    private inner: ReturnType<typeof createDeterministicProvider>
  ) {}

  sendMessages(
    messages: ReadonlyArray<Message>,
    options?: ProviderOptions
  ) {
    this.calls.push({
      system: messages.find((m) => m.role === "system")?.content,
      user: messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n"),
    });
    return this.inner.sendMessages(messages, options);
  }

  streamResponse(
    messages: ReadonlyArray<Message>,
    options?: ProviderOptions
  ) {
    return this.inner.streamResponse(messages, options);
  }

  getCallCount(): number {
    return this.inner.getCallCount();
  }
}

describe("Multi-Agent Debate Engine", () => {
  it("conducts single round debate between pro and con agents", async () => {
    const provider = createDeterministicProvider({
      name: "single-round-debate",
      responses: [
        {
          content: "Pro: The evidence strongly supports this hypothesis because Study A shows 12% improvement in memory performance.",
          stopReason: "stop",
        },
        {
          content: "Con: However, the sample size of Study A is too small (n=20) to draw conclusions, and Study B found no significant effect.",
          stopReason: "stop",
        },
        {
          content: "Judge: Based on the debate, the hypothesis is plausible but needs more evidence. Confidence: 0.6",
          stopReason: "stop",
        },
      ],
    });

    const result = await debate(
      "Does caffeine improve memory?",
      ["Study A: 12% improvement", "Study B: no significant effect"],
      provider,
      { rounds: 1 }
    );

    expect(result.debates.length).toBe(1);
    expect(result.debates[0].round).toBe(1);
    expect(result.debates[0].pro).toContain("Study A");
    expect(result.debates[0].con).toContain("sample size");
    expect(result.conclusion).toBeDefined();
    expect(result.confidence).toBeCloseTo(0.6);
    expect(provider.getCallCount()).toBe(3);
  });

  it("conducts multiple rounds of debate", async () => {
    const provider = createDeterministicProvider({
      name: "multi-round-debate",
      responses: [
        // Round 1
        { content: "Pro R1: Strong evidence from multiple studies.", stopReason: "stop" },
        { content: "Con R1: Methodological flaws undermine findings.", stopReason: "stop" },
        { content: "Judge R1: Arguments are balanced. Confidence: 0.4", stopReason: "stop" },
        // Round 2
        { content: "Pro R2: New meta-analysis confirms initial findings.", stopReason: "stop" },
        { content: "Con R2: Publication bias inflates effect sizes.", stopReason: "stop" },
        { content: "Judge R2: Pro side has stronger evidence now. Confidence: 0.7", stopReason: "stop" },
      ],
    });

    const result = await debate(
      "Does caffeine improve memory?",
      ["Study A: 12% improvement", "Study B: no significant effect"],
      provider,
      { rounds: 2 }
    );

    expect(result.debates.length).toBe(2);
    expect(result.debates[0].round).toBe(1);
    expect(result.debates[1].round).toBe(2);
    expect(result.debates[0].pro).toContain("Pro R1");
    expect(result.debates[1].pro).toContain("Pro R2");
    expect(result.debates[0].con).toContain("Con R1");
    expect(result.debates[1].con).toContain("Con R2");
    expect(result.conclusion).toContain("Judge R2");
    expect(result.confidence).toBeCloseTo(0.7);
    expect(provider.getCallCount()).toBe(6);
  });

  it("defaults to 3 rounds when no rounds option provided", async () => {
    const provider = createDeterministicProvider({
      name: "default-rounds",
      responses: Array(9).fill(null).map((_, i) => ({
        content: `Response ${i}`,
        stopReason: "stop",
      })),
    });

    const result = await debate(
      "Test topic",
      ["Evidence 1"],
      provider
    );

    expect(result.debates.length).toBe(3);
    expect(provider.getCallCount()).toBe(9);
  });

  it("passes previous debate context to subsequent rounds", async () => {
    const provider = new RecordingProvider(
      createDeterministicProvider({
        name: "context-propagation",
        responses: [
          // Round 1: pro
          { content: "Pro R1 argument", stopReason: "stop" },
          // Round 1: con
          { content: "Con R1 argument", stopReason: "stop" },
          // Round 1: judge
          { content: "Judge R1 verdict. Confidence: 0.5", stopReason: "stop" },
          // Round 2: pro - should see previous round context
          { content: "Pro R2 builds on R1", stopReason: "stop" },
          // Round 2: con
          { content: "Con R2 counters", stopReason: "stop" },
          // Round 2: judge
          { content: "Judge R2 final. Confidence: 0.8", stopReason: "stop" },
        ],
      })
    );

    const result = await debate(
      "Test hypothesis",
      ["Evidence A", "Evidence B"],
      provider,
      { rounds: 2 }
    );

    expect(result.debates.length).toBe(2);
    expect(result.debates[1].judge).toContain("Judge R2");
    expect(result.confidence).toBeCloseTo(0.8);

    // round 2 的 pro 提示词必须包含上一轮摘要(证明上下文真实传递,而非各轮独立)
    const round2ProUser = provider.calls[3].user;
    expect(round2ProUser).toContain("Previous debate summary");
    expect(round2ProUser).toContain("Pro R1 argument");
    expect(round2ProUser).toContain("Con R1 argument");
  });

  it("handles provider error gracefully", async () => {
    const provider = createDeterministicProvider({
      name: "error-handling",
      responses: [
        { content: "Pro argument", stopReason: "stop" },
        { content: "Con argument", stopReason: "stop" },
        // Judge returns unexpected call message (out of responses)
        {
          content:
            "Unexpected call 2. Scenario 'error-handling' only has 2 responses.",
          stopReason: "stop",
        },
      ],
    });

    const result = await debate(
      "Test topic",
      ["Evidence"],
      provider,
      { rounds: 1 }
    );

    expect(result.debates.length).toBe(1);
    expect(result.conclusion).toBeDefined();
  });

  it("returns confidence 0.5 when judge response has no confidence score", async () => {
    const provider = createDeterministicProvider({
      name: "no-confidence",
      responses: [
        { content: "Pro: Evidence is mixed.", stopReason: "stop" },
        { content: "Con: Evidence is weak.", stopReason: "stop" },
        {
          content: "Judge: The evidence is inconclusive. More research needed.",
          stopReason: "stop",
        },
      ],
    });

    const result = await debate(
      "Test topic",
      ["Evidence"],
      provider,
      { rounds: 1 }
    );

    expect(result.confidence).toBeCloseTo(0.5);
  });

  it("caps confidence at 1.0", async () => {
    const provider = createDeterministicProvider({
      name: "high-confidence",
      responses: [
        { content: "Pro: Overwhelming evidence.", stopReason: "stop" },
        { content: "Con: No counter evidence.", stopReason: "stop" },
        {
          content: "Judge: The hypothesis is confirmed with 1.5 confidence.",
          stopReason: "stop",
        },
      ],
    });

    const result = await debate(
      "Test topic",
      ["Evidence"],
      provider,
      { rounds: 1 }
    );

    expect(result.confidence).toBeCloseTo(1.0);
  });

  it("gives each agent its role-specific system prompt", async () => {
    const provider = new RecordingProvider(
      createDeterministicProvider({
        name: "prompt-verification",
        responses: [
          { content: "Pro argument here", stopReason: "stop" },
          { content: "Con argument here", stopReason: "stop" },
          { content: "Judge verdict here. Confidence: 0.9", stopReason: "stop" },
        ],
      })
    );

    const result = await debate(
      "Does exercise improve cognitive function?",
      ["Study shows 15% improvement in working memory"],
      provider,
      { rounds: 1 }
    );

    expect(result.debates[0].pro).toBe("Pro argument here");
    expect(result.debates[0].con).toBe("Con argument here");
    expect(result.debates[0].judge).toBe("Judge verdict here. Confidence: 0.9");
    expect(result.confidence).toBeCloseTo(0.9);

    // 每轮恰好 3 次调用:pro/con/judge 各收到自己的 system prompt
    expect(provider.calls.length).toBe(3);
    expect(provider.calls[0].system).toContain("IN FAVOR");
    expect(provider.calls[1].system).toContain("AGAINST");
    expect(provider.calls[2].system).toContain("impartial");
    // judge 的 user 提示词必须同时包含 pro 与 con 的论点
    expect(provider.calls[2].user).toContain("Pro argument here");
    expect(provider.calls[2].user).toContain("Con argument here");
    expect(provider.getCallCount()).toBe(3);
  });
});
