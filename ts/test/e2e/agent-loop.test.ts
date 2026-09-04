import { describe, it, expect, beforeEach } from "vitest";
import { runAgentLoop } from "@runtime/agent/loop";
import { MockProvider } from "@runtime/provider";
import { ToolRegistry } from "@runtime/tools/registry";
import { createFilesystemTool, InMemoryFilesystem } from "@runtime/tools/builtins/filesystem";
import { codeTool } from "@runtime/tools/builtins/code";

describe("Agent Loop E2E", () => {
  let toolRegistry: ToolRegistry;
  let filesystem: InMemoryFilesystem;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    filesystem = new InMemoryFilesystem();

    toolRegistry.register(createFilesystemTool(filesystem), {
      name: "filesystem",
      description: "Filesystem operations",
      schema: {},
      writeOnly: true,
    });

    toolRegistry.register(codeTool, {
      name: "code",
      description: "Execute code",
      schema: {},
      writeOnly: false,
    });
  });

  it("complete agent loop: prompt -> tool call -> tool result -> final response", async () => {
    const provider = new MockProvider([
      {
        pattern: "write",
        response: {
          content: "",
          stopReason: "tool_use",
          toolCalls: [
            {
              toolCallId: "tc_1",
              toolName: "filesystem",
              arguments: {
                operation: "write",
                path: "/tmp/hello.txt",
                data: "Hello, World!",
              },
            },
          ],
        },
      },
      {
        pattern: "result",
        response: {
          content: "I have written the file successfully. Here is the content: Hello, World!",
          stopReason: "end_turn",
        },
      },
    ]);

    const result = await runAgentLoop(provider, toolRegistry, [
      { role: "user", content: "Please write a file with hello world" },
    ]);

    expect(result.finalContent).toContain("Hello, World!");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe("filesystem");
    expect(result.messages.length).toBeGreaterThanOrEqual(3);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toContain("write");
    expect(result.messages[result.messages.length - 1].role).toBe("assistant");
  });

  it("multi-step tool execution", async () => {
    const provider = new MockProvider([
      {
        pattern: "Write",
        response: {
          content: "",
          stopReason: "tool_use",
          toolCalls: [
            {
              toolCallId: "tc_1",
              toolName: "filesystem",
              arguments: {
                operation: "write",
                path: "/tmp/data.txt",
                data: "test data",
              },
            },
          ],
        },
      },
      {
        pattern: "tc_1",
        response: {
          content: "",
          stopReason: "tool_use",
          toolCalls: [
            {
              toolCallId: "tc_2",
              toolName: "filesystem",
              arguments: {
                operation: "read",
                path: "/tmp/data.txt",
              },
            },
          ],
        },
      },
      {
        pattern: "tc_2",
        response: {
          content: "The file contains: test data",
          stopReason: "end_turn",
        },
      },
    ]);

    const result = await runAgentLoop(provider, toolRegistry, [
      { role: "user", content: "Write a file then read it back" },
    ]);

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].toolName).toBe("filesystem");
    expect(result.toolCalls[1].toolName).toBe("filesystem");
    expect(result.finalContent).toContain("test data");
  });

  it("agent loop with tool failure recovery", async () => {
    const provider = new MockProvider([
      {
        pattern: "missing",
        response: {
          content: "",
          stopReason: "tool_use",
          toolCalls: [
            {
              toolCallId: "tc_1",
              toolName: "filesystem",
              arguments: {
                operation: "read",
                path: "/tmp/nonexistent.txt",
              },
            },
          ],
        },
      },
      {
        pattern: "result",
        response: {
          content: "The file was not found. I will create it.",
          stopReason: "end_turn",
        },
      },
    ]);

    const result = await runAgentLoop(provider, toolRegistry, [
      { role: "user", content: "Read a missing file" },
    ]);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.finalContent).toContain("not found");
  });

  it("preserves message history", async () => {
    const provider = new MockProvider([
      {
        pattern: "",
        response: {
          content: "Final answer",
          stopReason: "end_turn",
        },
      },
    ]);

    const initialMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { role: "user", content: "First message" },
      { role: "assistant", content: "Acknowledged" },
    ];

    const result = await runAgentLoop(provider, toolRegistry, initialMessages);

    expect(result.messages.length).toBeGreaterThanOrEqual(
      initialMessages.length
    );
  });
});
