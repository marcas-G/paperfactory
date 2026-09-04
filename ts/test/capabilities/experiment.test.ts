import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as Effect from "effect/Effect";
import { experimentCapability } from "@capabilities/research/experiment";
import { DeterministicProvider } from "@runtime/provider-deterministic";

describe("Experiment Capability - Not Stub", () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("analyze must call science-service microservice, not return hardcoded significance", async () => {
    const httpCalls: Array<{ url: string; body: string }> = [];
    globalThis.fetch = ((url: any, init: any) => {
      httpCalls.push({
        url: url,
        body: init?.body ?? "",
      });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pValue: 0.001,
            significance: 0.95,
            effectSize: 0.72,
          })
        )
      );
    }) as any;

    const provider = new DeterministicProvider({
      name: "experiment-test",
      responses: [
        {
          content:
            "Experimental design: Compare group A vs group B using t-test with alpha=0.05.",
          stopReason: "stop",
        },
      ],
    });

    const result = (await Effect.runPromise(
      experimentCapability.execute({
        hypothesis: "Treatment X reduces symptom Y",
        provider,
        serviceUrl: "http://localhost:8001",
        testData: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]],
      })
    )) as unknown as {
      design: string;
      execution: Array<{ step: string; output: string }>;
      analysis: { findings: string; significance: number };
    };

    // analyze skill MUST call microservice (HTTP POST to /api/statistics/)
    const statsCall = httpCalls.find((c) => c.url.includes("/api/statistics/"));
    expect(statsCall).toBeDefined();
    expect(statsCall?.url).toContain("/api/statistics/");

    // Must NOT return hardcoded 0.85
    expect(result.analysis.significance).not.toBe(0.85);
    // Must use data from mocked microservice
    expect(result.analysis.significance).toBe(0.95);
  });

  it("design skill must call Provider (LLM), not return template string", async () => {
    const provider = new DeterministicProvider({
      name: "experiment-design-test",
      responses: [
        {
          content:
            "Design: Randomized controlled trial with 100 subjects per group. Primary endpoint is symptom reduction measured by scale Z.",
          stopReason: "stop",
        },
      ],
    });

    const designSkill = experimentCapability.skills[0];
    const result = (await Effect.runPromise(
      designSkill.execute({
        hypothesis: "X causes Y",
        provider,
      })
    )) as unknown as { design: string };

    // MUST call Provider - proof it's not a template
    expect(provider.getCallCount()).toBeGreaterThan(0);

    // Must NOT return template string
    expect(result.design).not.toBe("Experimental design for: X causes Y");
    // Must contain content from Provider
    expect(result.design).toContain("Randomized controlled trial");
  });

  it("has correct skill structure", () => {
    expect(experimentCapability.skills).toHaveLength(3);
    expect(experimentCapability.skills[0].name).toBe("experiment_design");
    expect(experimentCapability.skills[1].name).toBe("experiment_execute");
    expect(experimentCapability.skills[2].name).toBe("experiment_analyze");
  });
});
