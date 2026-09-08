import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import {
  ALL_GATES,
  FROZEN_PROTOCOL_GATE,
  FALSIFICATION_GATE,
  EVIDENCE_SUFFICIENCY_GATE,
  getGateByName,
} from "@pf/core/control/gates";

describe("Gates", () => {
  it("has 3 gates", () => {
    expect(ALL_GATES.length).toBe(3);
  });

  describe("FROZEN_PROTOCOL_GATE", () => {
    it("BLOCKS when protocol is frozen", async () => {
      const result = await Effect.runPromise(
        FROZEN_PROTOCOL_GATE.evaluate({
          objectState: { status: "FROZEN" },
          actionName: "test",
        })
      );
      expect(result.status).toBe("BLOCKED");
    });

    it("PASSES when protocol is not frozen", async () => {
      const result = await Effect.runPromise(
        FROZEN_PROTOCOL_GATE.evaluate({
          objectState: { status: "DRAFT" },
          actionName: "test",
        })
      );
      expect(result.status).toBe("PASS");
    });
  });

  describe("FALSIFICATION_GATE", () => {
    it("PASSES when falsification condition defined", async () => {
      const result = await Effect.runPromise(
        FALSIFICATION_GATE.evaluate({
          objectState: { falsificationCondition: "if X fails" },
          actionName: "test",
        })
      );
      expect(result.status).toBe("PASS");
    });

    it("FAILS when no falsification condition", async () => {
      const result = await Effect.runPromise(
        FALSIFICATION_GATE.evaluate({
          objectState: {},
          actionName: "test",
        })
      );
      expect(result.status).toBe("FAIL");
    });
  });

  describe("EVIDENCE_SUFFICIENCY_GATE", () => {
    it("PASSES with sufficient evidence", async () => {
      const result = await Effect.runPromise(
        EVIDENCE_SUFFICIENCY_GATE.evaluate({
          objectState: { supportingEvidenceIds: ["e1", "e2"] },
          actionName: "test",
        })
      );
      expect(result.status).toBe("PASS");
    });

    it("UNCERTAIN with partial evidence", async () => {
      const result = await Effect.runPromise(
        EVIDENCE_SUFFICIENCY_GATE.evaluate({
          objectState: { supportingEvidenceIds: ["e1"] },
          actionName: "test",
        })
      );
      expect(result.status).toBe("UNCERTAIN");
    });

    it("FAILS with no evidence", async () => {
      const result = await Effect.runPromise(
        EVIDENCE_SUFFICIENCY_GATE.evaluate({
          objectState: { supportingEvidenceIds: [] },
          actionName: "test",
        })
      );
      expect(result.status).toBe("FAIL");
    });
  });

  it("getGateByName finds gate", () => {
    expect(getGateByName("FROZEN_PROTOCOL")).toBe(FROZEN_PROTOCOL_GATE);
  });

  it("getGateByName returns undefined for unknown", () => {
    expect(getGateByName("NONEXISTENT")).toBeUndefined();
  });
});
