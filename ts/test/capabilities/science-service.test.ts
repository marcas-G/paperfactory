import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { analyzeSkill, designSkill } from "@capabilities/research/experiment";
import { MockProvider } from "@runtime/provider";

describe("Science Microservice Integration", () => {
  it("experiment analyze calls Python science-service API", async () => {
    const httpCalls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((url: any, init?: any) => {
      httpCalls.push(url);
      if (url.includes("/api/statistics/")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ pValue: 0.035, statistic: -2.1 }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }) as any;

    try {
      const result = await Effect.runPromise(
        analyzeSkill.execute({
          testData: [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]],
          serviceUrl: "http://test-science:8001",
        })
      );

      expect(httpCalls.some((u) => u.includes("/api/statistics/"))).toBe(true);
      expect(result.analysis).toBeDefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("experiment design calls Provider (not hardcoded fallback)", async () => {
    const provider = new MockProvider([
      {
        pattern: "",
        response: {
          content: "Randomized controlled trial with 2 groups, n=30 per group, alpha=0.05.",
          stopReason: "stop",
        },
      },
    ]);

    const result = await Effect.runPromise(
      designSkill.execute({
        hypothesis: "X causes Y",
        provider,
      })
    );

    // Must use Provider response, not fallback template
    expect(result.design).toContain("Randomized controlled trial");
    expect(result.design).not.toContain("Experimental design for:");
  });

  it("experiment design fallback when no provider", async () => {
    const result = await Effect.runPromise(
      designSkill.execute({
        hypothesis: "X causes Y",
      })
    );

    // Fallback returns template with hypothesis
    expect(result.design).toContain("X causes Y");
    expect(result.design).toContain("Experimental design for:");
  });

  it("science-service returns real t-test results from mock", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((url: any) => {
      if (url.includes("/api/statistics/t-test")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ statistic: 3.47, pValue: 0.0012 }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }) as any;

    try {
      const result = await Effect.runPromise(
        analyzeSkill.execute({
          testData: [[1, 2, 3], [4, 5, 6]],
          serviceUrl: "http://mock-science:8001",
        })
      );

      expect(result.analysis).toBeDefined();
      const findings = (result.analysis as any).findings as string;
      expect(findings).toContain("0.0012");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
