import * as Schema from "@effect/schema/Schema";

export const Submission = Schema.Struct({
  submissionId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  reportId: Schema.UUID,
  venue: Schema.NonEmptyString,
  status: Schema.Enums({
    READY: "READY",
    MATCHED: "MATCHED",
    FITTED: "FITTED",
    SUBMITTED: "SUBMITTED",
    UNDER_REVIEW: "UNDER_REVIEW",
    REBUTTAL_READY: "REBUTTAL_READY",
    ACCEPTED: "ACCEPTED",
    REJECTED: "REJECTED",
  }),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type Submission = Schema.Schema.Type<typeof Submission>;

export const createSubmission = (override: Partial<Submission> = {}): Submission => ({
  submissionId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  reportId: "00000000-0000-4000-a000-000000000000",
  venue: "Nature",
  status: "READY",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
