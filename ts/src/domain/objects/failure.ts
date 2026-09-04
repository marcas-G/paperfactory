import * as Schema from "@effect/schema/Schema";

export const ResearchFailure = Schema.Struct({
  failureId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  failedHypothesisId: Schema.NullOr(Schema.UUID),
  failureType: Schema.Enums({
    SCIENTIFIC: "SCIENTIFIC",
    METHODOLOGICAL: "METHODOLOGICAL",
    TECHNICAL: "TECHNICAL",
    RESOURCE: "RESOURCE",
  }),
  rootCause: Schema.NonEmptyString,
  evidence: Schema.String,
  reusableLesson: Schema.String,
  retryCondition: Schema.String,
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
});

export type ResearchFailure = Schema.Schema.Type<typeof ResearchFailure>;

export const createResearchFailure = (override: Partial<ResearchFailure> = {}): ResearchFailure => ({
  failureId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  failedHypothesisId: null,
  failureType: "SCIENTIFIC",
  rootCause: "Root cause description",
  evidence: "",
  reusableLesson: "",
  retryCondition: "",
  metadata: {},
  createdAt: new Date(),
  ...override,
});
