import { describe, it, expect } from "vitest";
import { sampleConsensus } from "@pf/core/runtime/workflows/self-consistency";
import { createDeterministicProvider } from "@pf/core/runtime/provider-deterministic";
import type { Message } from "@pf/core/runtime/provider";

describe("Self-Consistency Engine", () => {
  it("generates multiple independent paths and returns consensus", async () => {
    const provider = createDeterministicProvider({
      name: "consensus-majority",
      responses: [
        { content: "Supporting", stopReason: "stop" },
        { content: "Supporting", stopReason: "stop" },
        { content: "Supporting", stopReason: "stop" },
        { content: "Contradicting", stopReason: "stop" },
        { content: "Supporting", stopReason: "stop" },
        { content: "Supporting", stopReason: "stop" },
        { content: "Supporting", stopReason: "stop" },
      ],
    });

    const result = await sampleConsensus(
      "Does evidence support this hypothesis?",
      provider,
      { samples: 7, temperature: 0.7 }
    );

    expect(result.answer).toBe("supporting");
    expect(result.confidence).toBeCloseTo(6 / 7, 4);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.paths.length).toBe(7);

    // Prove provider was actually called (not hardcoded)
    expect(provider.getCallCount()).toBe(7);
  });

  it("returns low confidence when paths disagree", async () => {
    const provider = createDeterministicProvider({
      name: "consensus-disagree",
      responses: [
        { content: "Supporting", stopReason: "stop" },
        { content: "Contradicting", stopReason: "stop" },
        { content: "Supporting", stopReason: "stop" },
        { content: "Contradicting", stopReason: "stop" },
        { content: "Contradicting", stopReason: "stop" },
        { content: "Supporting", stopReason: "stop" },
        { content: "Contradicting", stopReason: "stop" },
      ],
    });

    const result = await sampleConsensus(
      "Does evidence support this hypothesis?",
      provider,
      { samples: 7, temperature: 0.7 }
    );

    // 4 Contradicting vs 3 Supporting => max share = 4/7 = 0.571 < 0.6
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.confidence).toBeCloseTo(4 / 7, 4);
    expect(result.paths.length).toBe(7);
    expect(result.answer).toBe("contradicting");

    // Prove provider was called
    expect(provider.getCallCount()).toBe(7);
  });

  it("uses default of 7 samples when not specified", async () => {
    const provider = createDeterministicProvider({
      name: "consensus-default-samples",
      responses: Array.from({ length: 7 }, () => ({
        content: "Yes",
        stopReason: "stop",
      })),
    });

    const result = await sampleConsensus("Test question?", provider);

    expect(result.paths.length).toBe(7);
    expect(result.answer).toBe("yes");
    expect(result.confidence).toBe(1);
    expect(provider.getCallCount()).toBe(7);
  });

  it("returns unanimous confidence 1.0 when all paths agree", async () => {
    const provider = createDeterministicProvider({
      name: "consensus-unanimous",
      responses: Array.from({ length: 5 }, () => ({
        content: "Confirmed",
        stopReason: "stop",
      })),
    });

    const result = await sampleConsensus(
      "Is this true?",
      provider,
      { samples: 5 }
    );

    expect(result.answer).toBe("confirmed");
    expect(result.confidence).toBe(1);
    expect(result.paths.length).toBe(5);

    // Distribution should have exactly one entry
    expect(result.distribution.size).toBe(1);
    expect(result.distribution.get("confirmed")).toBe(5);

    expect(provider.getCallCount()).toBe(5);
  });

  it("applies custom normalize function", async () => {
    const provider = createDeterministicProvider({
      name: "consensus-normalize",
      responses: [
        { content: "YES, the evidence supports it", stopReason: "stop" },
        { content: "Yes! It does support", stopReason: "stop" },
        { content: "yes", stopReason: "stop" },
        { content: "NO, it contradicts", stopReason: "stop" },
        { content: "Yes", stopReason: "stop" },
        { content: "yes, definitely", stopReason: "stop" },
        { content: "YES", stopReason: "stop" },
      ],
    });

    const result = await sampleConsensus(
      "Does it support?",
      provider,
      {
        samples: 7,
        normalizeFn: (raw: string) =>
          raw.toLowerCase().includes("no") ? "contradict" : "support",
      }
    );

    // 6 support, 1 contradict
    expect(result.answer).toBe("support");
    expect(result.confidence).toBeCloseTo(6 / 7, 4);
    expect(result.distribution.get("support")).toBe(6);
    expect(result.distribution.get("contradict")).toBe(1);

    expect(provider.getCallCount()).toBe(7);
  });

  it("uses custom system prompt when provided", async () => {
    let capturedMessages: ReadonlyArray<Message> | null = null;

    const provider = createDeterministicProvider({
      name: "consensus-custom-system",
      responses: [
        { content: "A", stopReason: "stop" },
        { content: "A", stopReason: "stop" },
        { content: "A", stopReason: "stop" },
      ],
    });

    // Override sendMessages to capture messages
    const originalSend = provider.sendMessages.bind(provider);
    provider.sendMessages = (messages, options) => {
      if (capturedMessages === null) {
        capturedMessages = messages;
      }
      return originalSend(messages, options);
    };

    await sampleConsensus(
      "Test?",
      provider,
      {
        samples: 3,
        systemPrompt: "You are a statistical analyst.",
      }
    );

    expect(capturedMessages).not.toBeNull();
    expect(capturedMessages![0].role).toBe("system");
    expect(capturedMessages![0].content).toBe("You are a statistical analyst.");
    expect(capturedMessages![1].role).toBe("user");
    expect(provider.getCallCount()).toBe(3);
  });

  it("handles single sample gracefully", async () => {
    const provider = createDeterministicProvider({
      name: "consensus-single",
      responses: [
        { content: "Single answer", stopReason: "stop" },
      ],
    });

    const result = await sampleConsensus(
      "Test?",
      provider,
      { samples: 1 }
    );

    expect(result.answer).toBe("single answer");
    expect(result.confidence).toBe(1);
    expect(result.paths.length).toBe(1);
    expect(provider.getCallCount()).toBe(1);
  });

  it("handles ties by picking first encountered majority answer", async () => {
    const provider = createDeterministicProvider({
      name: "consensus-tie",
      responses: [
        { content: "Alpha", stopReason: "stop" },
        { content: "Beta", stopReason: "stop" },
        { content: "Alpha", stopReason: "stop" },
        { content: "Beta", stopReason: "stop" },
      ],
    });

    const result = await sampleConsensus(
      "Which?",
      provider,
      { samples: 4 }
    );

    // 2 Alpha, 2 Beta => tie, picks first encountered max (Alpha)
    expect(result.answer).toBe("alpha");
    expect(result.confidence).toBe(0.5);
    expect(result.paths.length).toBe(4);

    // Both answers have equal count in distribution
    expect(result.distribution.get("alpha")).toBe(2);
    expect(result.distribution.get("beta")).toBe(2);

    expect(provider.getCallCount()).toBe(4);
  });

  it("passes temperature to provider options", async () => {
    let capturedTemperature = null;

    const provider = createDeterministicProvider({
      name: "consensus-temperature",
      responses: [
        { content: "A", stopReason: "stop" },
        { content: "A", stopReason: "stop" },
      ],
    });

    const originalSend = provider.sendMessages.bind(provider);
    provider.sendMessages = (messages, options) => {
      capturedTemperature = options?.temperature;
      return originalSend(messages, options);
    };

    await sampleConsensus(
      "Test?",
      provider,
      { samples: 2, temperature: 0.9 }
    );

    expect(capturedTemperature).toBe(0.9);
    expect(provider.getCallCount()).toBe(2);
  });
});
