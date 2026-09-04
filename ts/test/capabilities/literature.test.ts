import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as Effect from "effect/Effect";
import { literatureCapability } from "@capabilities/research/literature";

describe("Literature Capability - Not Stub", () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("search must make HTTP request to Semantic Scholar, not return hardcoded papers", async () => {
    const httpCalls: string[] = [];
    globalThis.fetch = ((url: any) => {
      httpCalls.push(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                title: "Attention Is All You Need",
                abstract:
                  "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
                authors: [
                  { name: "Ashish Vaswani" },
                  { name: "Noam Shazeer" },
                ],
                year: 2017,
                relevanceScore: 0.95,
              },
              {
                title: "Deep Residual Learning for Image Recognition",
                abstract: "Deep residual networks for image classification.",
                authors: [{ name: "Kaiming He" }],
                year: 2016,
                relevanceScore: 0.88,
              },
            ],
          })
        )
      );
    }) as any;

    const result = (await Effect.runPromise(
      literatureCapability.execute({ query: "transformer" })
    )) as unknown as {
      query: string;
      papers: Array<{ title: string; abstract: string; relevance: number }>;
      synthesis: string;
    };

    // MUST call external API - proof it's not hardcoded
    expect(httpCalls.length).toBeGreaterThan(0);
    expect(httpCalls[0]).toContain("semanticscholar.org");

    // Must NOT return hardcoded "Paper A" data
    expect(result.papers[0].title).not.toBe("Paper A");
    expect(result.papers[0].title).not.toBe("Paper B");

    // Must use data from the mocked API response
    expect(result.papers[0].title).toBe("Attention Is All You Need");
    expect(result.papers.length).toBe(2);
  });

  it("search skill alone must call Semantic Scholar API", async () => {
    const httpCalls: string[] = [];
    globalThis.fetch = ((url: any) => {
      httpCalls.push(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                title: "Real Paper From API",
                abstract: "A real abstract from the API.",
                authors: [{ name: "Real Author" }],
                year: 2024,
                relevanceScore: 0.99,
              },
            ],
          })
        )
      );
    }) as any;

    const searchSkill = literatureCapability.skills[0];
    const result = (await Effect.runPromise(
      searchSkill.execute({ query: "quantum computing" })
    )) as unknown as {
      query: string;
      papers: Array<{
        title: string;
        abstract: string;
        relevance: number;
      }>;
    };

    // MUST make HTTP call
    expect(httpCalls.some((u) => u.includes("semanticscholar.org"))).toBe(
      true
    );

    // Must NOT be hardcoded stub data
    expect(result.papers[0].title).not.toBe("Paper A");
    expect(result.papers[0].title).toBe("Real Paper From API");
  });

  it("has correct skill structure", () => {
    expect(literatureCapability.skills).toHaveLength(3);
    expect(literatureCapability.skills[0].name).toBe("literature_search");
    expect(literatureCapability.skills[1].name).toBe("literature_retrieve");
    expect(literatureCapability.skills[2].name).toBe("literature_synthesize");
  });
});
