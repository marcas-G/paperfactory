import * as Effect from "effect/Effect";
import * as Schema from "@effect/schema/Schema";
import { GateStatus } from "@pf/schema/enums";

export type GateResult = {
  name: string;
  status: Schema.Schema.Type<typeof GateStatus>;
  reason: string;
};

export interface Gate {
  name: string;
  // gate 适用的对象类型:controller 只对匹配类型的 gated action 评估,
  // 避免 FALSIFICATION 等专用 gate 误拦无关对象类型(如 Protocol)。
  targetTypes: ReadonlyArray<string>;
  evaluate: (context: GateContext) => Effect.Effect<GateResult, never>;
}

export interface GateContext {
  objectState: Record<string, unknown>;
  actionName: string;
  metadata?: Record<string, unknown>;
}

export const FROZEN_PROTOCOL_GATE: Gate = {
  name: "FROZEN_PROTOCOL",
  targetTypes: ["Protocol"],
  evaluate: (context) =>
    Effect.succeed({
      name: "FROZEN_PROTOCOL",
      status: context.objectState.status === "FROZEN" ? "BLOCKED" : "PASS",
      reason:
        context.objectState.status === "FROZEN"
          ? "Cannot modify frozen protocol"
          : "Protocol is not frozen",
    }),
};

export const FALSIFICATION_GATE: Gate = {
  name: "FALSIFICATION",
  targetTypes: ["Hypothesis"],
  evaluate: (context) =>
    Effect.succeed({
      name: "FALSIFICATION",
      status: context.objectState.falsificationCondition
        ? "PASS"
        : "FAIL",
      reason: context.objectState.falsificationCondition
        ? "Falsification condition defined"
        : "No falsification condition defined",
    }),
};

export const EVIDENCE_SUFFICIENCY_GATE: Gate = {
  name: "EVIDENCE_SUFFICIENCY",
  targetTypes: ["Hypothesis", "Claim"],
  evaluate: (context) => {
    const supporting = Array.isArray(context.objectState.supportingEvidenceIds)
      ? context.objectState.supportingEvidenceIds.length
      : 0;
    let status: Schema.Schema.Type<typeof GateStatus>;
    let reason: string;
    if (supporting >= 2) {
      status = "PASS";
      reason = "Sufficient supporting evidence";
    } else if (supporting >= 1) {
      status = "UNCERTAIN";
      reason = "Partial evidence";
    } else {
      status = "FAIL";
      reason = "Insufficient evidence";
    }
    return Effect.succeed({ name: "EVIDENCE_SUFFICIENCY", status, reason });
  },
};

export const ALL_GATES: ReadonlyArray<Gate> = [
  FROZEN_PROTOCOL_GATE,
  FALSIFICATION_GATE,
  EVIDENCE_SUFFICIENCY_GATE,
];

export const getGateByName = (name: string): Gate | undefined =>
  ALL_GATES.find((g) => g.name === name);
