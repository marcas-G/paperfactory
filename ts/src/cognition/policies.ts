import type { KnowledgeItem } from "@domain/objects/knowledge";
import type { Result } from "@domain/objects/result";
import type { Evidence } from "@domain/objects/evidence";
import type { Submission } from "@domain/objects/submission";

export interface FilteredContext {
  knowledgeItems: KnowledgeItem[];
  results: Result[];
  evidence?: Evidence[];
  submissions?: Submission[];
}

export type BlindReviewPolicyType =
  | "HIDE_TEST_SET"
  | "HIDE_FUTURE_RESULT"
  | "HIDE_CONFIRMATORY_RESULT"
  | "HIDE_REVIEW_OUTCOME"
  | null;

export function applyBlindReviewPolicy(
  context: FilteredContext,
  policy: BlindReviewPolicyType,
): FilteredContext {
  if (!policy) {
    return { ...context };
  }

  switch (policy) {
    case "HIDE_TEST_SET":
      return {
        ...context,
        knowledgeItems: context.knowledgeItems.filter(
          (item) => !item.tags.includes("test-set"),
        ),
      };

    case "HIDE_FUTURE_RESULT":
      return {
        ...context,
        results: context.results.filter((r) => r.status !== "RAW"),
      };

    case "HIDE_CONFIRMATORY_RESULT":
      return {
        ...context,
        evidence: context.evidence?.filter((e) => e.direction !== "SUPPORTING"),
      };

    case "HIDE_REVIEW_OUTCOME":
      return {
        ...context,
        submissions: context.submissions?.map((s) => ({
          ...s,
          metadata: {},
        })),
      };

    default:
      return { ...context };
  }
}
