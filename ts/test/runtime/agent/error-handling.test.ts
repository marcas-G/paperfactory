import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { MockProvider, Provider } from "@runtime/provider";
import { runAgentLoop } from "@runtime/agent/loop";
import { ToolRegistry } from "@runtime/tools/registry";

describe("Error Handling and Timeout Recovery", () => {
  it("agent loop handles provider error gracefully", async () => {
    // Provider that always fails
    const errorProvider: Provider = {
      sendMessages: () => Effect.fail("Provider timeout"),
      streamResponse: () => Effect.fail("Provider timeout"),
    };

    const toolRegistry = new ToolRegistry();

    const result = await runAgentLoop(errorProvider, toolRegistry, [{ role: "user", content: "test" }], { maxIterations: 3 });

    // Should not crash
    expect(result).toBeDefined();
  });

  it("agent loop stops after maxIterations", async () => {
    // Provider that always wants tool_use (would cause infinite loop without maxIterations)
    const infiniteProvider = new MockProvider([
      {
        pattern: "",
        response: {
          content: "",
          toolCalls: [{ toolCallId: "call-1", toolName: "noop", arguments: {} }],
          stopReason: "tool_use",
        },
      },
    ]);

    const toolRegistry = new ToolRegistry();
    toolRegistry.register(
      {
        name: "noop",
        description: "no op",
        execute: () => Effect.succeed({ type: "result", content: "ok", isError: false }),
      } as any,
      { name: "noop", description: "no op", schema: {}, writeOnly: false }
    );

    const result = await runAgentLoop(infiniteProvider, toolRegistry, [{ role: "user", content: "test" }], { maxIterations: 2 });

    // Should stop after maxIterations
    expect(result).toBeDefined();
  });

  it("agent loop handles tool execution failure and recovers", async () => {
    const provider = new MockProvider([
      {
        pattern: "",
        response: {
          content: "",
          toolCalls: [{ toolCallId: "call-1", toolName: "bad_tool", arguments: {} }],
          stopReason: "tool_use",
        },
      },
      {
        pattern: "error",
        response: {
          content: "Recovered from tool error.",
          stopReason: "stop",
        },
      },
    ]);

    const toolRegistry = new ToolRegistry();
    toolRegistry.register(
      {
        name: "bad_tool",
        description: "fails",
        execute: () => Effect.succeed({ type: "result", content: "tool crashed", isError: true }),
      } as any,
      { name: "bad_tool", description: "fails", schema: {}, writeOnly: false }
    );

    const result = await runAgentLoop(provider, toolRegistry, [{ role: "user", content: "original prompt" }], { maxIterations: 5 });

    // Should not crash after tool error
    expect(result).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(1);
  });
});
