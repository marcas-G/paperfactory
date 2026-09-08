import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Claim, createClaim, validateClaimScope } from "@pf/schema/objects/claim";
import { Evidence, createEvidence } from "@pf/schema/objects/evidence";

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

describe("Claim scope ⊆ evidence invariant", () => {
  // Design §4.3 Claim: "不变量: Claim 的范围 ⊆ 支持它的 Evidence 的范围"
  // "不能用局部证据支持过宽结论"
  it("claim with non-empty scope requires at least one supporting evidence", () => {
    const claim = createClaim({
      scope: "Applies to population X",
      supportingEvidenceIds: [],
    });
    const result = validateClaimScope(claim, []);
    expect(result.isOk).toBe(false);
  });

  it("claim scope within evidence scope passes", () => {
    const evidence: Evidence[] = [
      createEvidence({ evidenceId: anotherUUID, scope: "population X and Y" }),
    ];
    const claim = createClaim({
      scope: "population X",
      supportingEvidenceIds: [anotherUUID],
    });
    const result = validateClaimScope(claim, evidence);
    expect(result.isOk).toBe(true);
  });

  it("claim scope wider than all evidence scopes fails", () => {
    const evidence: Evidence[] = [
      createEvidence({ evidenceId: anotherUUID, scope: "mice" }),
    ];
    const claim = createClaim({
      scope: "all mammals",
      supportingEvidenceIds: [anotherUUID],
    });
    const result = validateClaimScope(claim, evidence);
    expect(result.isOk).toBe(false);
  });

  it("claim with empty scope and no evidence is allowed (DRAFT)", () => {
    const claim = createClaim({
      scope: "",
      supportingEvidenceIds: [],
    });
    const result = validateClaimScope(claim, []);
    expect(result.isOk).toBe(true);
  });

  it("claim scope contained in union of evidence scopes passes", () => {
    const evidence: Evidence[] = [
      createEvidence({ evidenceId: anotherUUID, scope: "mice" }),
      createEvidence({ evidenceId: "22222222-2222-4222-a222-222222222222", scope: "rats" }),
    ];
    const claim = createClaim({
      scope: "mice and rats",
      supportingEvidenceIds: [anotherUUID, "22222222-2222-4222-a222-222222222222"],
    });
    const result = validateClaimScope(claim, evidence);
    expect(result.isOk).toBe(true);
  });
});
