import * as Effect from "effect/Effect";
import { Skill } from "../../../capabilities/generic/capability";
import { ToolOutput } from "../contracts";

export interface NetworkInput {
  url: string;
  method?: string;
  body?: string;
}

export const createNetworkTool = (): Skill => ({
  name: "network_fetch",
  description: "Fetch content from a URL with error handling",
  execute: (input: Record<string, unknown>) =>
    Effect.tryPromise({
      try: async () => {
        const url = (input.url as string) || "";
        const method = (input.method as string) || "GET";
        const body = input.body as string | undefined;

        if (!url) {
          return {
            type: "result" as const,
            content: "Error: No URL provided",
            isError: true,
          } as ToolOutput;
        }

        const response = await fetch(url, {
          method,
          ...(body && method !== "GET" && { body }),
          headers: { "Content-Type": "application/json" },
        });

        const text = await response.text();
        return {
          type: "result" as const,
          content: text,
          isError: !response.ok,
        } as ToolOutput;
      },
      catch: (err) => `Network error: ${err}`,
    }),
});
