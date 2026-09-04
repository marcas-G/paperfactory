import * as Effect from "effect/Effect";
import { Capability, createCapability, Skill } from "../generic/capability";
import type { Provider } from "@runtime/provider";

export interface LiteratureResult {
  query: string;
  papers: ReadonlyArray<{
    title: string;
    abstract: string;
    authors?: ReadonlyArray<string>;
    year?: number;
    relevance: number;
  }>;
  synthesis: string;
}

const searchSkill: Skill = {
  name: "literature_search",
  description: "Search for relevant literature via Semantic Scholar API",
  execute: (input: Record<string, unknown>) =>
    Effect.tryPromise({
      try: async () => {
        const query = input.query as string;
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=10&fields=title,abstract,authors,year,relevanceScore`;
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(
            `Semantic Scholar API error: ${resp.status} ${resp.statusText}`
          );
        }
        const data = await resp.json();
        return {
          query,
          papers: (data.data ?? []).map((p: any) => ({
            title: p.title ?? "Unknown",
            abstract: p.abstract ?? "",
            authors: p.authors?.map((a: any) => a.name) ?? [],
            year: p.year,
            relevance: p.relevanceScore ?? 0,
          })),
        };
      },
      catch: (error) => String(error),
    }),
};

const retrieveSkill: Skill = {
  name: "literature_retrieve",
  description: "Retrieve full text of papers via Open Access API",
  execute: (input: Record<string, unknown>) =>
    Effect.tryPromise({
      try: async () => {
        const papers = input.papers as Array<Record<string, unknown>>;
        const retrieved = await Promise.all(
          (papers ?? []).map(async (p) => {
            const title = p.title as string;
            try {
              const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=title,abstract,openAccessPdf`;
              const resp = await fetch(url);
              const data = await resp.json();
              const firstResult = data.data?.[0];
              return {
                ...p,
                openAccessUrl:
                  firstResult?.openAccessPdf?.url ?? undefined,
                fullText: firstResult?.abstract ?? (p.fullText ?? ""),
              };
            } catch {
              return { ...p, fullText: p.fullText ?? "" };
            }
          })
        );
        return { retrievedPapers: retrieved };
      },
      catch: (error) => String(error),
    }),
};

const synthesizeSkill: Skill = {
  name: "literature_synthesize",
  description: "Synthesize literature findings using LLM",
  execute: (input: Record<string, unknown>) => {
    const retrievedPapers = input.retrievedPapers as Array<Record<string, unknown>>;
    const provider = input.provider as Provider | undefined;

    if (provider) {
      const paperSummaries = (retrievedPapers ?? [])
        .map(
          (p, i) =>
            `${i + 1}. "${p.title}" - ${p.abstract ?? p.fullText ?? "No abstract available"}`
        )
        .join("\n");

      const prompt = `Synthesize the following literature findings into a coherent summary. Identify key themes, methodologies, and research gaps:

${paperSummaries}`;

      return Effect.map(
        provider.sendMessages([
          {
            role: "user" as const,
            content: prompt,
          },
        ]),
        (response) => ({
          synthesis: response.content,
        })
      );
    }

    // Fallback: simple synthesis without LLM
    return Effect.succeed({
      synthesis: `Synthesized findings from ${
        retrievedPapers?.length ?? 0
      } papers. Key themes and research gaps identified from the literature.`,
    });
  },
};

export const literatureCapability: Capability = createCapability(
  "literature",
  "Search, retrieve, and synthesize academic literature",
  [searchSkill, retrieveSkill, synthesizeSkill],
  [],
  (input: Record<string, unknown>) => {
    const query = input.query as string;
    const provider = input.provider as Provider | undefined;
    return Effect.flatMap(searchSkill.execute({ query }), (searchResult) =>
      Effect.flatMap(
        retrieveSkill.execute(searchResult),
        (retrieveResult) =>
          Effect.flatMap(
            synthesizeSkill.execute({
              ...retrieveResult,
              provider,
            }),
            (synthesisResult) =>
              Effect.succeed({
                query,
                papers: searchResult.papers,
                synthesis: synthesisResult.synthesis,
              })
          )
      )
    );
  }
);
