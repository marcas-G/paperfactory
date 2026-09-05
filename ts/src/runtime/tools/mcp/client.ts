export interface MCPConfig {
  transport: "http" | "sse" | "stdio";
  url: string;
}

export interface MCPTool {
  name: string;
  description: string;
}

export interface MCPToolResult {
  content: string;
  isError: boolean;
}

export class MCPClient {
  readonly transport: string;
  readonly url: string;

  constructor(private config: MCPConfig) {
    this.transport = config.transport;
    this.url = config.url;
  }

  async listTools(): Promise<MCPTool[]> {
    if (this.transport !== "http") {
      throw new Error(`Transport ${this.transport} not supported yet`);
    }

    const resp = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
        id: 1,
      }),
    });

    if (!resp.ok) {
      throw new Error(`MCP tools/list failed: ${resp.status}`);
    }

    const data = await resp.json();
    return (data.result?.tools ?? []) as MCPTool[];
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    if (this.transport !== "http") {
      throw new Error(`Transport ${this.transport} not supported yet`);
    }

    try {
      const resp = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: toolName, arguments: args },
          id: 1,
        }),
      });

      if (!resp.ok) {
        return { content: `MCP call failed: ${resp.status}`, isError: true };
      }

      const data = await resp.json();
      const texts = data.result?.content
        ?.filter((c: any) => c.type === "text")
        .map((c: any) => c.text) ?? [];

      return {
        content: texts.join("\n"),
        isError: false,
      };
    } catch (err) {
      return { content: `MCP transport error: ${err}`, isError: true };
    }
  }
}
