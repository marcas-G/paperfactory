import * as Effect from "effect/Effect";
import type { BaseTool, ToolInput, ToolOutput } from "../contracts";

export interface ArxivPaper {
  title: string;
  authors: string[];
  summary: string;
  url: string;
  published: string;
}

/**
 * arXiv Atom feed 轻量解析（免依赖）。
 * arXiv API: http://export.arxiv.org/api/query?search_query=all:...&max_results=N
 */
function parseAtom(xml: string): ArxivPaper[] {
  const entries = xml.split(/<entry>/).slice(1);
  return entries.map((entry) => {
    const pick = (tag: string) => {
      const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return match ? match[1].replace(/\s+/g, " ").trim() : "";
    };
    return {
      title: pick("title"),
      authors: [...entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g)].map((m) => m[1].trim()),
      summary: pick("summary"),
      url: pick("id"),
      published: pick("published"),
    };
  });
}

/**
 * Semantic Scholar 检索（全学科覆盖：含心理学/教育学/医学，arXiv 没有）。
 * 免费无 key；429 限流时退避一次重试。
 */
async function searchSemanticScholar(query: string, maxResults: number): Promise<ArxivPaper[]> {
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}` +
    `&fields=title,abstract,year,url,citationCount,authors&limit=${maxResults}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url);
    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    if (!response.ok) throw new Error(`Semantic Scholar API returned ${response.status}`);
    const body = (await response.json()) as {
      data?: Array<{
        title?: string;
        abstract?: string | null;
        year?: number;
        url?: string;
        citationCount?: number;
        authors?: Array<{ name?: string }>;
      }>;
    };
    return (body.data ?? []).map((paper) => ({
      title: paper.title ?? "",
      authors: (paper.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
      summary: paper.abstract ?? "",
      url: paper.url ?? "",
      published: String(paper.year ?? ""),
    }));
  }
  throw new Error("Semantic Scholar rate limited");
}

async function searchArxiv(query: string, maxResults: number): Promise<ArxivPaper[]> {
  const baseUrl = "https://export.arxiv.org/api/query";
  // 两级策略：精确短语优先（质量高），0 命中降级宽松词匹配（召回优先）
  const urls = [
    `${baseUrl}?search_query=all:%22${encodeURIComponent(query).replace(/%20/g, "+")}%22&max_results=${maxResults}&sortBy=relevance`,
    `${baseUrl}?search_query=all:${encodeURIComponent(query).replace(/%20/g, "+")}&max_results=${maxResults}&sortBy=relevance`,
  ];
  let lastError = "arXiv unreachable";
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`arXiv API returned ${response.status}`);
        const papers = parseAtom(await response.text());
        if (papers.length > 0) return papers;
        break; // 0 命中：换下一级查询
      } catch (error) {
        lastError = String(error);
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }
  throw new Error(lastError);
}

/**
 * 真实文献检索工具：Semantic Scholar（全学科）优先，arXiv 兜底。
 * 产出携带真实来源 URL——"evidence changes state" 的物质基础。
 */
export const literatureSearchTool: BaseTool = {
  name: "literature_search",
  description:
    "Search real academic papers (Semantic Scholar first, arXiv fallback). Returns structured results with real, citable sources.",
  execute(input: ToolInput): Effect.Effect<ToolOutput, string> {
    return Effect.tryPromise({
      try: async () => {
        const query = String(input.query ?? "").trim();
        if (!query) throw new Error("query is required");
        const maxResults = Math.min(Math.max(Number(input.maxResults ?? 5), 1), 10);
        let papers: ArxivPaper[] = [];
        let source = "semantic-scholar";
        try {
          papers = await searchSemanticScholar(query, maxResults);
        } catch {
          source = "arxiv";
          papers = await searchArxiv(query, maxResults);
        }
        if (papers.length === 0) throw new Error(`no results for "${query}"`);
        return { content: JSON.stringify(papers), papers, source } as ToolOutput;
      },
      catch: (error) => `literature_search failed: ${String(error)}`,
    });
  },
};
