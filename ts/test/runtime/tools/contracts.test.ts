import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { BaseTool, ToolInput, ToolOutput } from "../../../src/runtime/tools/contracts";

describe("Tool Contracts", () => {
  const mockTool: BaseTool = {
    name: "mock",
    description: "A mock tool",
    execute: (_input: ToolInput) => {
      return Effect.succeed({ content: "mock output" } as ToolOutput);
    },
  };

  it("implements required interface", () => {
    expect(mockTool.name).toBe("mock");
    expect(mockTool.description).toBeTruthy();
    expect(typeof mockTool.execute).toBe("function");
  });

  it("execute returns ToolOutput", async () => {
    const result = await Effect.runPromise(mockTool.execute({}));
    expect(result).toBeDefined();
  });

  it("read/write classification", () => {
    const readTool = {
      name: "read_file",
      description: "Read a file",
      writeOnly: false,
    };
    const writeTool = {
      name: "write_file",
      description: "Write a file",
      writeOnly: true,
    };
    expect(readTool.writeOnly).toBe(false);
    expect(writeTool.writeOnly).toBe(true);
  });
});
