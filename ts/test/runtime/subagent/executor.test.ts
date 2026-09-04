import { describe, it, expect } from "vitest";
import { SubagentExecutor } from "../../../src/runtime/subagent/executor";
import { MockProvider } from "../../../src/runtime/provider";
import { ToolRegistry } from "../../../src/runtime/tools/registry";
import { MockSummarizer } from "../../../src/runtime/agent/summarizer";
import { searchTool } from "../../../src/runtime/tools/builtins/search";

describe("SubagentExecutor", () => {
  it("returns summary with isolated context", async () => {
    const toolRegistry = new ToolRegistry();
    const provider = new MockProvider([
      {
        pattern: "task",
        response: {
          content: "I have completed the task.",
          stopReason: "end_turn",
        },
      },
    ]);

    const executor = new SubagentExecutor({
      provider,
      toolRegistry,
      systemPrompt: "You are a research assistant.",
      contextSummarizer: new MockSummarizer(),
    });

    const result = await executor.execute("Perform this task");
    expect(result.summary).toBeTruthy();
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[0].role).toBe("system");
  });

  it("maintains tool isolation", async () => {
    const isolatedRegistry = new ToolRegistry();
    isolatedRegistry.register(searchTool, {
      name: "search",
      description: "Search",
      schema: {},
      writeOnly: false,
    });

    const provider = new MockProvider([
      {
        pattern: "",
        response: {
          content: "Done",
          stopReason: "end_turn",
        },
      },
    ]);

    const executor = new SubagentExecutor({
      provider,
      toolRegistry: isolatedRegistry,
      systemPrompt: "Isolated agent.",
    });

    const result = await executor.execute("Do something");
    expect(result.summary).toBe("Done");
  });

  it("returns summary only", async () => {
    const executor = new SubagentExecutor({
      provider: new MockProvider([
        {
          pattern: "",
          response: { content: "Summary result here", stopReason: "end_turn" },
        },
      ]),
      toolRegistry: new ToolRegistry(),
      systemPrompt: "Test",
    });

    const result = await executor.execute("Task");
    expect(result.summary).toBe("Summary result here");
  });
});
