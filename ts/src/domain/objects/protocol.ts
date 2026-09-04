import * as Schema from "@effect/schema/Schema";

export const Protocol = Schema.Struct({
  protocolId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  hypothesisId: Schema.UUID,
  title: Schema.NonEmptyString,
  description: Schema.String,
  steps: Schema.Array(Schema.String),
  status: Schema.Enums({
    DRAFT: "DRAFT",
    REVIEWED: "REVIEWED",
    FROZEN: "FROZEN",
    SUPERSEDED: "SUPERSEDED",
  }),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type Protocol = Schema.Schema.Type<typeof Protocol>;

export const createProtocol = (override: Partial<Protocol> = {}): Protocol => ({
  protocolId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  hypothesisId: "00000000-0000-4000-a000-000000000000",
  title: "Protocol Title",
  description: "Protocol description",
  steps: [],
  status: "DRAFT",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
