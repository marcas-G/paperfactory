import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";

describe("MCP Protocol Integration", () => {
  it("MCPClient connects to HTTP transport", async () => {
    const { MCPClient } = await import("@runtime/tools/mcp/client");
    const client = new MCPClient({
      transport: "http",
      url: "http://localhost:3000/mcp",
    });

    expect(client.transport).toBe("http");
    expect(client.url).toBe("http://localhost:3000/mcp");
  });

  it("MCPClient lists available tools from server", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            result: {
              tools: [
                { name: "calculator", description: "Calculate expressions" },
                { name: "weather", description: "Get weather data" },
              ],
            },
            id: 1,
          }),
          { status: 200 }
        )
      );
    }) as any;

    try {
      const { MCPClient } = await import("@runtime/tools/mcp/client");
      const client = new MCPClient({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });

      const tools = await client.listTools();
      expect(tools.length).toBe(2);
      expect(tools[0].name).toBe("calculator");
      expect(tools[1].name).toBe("weather");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("MCPClient calls a tool via HTTP", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: "42" }] },
            id: 1,
          }),
          { status: 200 }
        )
      );
    }) as any;

    try {
      const { MCPClient } = await import("@runtime/tools/mcp/client");
      const client = new MCPClient({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });

      const result = await client.callTool("calculator", { expression: "6*7" });
      expect(result.content).toContain("42");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("MCPClient handles transport errors gracefully", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.reject(new Error("ECONNREFUSED"));
    }) as any;

    try {
      const { MCPClient } = await import("@runtime/tools/mcp/client");
      const client = new MCPClient({
        transport: "http",
        url: "http://unreachable:9999/mcp",
      });

      const result = await client.callTool("test", {});
      expect(result.isError).toBe(true);
      expect(result.content).toContain("ECONNREFUSED");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
