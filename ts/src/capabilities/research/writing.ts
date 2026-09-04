import * as Effect from "effect/Effect";
import { Capability, createCapability, Skill } from "../generic/capability";

export interface WritingResult {
  outline: ReadonlyArray<{ section: string; content: string }>;
  draft: string;
  review: { score: number; feedback: string };
}

const outlineSkill: Skill = {
  name: "writing_outline",
  description: "Create a document outline",
  execute: (_input: Record<string, unknown>) =>
    Effect.succeed({
      outline: [
        { section: "Introduction", content: `Introduction to ${_input.topic ?? "the topic"}` },
        { section: "Background", content: "Background information" },
        { section: "Methods", content: "Methodology description" },
        { section: "Results", content: "Results presentation" },
        { section: "Discussion", content: "Discussion of findings" },
      ],
    }),
};

const draftSkill: Skill = {
  name: "writing_draft",
  description: "Draft the document content",
  execute: (_input: Record<string, unknown>) =>
    Effect.succeed({
      draft: `Full draft of the document with ${(_input.outline as Array<Record<string, unknown>>)?.length ?? 0} sections.`,
    }),
};

const reviewSkill: Skill = {
  name: "writing_review",
  description: "Review and score the draft",
  execute: (_input: Record<string, unknown>) =>
    Effect.succeed({
      review: {
        score: 0.85,
        feedback: "Well-structured draft with clear argumentation. Minor improvements needed in results section.",
      },
    }),
};

export const writingCapability: Capability = createCapability(
  "writing",
  "Outline, draft, and review research documents",
  [outlineSkill, draftSkill, reviewSkill],
  [],
  (input: Record<string, unknown>) => {
    return Effect.flatMap(outlineSkill.execute(input), (outlineResult) =>
      Effect.flatMap(draftSkill.execute(outlineResult), (draftResult) =>
        Effect.flatMap(reviewSkill.execute(draftResult), (reviewResult) =>
          Effect.succeed({
            outline: outlineResult.outline,
            draft: draftResult.draft,
            review: reviewResult.review,
          })
        )
      )
    );
  }
);
