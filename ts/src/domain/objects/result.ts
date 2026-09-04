import * as Schema from "@effect/schema/Schema";

export const Result = Schema.Struct({
  resultId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  experimentId: Schema.UUID,
  summary: Schema.String,
  status: Schema.Enums({
    RAW: "RAW",
    VALIDATED: "VALIDATED",
    INVALIDATED: "INVALIDATED",
  }),
  data: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
});

export type Result = Schema.Schema.Type<typeof Result>;

export const createResult = (override: Partial<Result> = {}): Result => ({
  resultId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  experimentId: "00000000-0000-4000-a000-000000000000",
  summary: "Result summary",
  status: "RAW",
  data: {},
  metadata: {},
  createdAt: new Date(),
  ...override,
});
