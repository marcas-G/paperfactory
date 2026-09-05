import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { EvidenceChain, createEvidenceChain } from "../../../src/domain/objects/evidence-chain";

const chainUUID = "11111111-1111-4111-a111-111111111111";
const projectUUID = "22222222-2222-4222-a222-222222222222";
const sourceUUID = "33333333-3333-4333-a333-333333333333";
const targetUUID = "44444444-4444-4444-a444-444444444444";

describe("EvidenceChain Schema", () => {
  const decode = Schema.decodeSync(EvidenceChain);
  const base = createEvidenceChain();

  it("accepts valid evidence chain", () => {
    const c = decode(base);
    expect(c.sourceType).toBe("Hypothesis");
    expect(c.targetType).toBe("Citation");
    expect(c.relation).toBe("derives-from");
  });

  it("requires valid UUID for evidenceChainId", () => {
    expect(() => decode({ ...base, evidenceChainId: "invalid" })).toThrow();
  });

  it("requires valid UUID for projectId", () => {
    expect(() => decode({ ...base, projectId: "invalid" })).toThrow();
  });

  it("requires valid UUID for sourceId", () => {
    expect(() => decode({ ...base, sourceId: "invalid" })).toThrow();
  });

  it("requires valid UUID for targetId", () => {
    expect(() => decode({ ...base, targetId: "invalid" })).toThrow();
  });

  it("requires non-empty sourceType", () => {
    expect(() => decode({ ...base, sourceType: "" })).toThrow();
  });

  it("requires non-empty targetType", () => {
    expect(() => decode({ ...base, targetType: "" })).toThrow();
  });

  it("requires non-empty relation", () => {
    expect(() => decode({ ...base, relation: "" })).toThrow();
  });

  it("accepts custom source and target types", () => {
    const c = decode({
      ...base,
      sourceType: "Experiment",
      sourceId: sourceUUID,
      targetType: "Result",
      targetId: targetUUID,
    });
    expect(c.sourceType).toBe("Experiment");
    expect(c.targetType).toBe("Result");
    expect(c.sourceId).toBe(sourceUUID);
    expect(c.targetId).toBe(targetUUID);
  });

  it("accepts custom relation", () => {
    const c = decode({ ...base, relation: "contradicts" });
    expect(c.relation).toBe("contradicts");
  });

  it("factory with override", () => {
    const c = createEvidenceChain({
      evidenceChainId: chainUUID,
      projectId: projectUUID,
      sourceType: "Hypothesis",
      sourceId: sourceUUID,
      targetType: "Citation",
      targetId: targetUUID,
      relation: "cites",
    });
    expect(c.evidenceChainId).toBe(chainUUID);
    expect(c.projectId).toBe(projectUUID);
    expect(c.sourceType).toBe("Hypothesis");
    expect(c.sourceId).toBe(sourceUUID);
    expect(c.targetType).toBe("Citation");
    expect(c.targetId).toBe(targetUUID);
    expect(c.relation).toBe("cites");
  });
});

describe("createEvidenceChain defaults", () => {
  it("creates an evidence chain link", () => {
    const chain = createEvidenceChain({
      evidenceChainId: chainUUID,
      projectId: projectUUID,
      sourceType: "Hypothesis",
      sourceId: sourceUUID,
      targetType: "Citation",
      targetId: targetUUID,
      relation: "cites",
    });
    expect(chain.sourceType).toBe("Hypothesis");
    expect(chain.targetType).toBe("Citation");
    expect(chain.relation).toBe("cites");
  });

  it("sets createdAt to a recent timestamp", () => {
    const before = Date.now();
    const chain = createEvidenceChain();
    const after = Date.now();
    expect(chain.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(chain.createdAt.getTime()).toBeLessThanOrEqual(after);
  });
});
