import { BaseTool, ToolInput, ToolOutput } from "../contracts";
import * as Effect from "effect/Effect";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchToolConfig {
  endpoint?: string;
  headers?: Record<string, string>;
  maxResults?: number;
}

const DEFAULT_ENDPOINT =
  "https://api.semanticscholar.org/graph/v1/paper/search";

export function createSearchTool(
  config: SearchToolConfig = {}
): BaseTool {
  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
  const headers = config.headers ?? {};
  const maxResults = config.maxResults ?? 10;

  const searchWeb = async (
    query: string
  ): Promise<ReadonlyArray<SearchResult>> => {
    if (!endpoint) {
      return [];
    }

    try {
      const url = `${endpoint}?query=${encodeURIComponent(query)}`;
      const response = await globalThis.fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        },
      });

      if (!response.ok) {
        return [];
      }

      const parsed = await response.json();

      const results: SearchResult[] = [];
      const items = parsed.data ?? parsed.results ?? parsed;
      if (Array.isArray(items)) {
        for (const item of items.slice(0, maxResults)) {
          results.push({
            title: String(item.title ?? ""),
            url: String(item.url ?? ""),
            snippet: String(item.snippet ?? item.abstract ?? ""),
          });
        }
      }

      return results;
    } catch {
      return [];
    }
  };

  const execFn = async (
    input: ToolInput
  ): Promise<ToolOutput> => {
    const query = (input.query as string) ?? "";
    try {
      const results = await searchWeb(query);
      return {
        content: JSON.stringify({
          query,
          results,
          count: results.length,
        }),
      };
    } catch (err) {
      return {
        content: JSON.stringify({
          query,
          results: [],
          count: 0,
          error: String(err),
        }),
      };
    }
  };

  return {
    name: "search",
    description: "Search for academic papers and documents",
    execute: (input: ToolInput): Effect.Effect<ToolOutput, string> =>
      Effect.tryPromise({
        try: () => execFn(input),
        catch: (error) => String(error),
      }),
  };
}

export const searchTool: BaseTool = createSearchTool();
