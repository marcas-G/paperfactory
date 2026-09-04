import * as Effect from "effect/Effect";
import { Capability, createCapability, Skill } from "../generic/capability";

export interface LiteratureResult {
  query: string;
  papers: ReadonlyArray<{ title: string; abstract: string; relevance: number }>;
  synthesis: string;
}

const searchSkill: Skill = {
  name: "literature_search",
  description: "Search for relevant literature",
  execute: (input: Record<string, unknown>) =>
    Effect.succeed({
      query: input.query as string,
      papers: [
        { title: "Paper A", abstract: "Abstract A", relevance: 0.9 },
        { title: "Paper B", abstract: "Abstract B", relevance: 0.7 },
      ],
    }),
};

const retrieveSkill: Skill = {
  name: "literature_retrieve",
  description: "Retrieve full text of papers",
  execute: (input: Record<string, unknown>) =>
    Effect.succeed({
      retrievedPapers: (input.papers as Array<Record<string, unknown>>)?.map((p) => ({
        ...p,
        fullText: `Full text of ${p.title}`,
      })) ?? [],
    }),
};

const synthesizeSkill: Skill = {
  name: "literature_synthesize",
  description: "Synthesize literature findings",
  execute: (input: Record<string, unknown>) =>
    Effect.succeed({
      synthesis: `Synthesized findings from ${(input.retrievedPapers as Array<Record<string, unknown>>)?.length ?? 0} papers: Key themes identified.`,
    }),
};

export const literatureCapability: Capability = createCapability(
  "literature",
  "Search, retrieve, and synthesize academic literature",
  [searchSkill, retrieveSkill, synthesizeSkill],
  [],
  (input: Record<string, unknown>) => {
    const query = input.query as string;
    return Effect.flatMap(searchSkill.execute({ query }), (searchResult) =>
      Effect.flatMap(retrieveSkill.execute(searchResult), (retrieveResult) =>
        Effect.flatMap(synthesizeSkill.execute(retrieveResult), (synthesisResult) =>
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
