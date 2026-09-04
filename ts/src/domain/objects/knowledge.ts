import * as Schema from "@effect/schema/Schema";

export const KnowledgeItem = Schema.Struct({
  knowledgeId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  summary: Schema.NonEmptyString,
  sourceType: Schema.String,
  sourceIds: Schema.Array(Schema.UUID),
  status: Schema.Enums({
    DRAFT: "DRAFT",
    ASSESSED: "ASSESSED",
    VALIDATED: "VALIDATED",
    SUPERSEDED: "SUPERSEDED",
  }),
  certaintyLevel: Schema.Number.pipe(Schema.between(0, 1)),
  questionIds: Schema.Array(Schema.UUID),
  tags: Schema.Array(Schema.String),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
});

export type KnowledgeItem = Schema.Schema.Type<typeof KnowledgeItem>;

export const createKnowledgeItem = (override: Partial<KnowledgeItem> = {}): KnowledgeItem => ({
  knowledgeId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  summary: "Knowledge summary",
  sourceType: "paper",
  sourceIds: [],
  status: "DRAFT",
  certaintyLevel: 0.5,
  questionIds: [],
  tags: [],
  metadata: {},
  createdAt: new Date(),
  ...override,
});
