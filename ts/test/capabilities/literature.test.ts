import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { literatureCapability } from "@capabilities/research/literature";

describe("Literature Capability", () => {
  it("runs full pipeline with mock provider", async () => {
    const result = await Effect.runPromise(
      literatureCapability.execute({ query: "machine learning" })
    ) as unknown as { query: string; papers: unknown[]; synthesis: string };

    expect(result.query).toBe("machine learning");
    expect(Array.isArray(result.papers)).toBe(true);
    expect(result.papers.length).toBeGreaterThan(0);
    expect(typeof result.synthesis).toBe("string");
    expect(result.synthesis.length).toBeGreaterThan(0);
  });

  it("has correct skills", () => {
    expect(literatureCapability.skills).toHaveLength(3);
    expect(literatureCapability.skills[0].name).toBe("literature_search");
    expect(literatureCapability.skills[1].name).toBe("literature_retrieve");
    expect(literatureCapability.skills[2].name).toBe("literature_synthesize");
  });

  it("search skill returns papers", async () => {
    const searchSkill = literatureCapability.skills[0];
    const result = await Effect.runPromise(searchSkill.execute({ query: "deep learning" })) as unknown as { papers: unknown[] };
    expect(Array.isArray(result.papers)).toBe(true);
    expect(result.papers.length).toBeGreaterThan(0);
  });
});
