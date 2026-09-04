import * as Schema from "@effect/schema/Schema";

export const Hypothesis = Schema.Struct({
  hypothesisId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  gapId: Schema.NullOr(Schema.UUID),
  statement: Schema.NonEmptyString,
  falsificationCondition: Schema.String.pipe(
    Schema.filter(
      s => s.length > 0,
      { message: () => "falsificationCondition must be a non-empty string" },
    ),
    Schema.filter(
      s => s.trim().length > 0,
      { message: () => "falsificationCondition must not be whitespace-only" },
    ),
  ),
  status: Schema.Enums({
    PROPOSED: "PROPOSED",
    ASSESSED: "ASSESSED",
    ACTIVE: "ACTIVE",
    CONFIRMED: "CONFIRMED",
    REJECTED: "REJECTED",
  }),
  supportingEvidenceIds: Schema.Array(Schema.UUID),
  conflictingEvidenceIds: Schema.Array(Schema.UUID),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type Hypothesis = Schema.Schema.Type<typeof Hypothesis>;

export const createHypothesis = (override: Partial<Hypothesis> = {}): Hypothesis => ({
  hypothesisId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  gapId: null,
  statement: "X causes Y under Z conditions",
  falsificationCondition: "If Y does not occur when X is applied under Z",
  status: "PROPOSED",
  supportingEvidenceIds: [],
  conflictingEvidenceIds: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
