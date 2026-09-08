import * as Schema from "@effect/schema/Schema";

// 投稿对象：把 Report 投往目标 venue 的记录。
// 生命周期 READY → SUBMITTED → UNDER_REVIEW → ACCEPTED | REJECTED
// （persistence DDL: status DEFAULT 'READY'）。
export const Submission = Schema.Struct({
  submissionId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  reportId: Schema.UUID,
  venue: Schema.NonEmptyString,
  status: Schema.Enums({
    READY: "READY",
    SUBMITTED: "SUBMITTED",
    UNDER_REVIEW: "UNDER_REVIEW",
    ACCEPTED: "ACCEPTED",
    REJECTED: "REJECTED",
  }),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type Submission = Schema.Schema.Type<typeof Submission>;

export const createSubmission = (
  override: Partial<Submission> = {}
): Submission => ({
  submissionId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  branchId: crypto.randomUUID(),
  reportId: crypto.randomUUID(),
  venue: "Target Journal",
  status: "READY",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
