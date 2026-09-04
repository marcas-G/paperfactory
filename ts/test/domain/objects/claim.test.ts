import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Claim, createClaim } from "../../../src/domain/objects/claim";

const anotherUUID = "11111111-1111-4111-a111-111111111111";

describe("Claim Schema", () => {
  const decode = Schema.decodeSync(Claim);
  const base = createClaim();

  it("accepts valid claim", () => {
    const c = decode(base);
    expect(c.status).toBe("PROPOSED");
    expect(c.hypothesisId).toBeNull();
    expect(c.supportingEvidenceIds).toEqual([]);
    expect(c.scope).toBe("");
  });

  it("requires non-empty statement", () => {
    expect(() => decode({ ...base, statement: "" })).toThrow();
  });

  it("accepts hypothesis reference", () => {
    const c = decode({ ...base, hypothesisId: anotherUUID });
    expect(c.hypothesisId).toBe(anotherUUID);
  });

  it("accepts supporting evidence IDs", () => {
    const c = decode({ ...base, supportingEvidenceIds: [anotherUUID] });
    expect(c.supportingEvidenceIds).toEqual([anotherUUID]);
  });

  it("accepts scope definition", () => {
    const c = decode({ ...base, scope: "Applies to population X" });
    expect(c.scope).toBe("Applies to population X");
  });

  it("accepts all valid status values", () => {
    for (const status of ["PROPOSED", "VALIDATED", "RETRACTED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("validates status enum", () => {
    expect(() => decode({ ...base, status: "INVALID" })).toThrow();
  });

  it("factory with override", () => {
    const c = createClaim({ status: "VALIDATED", hypothesisId: anotherUUID });
    expect(c.status).toBe("VALIDATED");
  });
});
