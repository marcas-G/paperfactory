import * as Schema from "@effect/schema/Schema";

export const Experiment = Schema.Struct({
  experimentId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  protocolId: Schema.NullOr(Schema.UUID),
  hypothesisId: Schema.NullOr(Schema.UUID),
  title: Schema.NonEmptyString,
  status: Schema.Enums({
    PLANNED: "PLANNED",
    RUNNING: "RUNNING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
  }),
  resultIds: Schema.Array(Schema.UUID),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type Experiment = Schema.Schema.Type<typeof Experiment>;

export const createExperiment = (override: Partial<Experiment> = {}): Experiment => ({
  experimentId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  branchId: crypto.randomUUID(),
  protocolId: null,
  hypothesisId: null,
  title: "Experiment Title",
  status: "PLANNED",
  resultIds: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
