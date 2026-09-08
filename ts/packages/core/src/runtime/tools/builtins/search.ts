import { BaseTool, ToolInput, ToolOutput } from "../contracts";
import * as Effect from "effect/Effect";

export interface PaperMeta {
  paperId: string;
  title: string;
  abstract: string;
  authors: ReadonlyArray<string>;
  year: number | null;
  url: string;
  citationCount: number;
  relevanceScore: number;
  openAccessPdf: string | null;
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
  ): Promise<ReadonlyArray<PaperMeta>> => {
    if (!endpoint) {
      return [];
    }

    try {
      const url = `${endpoint}?query=${encodeURIComponent(query)}&limit=${maxResults}&fields=title,abstract,authors,year,url,citationCount,relevanceScore,openAccessPdf,twitterId`;
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
      const items = parsed.data ?? parsed.results ?? parsed;

      if (!Array.isArray(items)) {
        return [];
      }

      const results: PaperMeta[] = [];
      for (const item of items.slice(0, maxResults)) {
        const authors = item.authors
          ? item.authors.map((a: any) => a.name ?? "Unknown").filter(Boolean)
          : [];
        results.push({
          paperId: item.twitterId ?? item.paperId ?? `${Date.now()}-${Math.random()}`,
          title: String(item.title ?? ""),
          abstract: String(item.abstract ?? ""),
          authors,
          year: item.year ?? null,
          url: String(item.url ?? item.openAccessPdf?.url ?? ""),
          citationCount: item.citationCount ?? 0,
          relevanceScore: item.relevanceScore ?? 0,
          openAccessPdf: item.openAccessPdf?.url ?? null,
        });
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
        }, null, 2),
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
    description: "Search Semantic Scholar for academic papers. Returns full metadata: title, abstract, authors, year, citationCount, url, openAccessPdf.",
    execute: (input: ToolInput): Effect.Effect<ToolOutput, string> =>
      Effect.tryPromise({
        try: () => execFn(input),
        catch: (error) => String(error),
      }),
  };
}

export const searchTool: BaseTool = createSearchTool();
