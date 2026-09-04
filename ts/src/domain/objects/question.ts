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
