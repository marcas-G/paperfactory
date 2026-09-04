import { describe, it, expect, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import { ToolRegistry } from "../../../src/runtime/tools/registry";
import { searchTool } from "../../../src/runtime/tools/builtins/search";
import { codeTool } from "../../../src/runtime/tools/builtins/code";
import { InMemoryFilesystem, createFilesystemTool } from "../../../src/runtime/tools/builtins/filesystem";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("registers and looks up tools", () => {
    registry.register(searchTool, {
      name: "search",
      description: "Search",
      schema: {},
      writeOnly: false,
    });
    expect(registry.get("search")).toBeDefined();
    expect(registry.has("search")).toBe(true);
  });

  it("returns undefined for unknown tool", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
    expect(registry.has("nonexistent")).toBe(false);
  });

  it("separates read and write tools", () => {
    registry.register(searchTool, {
      name: "search",
      description: "Search",
      schema: {},
      writeOnly: false,
    });
    const fs = new InMemoryFilesystem();
    registry.register(createFilesystemTool(fs), {
      name: "filesystem",
      description: "FS",
      schema: {},
      writeOnly: true,
    });

    const readTools = registry.listReadTools();
    const writeTools = registry.listWriteTools();

    expect(readTools.length).toBe(1);
    expect(readTools[0].name).toBe("search");
    expect(writeTools.length).toBe(1);
    expect(writeTools[0].name).toBe("filesystem");
  });

  it("executes registered tool", async () => {
    registry.register(codeTool, {
      name: "code",
      description: "Code",
      schema: {},
      writeOnly: false,
    });

    const result = await Effect.runPromise(
      registry.execute("code", { code: "print(1)", language: "python" })
    );
    expect(result.content).toContain("python");
  });

  it("fails for unregistered tool", async () => {
    const result = await Effect.runPromiseExit(
      registry.execute("nonexistent", {})
    );
    expect(result._tag).toBe("Failure");
  });

  it("lists all tools", () => {
    registry.register(searchTool, {
      name: "search",
      description: "Search",
      schema: {},
      writeOnly: false,
    });
    registry.register(codeTool, {
      name: "code",
      description: "Code",
      schema: {},
      writeOnly: false,
    });
    expect(registry.list().length).toBe(2);
  });
});
