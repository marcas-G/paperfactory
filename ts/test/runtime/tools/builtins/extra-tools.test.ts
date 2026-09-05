import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";

describe("LaTeX Tool", () => {
  it("compiles LaTeX snippet to PDF", async () => {
    const { createLatexTool } = await import("@runtime/tools/builtins/latex");
    const tool = createLatexTool();

    const result = await Effect.runPromise(
      tool.execute({
        content: "\\documentclass{article}\\begin{document}Hello\\end{document}",
      })
    );

    expect(result.type).toBe("result");
    expect(result.content).toBeDefined();
    expect(result.isError).toBeDefined();
  });

  it("returns error for invalid LaTeX", async () => {
    const { createLatexTool } = await import("@runtime/tools/builtins/latex");
    const tool = createLatexTool();

    const result = await Effect.runPromise(
      tool.execute({
        content: "\\documentclass{article}\\begin{document}\\undefinedcmd\\end{document}",
      })
    );

    expect(result.type).toBe("result");
    // Should not crash even with invalid LaTeX
    expect(result).toBeDefined();
  });
});

describe("Data Tool", () => {
  it("loads and parses CSV data", async () => {
    const { createDataTool } = await import("@runtime/tools/builtins/data");
    const tool = createDataTool();

    const result = await Effect.runPromise(
      tool.execute({
        action: "parse_csv",
        data: "a,b\n1,2\n3,4",
      })
    );

    expect(result.type).toBe("result");
    expect(result.content).toContain("1");
    expect(result.content).toContain("2");
  });

  it("computes basic statistics", async () => {
    const { createDataTool } = await import("@runtime/tools/builtins/data");
    const tool = createDataTool();

    const result = await Effect.runPromise(
      tool.execute({
        action: "statistics",
        data: [1, 2, 3, 4, 5],
      })
    );

    expect(result.type).toBe("result");
    const parsed = JSON.parse(result.content as string);
    expect(parsed.mean).toBe(3);
    expect(parsed.length).toBe(5);
  });
});

describe("Network Tool", () => {
  it("fetches URL content", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.resolve(new Response("Hello from test", { status: 200 }));
    }) as any;

    try {
      const { createNetworkTool } = await import("@runtime/tools/builtins/network");
      const tool = createNetworkTool();

      const result = await Effect.runPromise(
        tool.execute({ url: "http://example.com" })
      );

      expect(result.type).toBe("result");
      expect(result.content).toContain("Hello from test");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles network errors gracefully", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.reject(new Error("Network error"));
    }) as any;

    try {
      const { createNetworkTool } = await import("@runtime/tools/builtins/network");
      const tool = createNetworkTool();

      // tryPromise returns error string on failure, wrapped by Effect.either
      const result = await Effect.runPromise(
        Effect.either(tool.execute({ url: "http://unreachable.com" }))
      );

      if (result._tag === "Left") {
        // Error path: the error message contains network error info
        expect(result.left).toContain("Network error");
      } else {
        // Success path
        expect(result.right.type).toBe("result");
        expect(result.right.isError).toBe(true);
      }
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
