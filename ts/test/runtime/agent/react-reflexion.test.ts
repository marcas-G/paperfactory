import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { runAgentLoop } from "@runtime/agent/loop";
import { MockProvider } from "@runtime/provider";
import { ToolRegistry } from "@runtime/tools/registry";
// REFLECT instruction is now inlined in loop.ts (no cross-layer dependency)

describe("ReAct + Reflexion in Agent Loop", () => {
  it("emits thinking event before each iteration", async () => {
    const events: any[] = [];
    const provider = new MockProvider([
      {
        pattern: "",
        response: {
          content: "Done",
          stopReason: "stop",
        },
      },
    ]);
    const registry = new ToolRegistry();

    const result = await runAgentLoop(
      provider,
      registry,
      [{ role: "user", content: "Test" }],
      { onEvent: (e) => events.push(e) }
    );

    const thinkingEvents = events.filter((e) => e.type === "thinking");
    expect(thinkingEvents.length).toBeGreaterThan(0);
    expect(result.finalContent).toBe("Done");
  });

  it("emits tool:calling and tool:result events when a tool is used", async () => {
    const events: any[] = [];
    const registry = new ToolRegistry();
    registry.register(
      {
        name: "test_tool",
        description: "test",
        execute: () => Effect.succeed({ content: "tool output" }),
      } as any,
      { name: "test_tool", description: "test", schema: {}, writeOnly: false }
    );

    const provider = new MockProvider([
      {
        pattern: "run",
        response: {
          content: "",
          stopReason: "tool_use",
          toolCalls: [
            {
              toolCallId: "tc1",
              toolName: "test_tool",
              arguments: {},
            },
          ],
        },
      },
      {
        pattern: "Reflect",
        response: {
          content: "Task complete.",
          stopReason: "stop",
        },
      },
    ]);

    const result = await runAgentLoop(
      provider,
      registry,
      [{ role: "user", content: "run test" }],
      { onEvent: (e) => events.push(e) }
    );

    const toolCalling = events.filter((e) => e.type === "tool:calling");
    const toolResult = events.filter((e) => e.type === "tool:result");

    expect(toolCalling.length).toBe(1);
    expect(toolCalling[0].toolName).toBe("test_tool");
    expect(toolResult.length).toBe(1);
    expect(toolResult[0].toolName).toBe("test_tool");
    expect(result.toolCalls.length).toBe(1);
    expect(result.finalContent).toBe("Task complete.");
  });

  it("inserts reflexion prompt after tool result when iterations remain", async () => {
    const events: any[] = [];
    const registry = new ToolRegistry();
    registry.register(
      {
        name: "search",
        description: "Search tool",
        execute: () => Effect.succeed({ content: "Found 3 papers" }),
      } as any,
      { name: "search", description: "Search", schema: {}, writeOnly: false }
    );

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
              arguments: { query: "transformers" },
            },
          ],
        },
      },
      {
        pattern: "Reflect",
        response: {
          content: "After reflection, the results look good.",
          stopReason: "stop",
        },
      },
    ]);

    const result = await runAgentLoop(
      provider,
      registry,
      [{ role: "user", content: "find papers" }],
      { maxIterations: 5, onEvent: (e) => events.push(e) }
    );

    // After tool:result, the loop should have inserted a reflexion prompt
    // and made another provider call
    const reflexionThinkingEvents = events.filter(
      (e) => e.type === "thinking" && e.content.includes("反思")
    );
    expect(reflexionThinkingEvents.length).toBeGreaterThan(0);

    // Verify the messages include the reflexion prompt (user role with REFLECT instructions)
    const reflexionMessages = result.messages.filter(
      (m) =>
        m.role === "user" &&
        m.content.includes("Reflect on the tool result")
    );
    expect(reflexionMessages.length).toBeGreaterThan(0);
  });

  it("does NOT insert reflexion on the last possible iteration", async () => {
    const events: any[] = [];
    const registry = new ToolRegistry();
    registry.register(
      {
        name: "search",
        description: "Search tool",
        execute: () => Effect.succeed({ content: "Found results" }),
      } as any,
      { name: "search", description: "Search", schema: {}, writeOnly: false }
    );

    // Provider always returns a tool call, forcing max iterations
    const provider = new MockProvider([
      {
        pattern: "",
        response: {
          content: "",
          stopReason: "tool_use",
          toolCalls: [
            {
              toolCallId: "tc1",
              toolName: "search",
              arguments: { query: "test" },
            },
          ],
        },
      },
    ]);

    await runAgentLoop(
      provider,
      registry,
      [{ role: "user", content: "search" }],
      { maxIterations: 1, onEvent: (e) => events.push(e) }
    );

    // With maxIterations=1, only one iteration runs.
    // After tool:result, there is no iteration left, so NO reflexion prompt.
    const reflexionThinkingEvents = events.filter(
      (e) => e.type === "thinking" && e.content.includes("反思")
    );
    expect(reflexionThinkingEvents.length).toBe(0);

    // Messages should NOT contain reflexion prompt
    const reflexionMessages = events.filter(
      (e) => e.content && e.content.includes("Reflect on the tool result")
    );
    expect(reflexionMessages.length).toBe(0);
  });

  it("reflexion uses the REFLECT mode instructions", async () => {
    const events: any[] = [];
    const registry = new ToolRegistry();
    registry.register(
      {
        name: "search",
        description: "Search tool",
        execute: () => Effect.succeed({ content: "Found results" }),
      } as any,
      { name: "search", description: "Search", schema: {}, writeOnly: false }
    );

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
              arguments: { query: "ml" },
            },
          ],
        },
      },
      {
        pattern: "Reflect",
        response: {
          content: "Analysis complete.",
          stopReason: "stop",
        },
      },
    ]);

    const result = await runAgentLoop(
      provider,
      registry,
      [{ role: "user", content: "find papers" }],
      { maxIterations: 5, onEvent: (e) => events.push(e) }
    );

    // The reflexion message should contain the REFLECT instruction (inlined in loop.ts)
    const REFLECT_INSTRUCTION = "反思模式: 不要急于得出结论";
    const reflexionMessages = result.messages.filter(
      (m) =>
        m.role === "user" &&
        m.content.includes(REFLECT_INSTRUCTION)
    );
    expect(reflexionMessages.length).toBeGreaterThan(0);
  });

  it("provides meaningful reflexion content in the thinking event", async () => {
    const events: any[] = [];
    const registry = new ToolRegistry();
    registry.register(
      {
        name: "search",
        description: "Search tool",
        execute: () => Effect.succeed({ content: "Found results" }),
      } as any,
      { name: "search", description: "Search", schema: {}, writeOnly: false }
    );

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
              arguments: { query: "ml" },
            },
          ],
        },
      },
      {
        pattern: "Reflect",
        response: {
          content: "Done.",
          stopReason: "stop",
        },
      },
    ]);

    await runAgentLoop(
      provider,
      registry,
      [{ role: "user", content: "find papers" }],
      { maxIterations: 5, onEvent: (e) => events.push(e) }
    );

    const reflexionEvents = events.filter(
      (e) => e.type === "thinking" && e.content.includes("反思")
    );
    expect(reflexionEvents.length).toBeGreaterThan(0);

    // The thinking event content should mention planning next action
    const reflexionContent = reflexionEvents[0].content;
    expect(reflexionContent).toBeDefined();
    expect(reflexionContent.length).toBeGreaterThan(5);
  });
});
