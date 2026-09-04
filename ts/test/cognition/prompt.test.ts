import { describe, it, expect } from "vitest";
import { PromptAssembler } from "@cognition/prompt";

describe("PromptAssembler", () => {
  it("FALSIFY mode prompt contains falsification instructions", () => {
    const prompt = PromptAssembler.assemble(
      {
        hypotheses: [],
        evidence: [],
        results: [],
        knowledgeItems: [],
      },
      "FALSIFY",
    );
    const lower = prompt.toLowerCase();
    expect(
      lower.includes("反例") ||
        lower.includes("counterexample") ||
        lower.includes("证伪") ||
        lower.includes("falsif"),
    ).toBe(true);
  });

  it("VERIFY mode prompt contains verification instructions", () => {
    const prompt = PromptAssembler.assemble(
      {
        hypotheses: [],
        evidence: [],
        results: [],
        knowledgeItems: [],
      },
      "VERIFY",
    );
    const lower = prompt.toLowerCase();
    expect(
      lower.includes("一致") ||
        lower.includes("consistency") ||
        lower.includes("验证") ||
        lower.includes("verif"),
    ).toBe(true);
  });

  it("different modes produce different prompts", () => {
    const context = {
      hypotheses: [],
      evidence: [],
      results: [],
      knowledgeItems: [],
    };
    const falsifyPrompt = PromptAssembler.assemble(context, "FALSIFY");
    const verifyPrompt = PromptAssembler.assemble(context, "VERIFY");
    expect(falsifyPrompt).not.toBe(verifyPrompt);
  });

  it("prompt includes mode name", () => {
    const prompt = PromptAssembler.assemble(
      {
        hypotheses: [],
        evidence: [],
        results: [],
        knowledgeItems: [],
      },
      "FALSIFY",
    );
    expect(prompt).toContain("FALSIFY");
  });

  it("prompt includes context summary when hypotheses exist", () => {
    const prompt = PromptAssembler.assemble(
      {
        hypotheses: [
          {
            hypothesisId: "00000000-0000-4000-a000-000000000001",
            projectId: "00000000-0000-4000-a000-000000000000",
            branchId: "00000000-0000-4000-a000-000000000000",
            gapId: null,
            statement: "X causes Y",
            falsificationCondition: "If Y does not occur",
            status: "ACTIVE",
            supportingEvidenceIds: [],
            conflictingEvidenceIds: [],
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        evidence: [],
        results: [],
        knowledgeItems: [],
      },
      "FALSIFY",
    );
    expect(prompt).toContain("X causes Y");
  });

  it("all 10 modes produce non-empty prompts", () => {
    const context = {
      hypotheses: [],
      evidence: [],
      results: [],
      knowledgeItems: [],
    };
    const modeNames = [
      "FRAME",
      "EXPLORE",
      "MAP",
      "COMPARE",
      "FALSIFY",
      "DIAGNOSE",
      "DISCRIMINATE",
      "VERIFY",
      "SYNTHESIZE",
      "DECIDE",
    ];
    for (const modeName of modeNames) {
      const prompt = PromptAssembler.assemble(context, modeName);
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(modeName);
    }
  });
});
