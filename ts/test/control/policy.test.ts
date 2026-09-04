import { describe, it, expect } from "vitest";
import { scoreCandidates } from "../../src/control/policy";
import { ALL_ACTIONS, getActionsByTarget } from "../../src/control/actions";

describe("Policy", () => {
  it("scores and ranks candidates", () => {
    const candidates = getActionsByTarget("ResearchQuestion");
    const scores = scoreCandidates(candidates, "DRAFT");

    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].action).toBeDefined();
    expect(scores[0].total).toBeGreaterThan(0);
  });

  it("ranks by total score descending", () => {
    const candidates = ALL_ACTIONS;
    const scores = scoreCandidates(candidates, "ACTIVE");

    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i].total).toBeGreaterThanOrEqual(scores[i + 1].total);
    }
  });

  it("priority ordering reflects gate requirements", () => {
    const candidates = getActionsByTarget("ResearchQuestion");
    const scores = scoreCandidates(candidates, "DRAFT");

    const withGate = scores.find((s) => s.action.requiresGate);
    const withoutGate = scores.find((s) => !s.action.requiresGate);
    if (withGate && withoutGate) {
      expect(withGate.priority).toBeGreaterThan(withoutGate.priority);
    }
  });

  it("filters by current state", () => {
    const candidates = getActionsByTarget("ResearchQuestion");
    const scores = scoreCandidates(candidates, "ARCHIVED");
    expect(scores.length).toBe(0);
  });

  it("scoring has correct weight components", () => {
    const scores = scoreCandidates(ALL_ACTIONS, "ACTIVE");
    for (const s of scores) {
      expect(s.priority).toBeGreaterThanOrEqual(0);
      expect(s.priority).toBeLessThanOrEqual(1);
      expect(s.risk).toBeGreaterThanOrEqual(0);
      expect(s.risk).toBeLessThanOrEqual(1);
      expect(s.progress).toBeGreaterThanOrEqual(0);
      expect(s.progress).toBeLessThanOrEqual(1);
    }
  });
});
