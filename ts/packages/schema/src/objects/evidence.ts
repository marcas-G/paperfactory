import * as Schema from "@effect/schema/Schema";

export const Evidence = Schema.Struct({
  evidenceId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  resultId: Schema.NullOr(Schema.UUID),
  summary: Schema.NonEmptyString,
  direction: Schema.Enums({
    SUPPORTING: "SUPPORTING",
    CONFLICTING: "CONFLICTING",
    NEUTRAL: "NEUTRAL",
  }),
  status: Schema.Enums({
    PROPOSED: "PROPOSED",
    VALIDATED: "VALIDATED",
    INVALIDATED: "INVALIDATED",
  }),
  strength: Schema.Number.pipe(Schema.between(0, 1)),
  scope: Schema.String,
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
});

export type Evidence = Schema.Schema.Type<typeof Evidence>;

export const createEvidence = (override: Partial<Evidence> = {}): Evidence => ({
  evidenceId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  branchId: crypto.randomUUID(),
  resultId: null,
  summary: "Evidence summary",
  direction: "SUPPORTING",
  status: "PROPOSED",
  strength: 0.5,
  scope: "",
  metadata: {},
  createdAt: new Date(),
  ...override,
});
