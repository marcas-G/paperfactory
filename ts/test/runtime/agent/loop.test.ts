import { describe, it, expect } from "vitest";
import { runAgentLoop } from "../../../src/runtime/agent/loop";
import { MockProvider } from "../../../src/runtime/provider";
import { ToolRegistry } from "../../../src/runtime/tools/registry";
import { searchTool } from "../../../src/runtime/tools/builtins/search";
import { codeTool } from "../../../src/runtime/tools/builtins/code";

describe("Agent Loop", () => {
  it("basic loop without tool calls", async () => {
    const provider = new MockProvider([
      {
        pattern: "",
        response: {
          content: "Done with the task",
          stopReason: "end_turn",
        },
      },
    ]);

    const toolRegistry = new ToolRegistry();

    const result = await runAgentLoop(provider, toolRegistry, [
      { role: "user", content: "hello" },
    ]);

    expect(result.finalContent).toBe("Done with the task");
    expect(result.toolCalls).toHaveLength(0);
  });

  it("loop with tool calls", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(searchTool, {
      name: "search",
      description: "Search",
      schema: {},
      writeOnly: false,
    });

    // search tool hits the real Semantic Scholar API — mock it and assert
    // the exact URL, so the test is deterministic and offline-safe.
    const httpCalls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((url: any) => {
      httpCalls.push(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ title: "Paper", authors: [{ name: "A" }] }],
          }),
          { status: 200 }
        )
      );
    }) as any;

    const provider = new MockProvider([
      {
        pattern: "papers",
        response: {
          content: "",
          stopReason: "tool_use",
          toolCalls: [
            {
              toolCallId: "tc1",
              toolName: "search",
              arguments: { query: "machine learning" },
            },
          ],
        },
      },
      {
        pattern: "result",
        response: {
          content: "I found the papers you requested.",
          stopReason: "end_turn",
        },
      },
    ]);

    try {
      const result = await runAgentLoop(provider, toolRegistry, [
        { role: "user", content: "search for papers" },
      ]);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe("search");
      expect(result.finalContent).toBe("I found the papers you requested.");
      // the search tool must have actually called the external API —
      // never a hardcoded/cached result
      expect(httpCalls.length).toBeGreaterThan(0);
      expect(httpCalls[0]).toContain("https://api.semanticscholar.org");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("loop terminates on max iterations", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(codeTool, {
      name: "code",
      description: "Code",
      schema: {},
      writeOnly: false,
    });

    const provider = new MockProvider([
      {
        pattern: "",
        response: {
          content: "",
          stopReason: "tool_use",
          toolCalls: [
            {
              toolCallId: "tc1",
              toolName: "code",
              arguments: { code: "while true: pass", language: "python" },
            },
          ],
        },
      },
    ]);

    const result = await runAgentLoop(
      provider,
      toolRegistry,
      [{ role: "user", content: "infinite loop" }],
      { maxIterations: 3 }
    );

    expect(result.finalContent).toBe("达到最大迭代次数");
  });
});
