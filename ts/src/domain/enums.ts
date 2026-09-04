import * as Schema from "@effect/schema/Schema";

export const GateStatus = Schema.Enums({
  PASS: "PASS",
  FAIL: "FAIL",
  UNCERTAIN: "UNCERTAIN",
  BLOCKED: "BLOCKED",
} as const);

export const TransitionDecision = Schema.Enums({
  COMMIT: "COMMIT",
  REJECT: "REJECT",
  WAIT: "WAIT",
} as const);

export const ActorType = Schema.Enums({
  USER: "USER",
  AGENT: "AGENT",
  SYSTEM: "SYSTEM",
} as const);

export const SideEffectLevel = Schema.Enums({
  NONE: "NONE",
  READ: "READ",
  INTERNAL_WRITE: "INTERNAL_WRITE",
  COMPUTE: "COMPUTE",
  EXTERNAL_WRITE: "EXTERNAL_WRITE",
} as const);

export const BlockStepType = Schema.Enums({
  TOOL_CALL: "TOOL_CALL",
  COGNITIVE_CALL: "COGNITIVE_CALL",
  CONDITION: "CONDITION",
  TRANSFORM: "TRANSFORM",
  AGGREGATE: "AGGREGATE",
  VALIDATE: "VALIDATE",
} as const);

export const CognitiveMode = Schema.Enums({
  FRAME: "FRAME",
  EXPLORE: "EXPLORE",
  MAP: "MAP",
  COMPARE: "COMPARE",
  FALSIFY: "FALSIFY",
  DIAGNOSE: "DIAGNOSE",
  DISCRIMINATE: "DISCRIMINATE",
  VERIFY: "VERIFY",
  SYNTHESIZE: "SYNTHESIZE",
  DECIDE: "DECIDE",
} as const);

export const BlindReviewPolicy = Schema.Enums({
  HIDE_FUTURE_RESULT: "HIDE_FUTURE_RESULT",
  HIDE_TEST_SET: "HIDE_TEST_SET",
  HIDE_CONFIRMATORY_RESULT: "HIDE_CONFIRMATORY_RESULT",
  HIDE_REVIEW_OUTCOME: "HIDE_REVIEW_OUTCOME",
} as const);

export const HookEventType = Schema.Enums({
  PRE_EXECUTE: "PRE_EXECUTE",
  POST_EXECUTE: "POST_EXECUTE",
  PRE_TOOL_USE: "PRE_TOOL_USE",
  POST_TOOL_USE: "POST_TOOL_USE",
  PRE_COGNITIVE: "PRE_COGNITIVE",
  POST_COGNITIVE: "POST_COGNITIVE",
  PRE_VALIDATION: "PRE_VALIDATION",
  POST_VALIDATION: "POST_VALIDATION",
} as const);

export const HookHandlerType = Schema.Enums({
  COMMAND: "command",
  HTTP: "http",
  MCP: "mcp",
  PROMPT: "prompt",
  AGENT: "agent",
} as const);
