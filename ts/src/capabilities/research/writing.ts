import * as Effect from "effect/Effect";
import { Capability, createCapability, Skill } from "../generic/capability";
import type { Provider } from "@runtime/provider";

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
        {
          section: "Introduction",
          content: `Introduction to ${_input.topic ?? "the topic"}`,
        },
        { section: "Background", content: "Background information" },
        { section: "Methods", content: "Methodology description" },
        { section: "Results", content: "Results presentation" },
        {
          section: "Discussion",
          content: "Discussion of findings",
        },
      ],
    }),
};

const draftSkill: Skill = {
  name: "writing_draft",
  description: "Draft the document content using LLM",
  execute: (input: Record<string, unknown>) => {
    const outline = input.outline as Array<Record<string, unknown>>;
    const provider = input.provider as Provider | undefined;

    if (provider) {
      const sections = (outline ?? [])
        .map((s: any) => `${s.section}: ${s.content ?? ""}`)
        .join("\n");

      const prompt = `Write a comprehensive draft based on the following outline. Produce well-structured academic prose for each section:

${sections}`;

      return Effect.map(
        provider.sendMessages([
          {
            role: "user" as const,
            content: prompt,
          },
        ]),
        (response) => ({
          draft: response.content,
        })
      );
    }

    return Effect.succeed({
      draft: `Full draft of the document with ${(outline)?.length ?? 0} sections.`,
    });
  },
};

const reviewSkill: Skill = {
  name: "writing_review",
  description: "Review and score the draft using LLM",
  execute: (input: Record<string, unknown>) => {
    const draft = input.draft as string;
    const provider = input.provider as Provider | undefined;

    if (provider) {
      const prompt = `Review the following draft and provide a numeric score (0-10) and constructive feedback. Respond with format: "Score: X.X\nFeedback: [feedback text]":

${draft}`;

      return Effect.map(
        provider.sendMessages([
          {
            role: "user" as const,
            content: prompt,
          },
        ]),
        (response) => {
          const scoreMatch = response.content.match(/Score:\s*([\d.]+)/);
          const feedbackMatch =
            response.content.match(/Feedback:\s*(.+)/is)?.[1]?.trim() ??
            response.content;
          return {
            review: {
              score: scoreMatch
                ? parseFloat(scoreMatch[1])
                : 0,
              feedback: feedbackMatch ?? "No feedback provided",
            },
          };
        }
      );
    }

    return Effect.succeed({
      review: {
        score: 0.5,
        feedback:
          "Review requires LLM provider. Configure a provider for quality review.",
      },
    });
  },
};

export const writingCapability: Capability = createCapability(
  "writing",
  "Outline, draft, and review research documents",
  [outlineSkill, draftSkill, reviewSkill],
  [],
  (input: Record<string, unknown>) => {
    const provider = input.provider as Provider | undefined;
    return Effect.flatMap(
      outlineSkill.execute(input),
      (outlineResult) =>
        Effect.flatMap(
          draftSkill.execute({ ...outlineResult, provider }),
          (draftResult) =>
            Effect.flatMap(
              reviewSkill.execute({ ...draftResult, provider }),
              (reviewResult) =>
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
