import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Hypothesis, createHypothesis } from "../../../src/domain/objects/hypothesis";

const anotherUUID = "11111111-1111-4111-a111-111111111111";

describe("Hypothesis Schema", () => {
  const decode = Schema.decodeSync(Hypothesis);
  const base = createHypothesis();

  it("accepts valid hypothesis", () => {
    const h = decode(base);
    expect(h.status).toBe("PROPOSED");
    expect(h.gapId).toBeNull();
    expect(h.supportingEvidenceIds).toEqual([]);
    expect(h.conflictingEvidenceIds).toEqual([]);
  });

  it("requires non-empty statement", () => {
    expect(() => decode({ ...base, statement: "" })).toThrow();
  });

  it("requires non-empty falsification condition", () => {
    expect(() => decode({ ...base, falsificationCondition: "" })).toThrow();
  });

  it("accepts gap reference", () => {
    const h = decode({ ...base, gapId: anotherUUID });
    expect(h.gapId).toBe(anotherUUID);
  });

  it("accepts supporting and conflicting evidence", () => {
    const h = decode({
      ...base,
      supportingEvidenceIds: [anotherUUID],
      conflictingEvidenceIds: [anotherUUID],
    });
    expect(h.supportingEvidenceIds).toEqual([anotherUUID]);
    expect(h.conflictingEvidenceIds).toEqual([anotherUUID]);
  });

  it("accepts all valid status values", () => {
    for (const status of ["PROPOSED", "ASSESSED", "ACTIVE", "CONFIRMED", "REJECTED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("validates status enum", () => {
    expect(() => decode({ ...base, status: "INVALID" })).toThrow();
  });

  it("factory with override", () => {
    const h = createHypothesis({ status: "CONFIRMED", gapId: anotherUUID });
    expect(h.status).toBe("CONFIRMED");
    expect(h.gapId).toBe(anotherUUID);
  });
});
