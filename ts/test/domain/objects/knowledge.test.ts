import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { KnowledgeItem, createKnowledgeItem } from "../../../src/domain/objects/knowledge";

const anotherUUID = "11111111-1111-4111-a111-111111111111";

describe("KnowledgeItem Schema", () => {
  const decode = Schema.decodeSync(KnowledgeItem);
  const base = createKnowledgeItem();

  it("accepts valid knowledge item", () => {
    const k = decode(base);
    expect(k.knowledgeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(k.sourceType).toBe("paper");
    expect(k.certaintyLevel).toBe(0.5);
    expect(k.sourceIds).toEqual([]);
    expect(k.questionIds).toEqual([]);
    expect(k.tags).toEqual([]);
    expect(k.metadata).toEqual({});
    expect(k.createdAt).toBeInstanceOf(Date);
  });

  it("requires non-empty summary", () => {
    expect(() => decode({ ...base, summary: "" })).toThrow();
  });

  it("accepts string sourceType", () => {
    for (const st of ["paper", "lab_test", "experiment", "filing"]) {
      const k = decode({ ...base, sourceType: st });
      expect(k.sourceType).toBe(st);
    }
  });

  it("validates certaintyLevel range 0-1", () => {
    expect(() => decode({ ...base, certaintyLevel: -0.1 })).toThrow();
    expect(() => decode({ ...base, certaintyLevel: 1.5 })).toThrow();
  });

  it("accepts boundary certainty values", () => {
    expect(decode({ ...base, certaintyLevel: 0 }).certaintyLevel).toBe(0);
    expect(decode({ ...base, certaintyLevel: 1 }).certaintyLevel).toBe(1);
  });

  it("accepts all valid status values", () => {
    for (const status of ["DRAFT", "ASSESSED", "VALIDATED", "SUPERSEDED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("validates status enum", () => {
    expect(() => decode({ ...base, status: "INVALID" })).toThrow();
  });

  it("accepts source IDs and question links", () => {
    const k = decode({
      ...base,
      sourceIds: [anotherUUID],
      questionIds: [anotherUUID],
      tags: ["important", "relevant"],
    });
    expect(k.sourceIds).toEqual([anotherUUID]);
    expect(k.questionIds).toEqual([anotherUUID]);
    expect(k.tags).toEqual(["important", "relevant"]);
  });

  it("factory with override", () => {
    const k = createKnowledgeItem({ sourceType: "experiment", certaintyLevel: 0.9 });
    expect(k.sourceType).toBe("experiment");
    expect(k.certaintyLevel).toBe(0.9);
  });
});
