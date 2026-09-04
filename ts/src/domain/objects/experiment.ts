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
  experimentId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
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
