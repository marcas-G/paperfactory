import * as Schema from "@effect/schema/Schema";

// Design §4.3 ResearchFailure: 失败必须保存（§31）。
// failureType 区分 Runtime Failure 与 Scientific Failure（宪法 §26）：
// RUNTIME 可重试；SCIENTIFIC 必须进入科研分析，不得自动 retry。
export const ResearchFailure = Schema.Struct({
  failureId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  failedHypothesisId: Schema.NullOr(Schema.UUID),
  failureType: Schema.Enums({
    RUNTIME: "RUNTIME",
    SCIENTIFIC: "SCIENTIFIC",
  }),
  rootCause: Schema.NonEmptyString,
  evidence: Schema.NullOr(Schema.String),
  reusableLesson: Schema.NullOr(Schema.String),
  retryCondition: Schema.NullOr(Schema.String),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type ResearchFailure = Schema.Schema.Type<typeof ResearchFailure>;

export const createResearchFailure = (
  override: Partial<ResearchFailure> = {}
): ResearchFailure => ({
  failureId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  branchId: crypto.randomUUID(),
  failedHypothesisId: null,
  // 主用途是假设被拒（design §4.4: Hypothesis REJECTED → ResearchFailure）
  failureType: "SCIENTIFIC",
  rootCause: "Unknown root cause",
  evidence: null,
  reusableLesson: null,
  retryCondition: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
