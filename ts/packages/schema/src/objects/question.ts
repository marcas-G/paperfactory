import * as Schema from "@effect/schema/Schema";

export const QuestionStatus = Schema.Enums({
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  SCOPED: "SCOPED",
  ARCHIVED: "ARCHIVED",
} as const);

export const ResearchQuestion = Schema.Struct({
  questionId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  title: Schema.NonEmptyString,
  statement: Schema.NonEmptyString,
  domain: Schema.NonEmptyString,
  status: QuestionStatus,
  relatedKnowledgeIds: Schema.Array(Schema.UUID),
  parentQuestionId: Schema.NullOr(Schema.UUID),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type ResearchQuestion = Schema.Schema.Type<typeof ResearchQuestion>;
export type QuestionStatus = Schema.Schema.Type<typeof QuestionStatus>;

export const createQuestion = (override: Partial<ResearchQuestion> = {}): ResearchQuestion => ({
  questionId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  title: "Test Question",
  statement: "What is the relationship between X and Y?",
  domain: "Test Domain",
  status: "DRAFT",
  relatedKnowledgeIds: [],
  parentQuestionId: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});

/**
 * Validates the invariant: ACTIVE/SCOPED must have at least one relatedKnowledgeId.
 * Design §4.3 ResearchQuestion: "不变量: ACTIVE/SCOPED 必须至少关联一个 KnowledgeItem"
 *
 * Returns { isOk: true } if valid, { isOk: false, message } if invalid.
 */
export function validateQuestionInvariant(
  question: ResearchQuestion,
): { isOk: true } | { isOk: false; message: string } {
  if ((question.status === "ACTIVE" || question.status === "SCOPED") &&
      question.relatedKnowledgeIds.length === 0) {
    return {
      isOk: false,
      message: `${question.status} question must have at least one relatedKnowledgeId`,
    };
  }
  return { isOk: true };
}
