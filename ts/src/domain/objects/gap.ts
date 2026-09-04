import * as Schema from "@effect/schema/Schema";

export const ResearchGap = Schema.Struct({
  gapId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  questionId: Schema.UUID,
  description: Schema.NonEmptyString,
  status: Schema.Enums({
    IDENTIFIED: "IDENTIFIED",
    VALIDATED: "VALIDATED",
    ADDRESSED: "ADDRESSED",
    CLOSED: "CLOSED",
  }),
  relatedKnowledgeIds: Schema.Array(Schema.UUID),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type ResearchGap = Schema.Schema.Type<typeof ResearchGap>;

export const createResearchGap = (override: Partial<ResearchGap> = {}): ResearchGap => ({
  gapId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  questionId: "00000000-0000-4000-a000-000000000000",
  description: "Research gap description",
  status: "IDENTIFIED",
  relatedKnowledgeIds: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
