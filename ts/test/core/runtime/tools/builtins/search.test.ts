import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createSearchTool } from "@pf/core/runtime/tools/builtins/search";

describe("Search Tool", () => {
  it("returns results from Semantic Scholar by default", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((_url: any) => {
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: [{ title: "Default Result" }] }),
          { status: 200 }
        )
      );
    }) as any;

    try {
      const tool = createSearchTool();
      const result = await Effect.runPromise(
        tool.execute({ query: "test" })
      );

      expect(result.content).toContain("Default Result");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("uses custom config", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((_url: any) => {
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: [{ title: "Custom Result" }] }),
          { status: 200 }
        )
      );
    }) as any;

    try {
      const tool = createSearchTool({
        maxResults: 5,
      });

      expect(tool.name).toBe("search");
      expect(tool.description).toContain("Search");

      const result = await Effect.runPromise(
        tool.execute({ query: "machine learning" })
      );

      expect(result.content).toBeTruthy();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles empty query", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((_url: any) => {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );
    }) as any;

    try {
      const tool = createSearchTool();
      const result = await Effect.runPromise(tool.execute({}));
      expect(result.content).toBeTruthy();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("search tool defaults to Semantic Scholar API", async () => {
    const httpCalls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((url: any) => {
      httpCalls.push(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: [{ title: "Test Paper" }] }),
          { status: 200 }
        )
      );
    }) as any;

    try {
      const tool = createSearchTool();
      const result = await Effect.runPromise(
        tool.execute({ query: "quantum computing" })
      );

      expect(httpCalls.length).toBeGreaterThan(0);
      expect(httpCalls[0]).toContain("semanticscholar.org");
      expect(httpCalls[0]).toContain("quantum%20computing");
      const parsed = JSON.parse(result.content);
      expect(parsed.results.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("search tool returns structured results", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((_url: any) => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              { title: "Paper A", abstract: "Abstract A", year: 2024 }
            ]
          }),
          { status: 200 }
        )
      );
    }) as any;

    try {
      const tool = createSearchTool();
      const result = await Effect.runPromise(
        tool.execute({ query: "test" })
      );

      expect(result.content).toContain("Paper A");
      expect(result.content).toContain("Abstract A");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("search tool uses custom endpoint when provided", async () => {
    const httpCalls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((url: any) => {
      httpCalls.push(url);
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );
    }) as any;

    try {
      const customEndpoint =
        "https://custom.api.example.com/search";
      const tool = createSearchTool({ endpoint: customEndpoint });
      await Effect.runPromise(tool.execute({ query: "test" }));

      expect(httpCalls.length).toBeGreaterThan(0);
      expect(httpCalls[0]).toContain("custom.api.example.com");
      expect(httpCalls[0]).not.toContain("semanticscholar.org");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
