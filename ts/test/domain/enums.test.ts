import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import * as E from "../../src/domain/enums";

describe("Domain Enums", () => {
  it("GateStatus has correct values", () => {
    const decode = Schema.decodeSync(E.GateStatus);
    expect(decode("PASS")).toBe("PASS");
    expect(decode("FAIL")).toBe("FAIL");
    expect(decode("UNCERTAIN")).toBe("UNCERTAIN");
    expect(decode("BLOCKED")).toBe("BLOCKED");
    expect(() => decode("INVALID" as never)).toThrow();
  });

  it("TransitionDecision has correct values", () => {
    const decode = Schema.decodeSync(E.TransitionDecision);
    expect(decode("COMMIT")).toBe("COMMIT");
    expect(decode("REJECT")).toBe("REJECT");
    expect(decode("WAIT")).toBe("WAIT");
    expect(() => decode("INVALID" as never)).toThrow();
  });

  it("ActorType has correct values", () => {
    const decode = Schema.decodeSync(E.ActorType);
    expect(decode("USER")).toBe("USER");
    expect(decode("AGENT")).toBe("AGENT");
    expect(decode("SYSTEM")).toBe("SYSTEM");
    expect(() => decode("INVALID" as never)).toThrow();
  });

  it("SideEffectLevel has correct values", () => {
    const decode = Schema.decodeSync(E.SideEffectLevel);
    expect(decode("NONE")).toBe("NONE");
    expect(decode("READ")).toBe("READ");
    expect(decode("INTERNAL_WRITE")).toBe("INTERNAL_WRITE");
    expect(decode("COMPUTE")).toBe("COMPUTE");
    expect(decode("EXTERNAL_WRITE")).toBe("EXTERNAL_WRITE");
    expect(() => decode("INVALID" as never)).toThrow();
  });

  it("BlockStepType has correct values", () => {
    const decode = Schema.decodeSync(E.BlockStepType);
    for (const v of ["TOOL_CALL", "COGNITIVE_CALL", "CONDITION", "TRANSFORM", "AGGREGATE", "VALIDATE"] as const) {
      expect(decode(v)).toBe(v);
    }
  });

  it("CognitiveMode has correct values", () => {
    const decode = Schema.decodeSync(E.CognitiveMode);
    for (const v of ["FRAME", "EXPLORE", "MAP", "COMPARE", "FALSIFY", "DIAGNOSE", "DISCRIMINATE", "VERIFY", "SYNTHESIZE", "DECIDE"] as const) {
      expect(decode(v)).toBe(v);
    }
    expect(() => decode("INVALID" as never)).toThrow();
  });

  it("BlindReviewPolicy has correct values", () => {
    const decode = Schema.decodeSync(E.BlindReviewPolicy);
    for (const v of ["HIDE_FUTURE_RESULT", "HIDE_TEST_SET", "HIDE_CONFIRMATORY_RESULT", "HIDE_REVIEW_OUTCOME"] as const) {
      expect(decode(v)).toBe(v);
    }
  });

  it("HookEventType has correct values", () => {
    const decode = Schema.decodeSync(E.HookEventType);
    for (const v of [
      "PRE_EXECUTE", "POST_EXECUTE", "PRE_TOOL_USE", "POST_TOOL_USE",
      "PRE_COGNITIVE", "POST_COGNITIVE", "PRE_VALIDATION", "POST_VALIDATION",
    ] as const) {
      expect(decode(v)).toBe(v);
    }
  });

  it("HookHandlerType has correct values", () => {
    const decode = Schema.decodeSync(E.HookHandlerType);
    for (const v of ["command", "http", "mcp", "prompt", "agent"] as const) {
      expect(decode(v)).toBe(v);
    }
  });
});
