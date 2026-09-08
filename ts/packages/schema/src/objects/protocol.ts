import * as Schema from "@effect/schema/Schema";

// Design §4.3 Protocol: 实验协议。FROZEN 后不可修改由 control 层 gate 保障
// (actions: review_protocol → freeze_protocol → supersede_protocol)。
export const Protocol = Schema.Struct({
  protocolId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  hypothesisId: Schema.UUID,
  title: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String),
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
  protocolId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  branchId: crypto.randomUUID(),
  hypothesisId: crypto.randomUUID(),
  title: "Protocol Title",
  description: null,
  steps: [],
  status: "DRAFT",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
