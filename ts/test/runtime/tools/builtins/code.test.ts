import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createCodeTool, CodeToolConfig } from "@runtime/tools/builtins/code";

describe("Code Tool", () => {
  it("executes javascript code", async () => {
    const tool = createCodeTool();

    const result = await Effect.runPromise(
      tool.execute({
        code: "console.log('hello')",
        language: "javascript",
      })
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.language).toBe("javascript");
    expect(parsed.exitCode).toBe(0);
    expect(parsed.stdout).toContain("hello");
  });

  it("handles code error", async () => {
    const tool = createCodeTool();

    const result = await Effect.runPromise(
      tool.execute({
        code: "throw new Error('test error')",
        language: "javascript",
      })
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.exitCode).toBe(1);
    expect(parsed.stderr).toBeTruthy();
  });

  it("respects timeout", async () => {
    const tool = createCodeTool({
      timeout: 500,
    } as CodeToolConfig);

    const result = await Effect.runPromise(
      tool.execute({
        code: "const start = Date.now(); while (Date.now() - start < 60000) {}",
        language: "javascript",
      })
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.timedOut).toBe(true);
    expect(parsed.exitCode).toBe(1);
  });

  it("rejects disallowed language", async () => {
    const tool = createCodeTool({
      allowedLanguages: ["javascript"],
    });

    const result = await Effect.runPromise(
      tool.execute({
        code: "echo hello",
        language: "bash",
      })
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.stderr).toContain("not allowed");
  });

  it("has correct tool info", async () => {
    const tool = createCodeTool();

    expect(tool.name).toBe("code");
    expect(tool.description).toContain("Execute");
  });

  it("executes arithmetic code", async () => {
    const tool = createCodeTool();

    const result = await Effect.runPromise(
      tool.execute({
        code: "console.log(2 + 3)",
        language: "javascript",
      })
    );

    const parsed = JSON.parse(result.content);
    expect(parsed.stdout).toContain("5");
  });
});
