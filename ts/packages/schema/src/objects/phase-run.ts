import * as Schema from "@effect/schema/Schema";

export const PhaseRun = Schema.Struct({
  phaseRunId: Schema.UUID,
  projectId: Schema.UUID,
  phaseName: Schema.NonEmptyString,
  phaseVersion: Schema.Positive,
  parentRunId: Schema.NullOr(Schema.UUID),
  status: Schema.String,
  artifacts: Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) }),
  agentOutput: Schema.NullOr(Schema.String),
  toolCalls: Schema.Array(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  selfReview: Schema.NullOr(
    Schema.Struct({
      passed: Schema.Boolean,
      rounds: Schema.Int,
      issues: Schema.Array(
        Schema.Struct({
          severity: Schema.Union(Schema.Literal("blocking"), Schema.Literal("warning")),
          category: Schema.String,
          message: Schema.String,
        })
      ),
    })
  ),
  humanFeedback: Schema.NullOr(Schema.String),
  active: Schema.Boolean,
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type PhaseRun = Schema.Schema.Type<typeof PhaseRun>;

export const createPhaseRun = (override: Partial<PhaseRun> = {}): PhaseRun => ({
  phaseRunId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  phaseName: "unknown",
  phaseVersion: 1,
  parentRunId: null,
  status: "PENDING",
  artifacts: {},
  agentOutput: null,
  toolCalls: [],
  selfReview: null,
  humanFeedback: null,
  active: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
