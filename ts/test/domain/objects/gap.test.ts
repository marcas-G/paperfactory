import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { ResearchGap, createResearchGap } from "@pf/schema/objects/gap";


describe("ResearchGap Schema", () => {
  const decode = Schema.decodeSync(ResearchGap);
  const base = createResearchGap();

  it("accepts valid gap", () => {
    const g = decode(base);
    expect(g.status).toBe("IDENTIFIED");
    expect(g.relatedKnowledgeIds).toEqual([]);
    expect(g.createdAt).toBeInstanceOf(Date);
    expect(g.updatedAt).toBeInstanceOf(Date);
  });

  it("requires non-empty description", () => {
    expect(() => decode({ ...base, description: "" })).toThrow();
  });

  it("accepts all valid status values", () => {
    for (const status of ["IDENTIFIED", "VALIDATED", "ADDRESSED", "CLOSED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("validates status enum", () => {
    expect(() => decode({ ...base, status: "INVALID" })).toThrow();
  });
});
