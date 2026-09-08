export interface SandboxInput {
  language: "python" | "javascript";
  code: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface SandboxResult {
  output: string;
  isError: boolean;
}

export class Sandbox {
  private scienceServiceUrl: string;

  constructor() {
    this.scienceServiceUrl =
      process.env.SCIENCE_SERVICE_URL || "http://science-service:8001";
  }

  async execute(input: SandboxInput): Promise<SandboxResult> {
    const timeout = input.timeoutMs ?? 30000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const resp = await fetch(`${this.scienceServiceUrl}/api/sandbox/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: input.language,
          code: input.code,
          timeout: timeout,
          env: input.env || {},
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const text = await resp.text();
        return { output: text || `Sandbox returned ${resp.status}`, isError: true };
      }

      const data = await resp.json();
      return {
        output: data.output ?? "",
        isError: data.isError ?? false,
      };
    } catch (err: any) {
      if (err.name === "AbortError" || err.code === "ECONNABORTED") {
        return { output: "Execution timeout exceeded", isError: true };
      }
      return { output: `Sandbox error: ${err.message || err}`, isError: true };
    }
  }
}
