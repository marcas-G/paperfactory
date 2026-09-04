import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { writingCapability, WritingResult } from "@capabilities/research/writing";

describe("Writing Capability", () => {
  it("runs full writing pipeline", async () => {
    const result = await Effect.runPromise(
      writingCapability.execute({ topic: "Deep Learning" })
    ) as unknown as WritingResult;

    expect(Array.isArray(result.outline)).toBe(true);
    expect(result.outline.length).toBe(5);
    expect(typeof result.draft).toBe("string");
    expect(result.review.score).toBeGreaterThan(0);
    expect(result.review.feedback).toBeTruthy();
  });

  it("has correct skills", () => {
    expect(writingCapability.skills).toHaveLength(3);
    expect(writingCapability.skills[0].name).toBe("writing_outline");
    expect(writingCapability.skills[1].name).toBe("writing_draft");
    expect(writingCapability.skills[2].name).toBe("writing_review");
  });

  it("outline skill produces sections", async () => {
    const result = await Effect.runPromise(
      writingCapability.skills[0].execute({ topic: "ML" })
    ) as unknown as { outline: Array<{ section: string }> };
    expect(result.outline.length).toBe(5);
    expect(result.outline[0].section).toBe("Introduction");
  });

  it("draft skill produces text", async () => {
    const result = await Effect.runPromise(
      writingCapability.skills[1].execute({ outline: [{}, {}] })
    ) as unknown as { draft: string };
    expect(typeof result.draft).toBe("string");
    expect(result.draft.length).toBeGreaterThan(0);
  });

  it("review skill produces score", async () => {
    const result = await Effect.runPromise(
      writingCapability.skills[2].execute({ draft: "test draft" })
    ) as unknown as { review: { score: number; feedback: string } };
    expect(result.review.score).toBe(0.85);
    expect(typeof result.review.feedback).toBe("string");
  });
});
