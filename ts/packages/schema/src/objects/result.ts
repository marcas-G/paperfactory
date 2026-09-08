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
  resultId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  branchId: crypto.randomUUID(),
  experimentId: crypto.randomUUID(),
  summary: "Result summary",
  status: "RAW",
  data: {},
  metadata: {},
  createdAt: new Date(),
  ...override,
});
