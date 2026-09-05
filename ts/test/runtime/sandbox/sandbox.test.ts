import { describe, it, expect } from "vitest";

describe("Sandbox Execution", () => {
  it("sandbox executes code via science-service", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.resolve(
        new Response(JSON.stringify({ output: "4", isError: false }), { status: 200 })
      );
    }) as any;

    try {
      const { Sandbox } = await import("@runtime/sandbox/sandbox");
      const sandbox = new Sandbox();

      const result = await sandbox.execute({
        language: "python",
        code: "print(2 + 2)",
      });

      expect(result.output).toContain("4");
      expect(result.isError).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("sandbox captures errors from invalid code", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({ output: "NameError: undefined_function is not defined", isError: true }),
          { status: 200 }
        )
      );
    }) as any;

    try {
      const { Sandbox } = await import("@runtime/sandbox/sandbox");
      const sandbox = new Sandbox();

      const result = await sandbox.execute({
        language: "python",
        code: "undefined_function()",
      });

      expect(result.isError).toBe(true);
      expect(result.output).toContain("NameError");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("sandbox handles transport errors gracefully", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.reject(new Error("ECONNREFUSED"));
    }) as any;

    try {
      const { Sandbox } = await import("@runtime/sandbox/sandbox");
      const sandbox = new Sandbox();

      const result = await sandbox.execute({
        language: "python",
        code: "print(1)",
      });

      expect(result.isError).toBe(true);
      expect(result.output).toContain("ECONNREFUSED");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("sandbox enforces timeout on slow code", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AbortError")), 100)
      );
    }) as any;

    try {
      const { Sandbox } = await import("@runtime/sandbox/sandbox");
      const sandbox = new Sandbox();

      const result = await sandbox.execute({
        language: "python",
        code: "import time; time.sleep(60)",
        timeoutMs: 200,
      });

      expect(result.isError).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
