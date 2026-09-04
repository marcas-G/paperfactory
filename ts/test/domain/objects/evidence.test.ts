import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Evidence, createEvidence } from "../../../src/domain/objects/evidence";

const anotherUUID = "11111111-1111-4111-a111-111111111111";

describe("Evidence Schema", () => {
  const decode = Schema.decodeSync(Evidence);
  const base = createEvidence();

  it("accepts valid evidence", () => {
    const e = decode(base);
    expect(e.direction).toBe("SUPPORTING");
    expect(e.status).toBe("PROPOSED");
    expect(e.resultId).toBeNull();
    expect(e.strength).toBe(0.5);
  });

  it("requires non-empty summary", () => {
    expect(() => decode({ ...base, summary: "" })).toThrow();
  });

  it("accepts all direction values", () => {
    for (const dir of ["SUPPORTING", "CONFLICTING", "NEUTRAL"]) {
      expect(decode({ ...base, direction: dir }).direction).toBe(dir);
    }
  });

  it("validates direction enum", () => {
    expect(() => decode({ ...base, direction: "INVALID" })).toThrow();
  });

  it("accepts all status values", () => {
    for (const status of ["PROPOSED", "VALIDATED", "INVALIDATED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("validates strength range 0-1", () => {
    expect(() => decode({ ...base, strength: -0.1 })).toThrow();
    expect(() => decode({ ...base, strength: 1.5 })).toThrow();
  });

  it("accepts boundary strength values", () => {
    expect(decode({ ...base, strength: 0 }).strength).toBe(0);
    expect(decode({ ...base, strength: 1 }).strength).toBe(1);
  });

  it("accepts result reference", () => {
    const e = decode({ ...base, resultId: anotherUUID });
    expect(e.resultId).toBe(anotherUUID);
  });

  it("factory with override", () => {
    const e = createEvidence({ direction: "CONFLICTING", strength: 0.8 });
    expect(e.direction).toBe("CONFLICTING");
    expect(e.strength).toBe(0.8);
  });
});
