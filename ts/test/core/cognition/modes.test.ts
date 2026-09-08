import { describe, it, expect } from "vitest";
import { COGNITIVE_MODES, getCognitiveModeByName } from "@pf/core/cognition/modes";

describe("Cognitive Modes", () => {
  it("has exactly 13 cognitive modes", () => {
    expect(COGNITIVE_MODES.length).toBe(13);
  });

  it("all modes have required fields", () => {
    for (const mode of COGNITIVE_MODES) {
      expect(mode.name).toBeTruthy();
      expect(typeof mode.instructions).toBe("string");
      expect(mode.instructions.length).toBeGreaterThan(0);
      expect(Array.isArray(mode.applicableTo)).toBe(true);
      expect(mode.applicableTo.length).toBeGreaterThan(0);
    }
  });

  it("includes all 13 mode names", () => {
    const names = COGNITIVE_MODES.map((m) => m.name);
    expect(names).toContain("FRAME");
    expect(names).toContain("EXPLORE");
    expect(names).toContain("MAP");
    expect(names).toContain("COMPARE");
    expect(names).toContain("FALSIFY");
    expect(names).toContain("DIAGNOSE");
    expect(names).toContain("DISCRIMINATE");
    expect(names).toContain("VERIFY");
    expect(names).toContain("SYNTHESIZE");
    expect(names).toContain("DECIDE");
    expect(names).toContain("PLAN");
    expect(names).toContain("REFLECT");
    expect(names).toContain("DEBATE");
  });

  it("FALSIFY mode instructions contain counterexample-seeking language", () => {
    const falsify = getCognitiveModeByName("FALSIFY");
    expect(falsify).toBeTruthy();
    const instructions = falsify!.instructions.toLowerCase();
    expect(
      instructions.includes("反例") ||
        instructions.includes("counterexample") ||
        instructions.includes("证伪") ||
        instructions.includes("falsif"),
    ).toBe(true);
  });

  it("VERIFY mode instructions contain verification language", () => {
    const verify = getCognitiveModeByName("VERIFY");
    expect(verify).toBeTruthy();
    const instructions = verify!.instructions.toLowerCase();
    expect(
      instructions.includes("一致") ||
        instructions.includes("consistency") ||
        instructions.includes("验证") ||
        instructions.includes("verif"),
    ).toBe(true);
  });

  it("EXPLORE mode instructions encourage broad information gathering", () => {
    const explore = getCognitiveModeByName("EXPLORE");
    expect(explore).toBeTruthy();
    const instructions = explore!.instructions.toLowerCase();
    expect(
      instructions.includes("探索") ||
        instructions.includes("explore") ||
        instructions.includes("广泛") ||
        instructions.includes("broad") ||
        instructions.includes("多样") ||
        instructions.includes("diverse"),
    ).toBe(true);
  });

  it("no two modes have identical instructions", () => {
    const instructions = COGNITIVE_MODES.map((m) => m.instructions);
    const unique = new Set(instructions);
    expect(unique.size).toBe(instructions.length);
  });

  it("FRAME mode applies to ResearchQuestion and Protocol", () => {
    const frame = getCognitiveModeByName("FRAME");
    expect(frame?.applicableTo).toContain("ResearchQuestion");
    expect(frame?.applicableTo).toContain("Protocol");
  });

  it("DECIDE mode applies to Submission", () => {
    const decide = getCognitiveModeByName("DECIDE");
    expect(decide?.applicableTo).toContain("Submission");
  });

  it("SYNTHESIZE mode applies to Report and ResearchQuestion", () => {
    const synthesize = getCognitiveModeByName("SYNTHESIZE");
    expect(synthesize?.applicableTo).toContain("Report");
    expect(synthesize?.applicableTo).toContain("ResearchQuestion");
  });

  it("getCognitiveModeByName returns undefined for unknown mode", () => {
    expect(getCognitiveModeByName("UNKNOWN")).toBeUndefined();
  });

  it("PLAN mode applies to ResearchQuestion, Protocol, Experiment, Report", () => {
    const plan = getCognitiveModeByName("PLAN");
    expect(plan).toBeTruthy();
    expect(plan?.applicableTo).toContain("ResearchQuestion");
    expect(plan?.applicableTo).toContain("Protocol");
    expect(plan?.applicableTo).toContain("Experiment");
    expect(plan?.applicableTo).toContain("Report");
  });

  it("REFLECT mode applies to KnowledgeItem, Evidence, Result, Hypothesis", () => {
    const reflect = getCognitiveModeByName("REFLECT");
    expect(reflect).toBeTruthy();
    expect(reflect?.applicableTo).toContain("KnowledgeItem");
    expect(reflect?.applicableTo).toContain("Evidence");
    expect(reflect?.applicableTo).toContain("Result");
    expect(reflect?.applicableTo).toContain("Hypothesis");
  });

  it("DEBATE mode applies to Hypothesis, Evidence, Report, Submission", () => {
    const debate = getCognitiveModeByName("DEBATE");
    expect(debate).toBeTruthy();
    expect(debate?.applicableTo).toContain("Hypothesis");
    expect(debate?.applicableTo).toContain("Evidence");
    expect(debate?.applicableTo).toContain("Report");
    expect(debate?.applicableTo).toContain("Submission");
  });
});
