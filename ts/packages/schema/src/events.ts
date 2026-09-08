import * as Schema from "@effect/schema/Schema";
import * as E from "./enums";

export const ControlEventType = Schema.Enums({
  TASK_CREATED: "TASK_CREATED",
  TASK_COMPLETED: "TASK_COMPLETED",
  TASK_FAILED: "TASK_FAILED",
  APPROVAL_REQUESTED: "APPROVAL_REQUESTED",
  APPROVAL_GRANTED: "APPROVAL_GRANTED",
  APPROVAL_DENIED: "APPROVAL_DENIED",
  BRANCH_CREATED: "BRANCH_CREATED",
  BRANCH_MERGED: "BRANCH_MERGED",
  BRANCH_CLOSED: "BRANCH_CLOSED",
  POLICY_RECOMMENDATION: "POLICY_RECOMMENDATION",
  PRE_EXECUTE: "PRE_EXECUTE",
  POST_EXECUTE: "POST_EXECUTE",
  PRE_TOOL_USE: "PRE_TOOL_USE",
  POST_TOOL_USE: "POST_TOOL_USE",
  PRE_COGNITIVE: "PRE_COGNITIVE",
  POST_COGNITIVE: "POST_COGNITIVE",
  PRE_VALIDATION: "PRE_VALIDATION",
  POST_VALIDATION: "POST_VALIDATION",
  STATE_TRANSITION: "STATE_TRANSITION",
  LOOP_COMPLETED: "LOOP_COMPLETED",
} as const);

export const DomainEvent = Schema.Struct({
  eventId: Schema.UUID,
  type: ControlEventType,
  timestamp: Schema.DateFromSelf,
  actorType: E.ActorType,
  actorId: Schema.NullOr(Schema.UUID),
  objectId: Schema.NullOr(Schema.UUID),
  payload: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  revision: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});

export type DomainEvent = Schema.Schema.Type<typeof DomainEvent>;

export const createDomainEvent = (override: Partial<DomainEvent> = {}): DomainEvent => ({
  eventId: "00000000-0000-4000-a000-000000000000",
  type: "TASK_CREATED",
  timestamp: new Date(),
  actorType: "SYSTEM",
  actorId: null,
  objectId: null,
  payload: {},
  revision: 1,
  ...override,
});
