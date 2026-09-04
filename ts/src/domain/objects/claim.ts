import * as Schema from "@effect/schema/Schema";

export const Claim = Schema.Struct({
  claimId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  hypothesisId: Schema.NullOr(Schema.UUID),
  statement: Schema.NonEmptyString,
  supportingEvidenceIds: Schema.Array(Schema.UUID),
  status: Schema.Enums({
    PROPOSED: "PROPOSED",
    VALIDATED: "VALIDATED",
    RETRACTED: "RETRACTED",
  }),
  scope: Schema.String,
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type Claim = Schema.Schema.Type<typeof Claim>;

export const createClaim = (override: Partial<Claim> = {}): Claim => ({
  claimId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  hypothesisId: null,
  statement: "Claim statement",
  supportingEvidenceIds: [],
  status: "PROPOSED",
  scope: "",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
