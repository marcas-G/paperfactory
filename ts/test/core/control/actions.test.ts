import { describe, it, expect } from "vitest";
import { ALL_ACTIONS, getActionByName, getActionsByTarget } from "@pf/core/control/actions";

describe("Actions", () => {
  it("has 24 actions", () => {
    expect(ALL_ACTIONS.length).toBe(24);
  });

  it("all actions have required fields", () => {
    for (const action of ALL_ACTIONS) {
      expect(action.name).toBeTruthy();
      expect(action.targetType).toBeTruthy();
      expect(action.allowedSourceStates.length).toBeGreaterThan(0);
      expect(action.targetState).toBeTruthy();
      expect(typeof action.requiresGate).toBe("boolean");
      expect(action.cognitiveMode).toBeTruthy();
    }
  });

  it("getActionByName finds action", () => {
    const action = getActionByName("activate_question");
    expect(action).toBeTruthy();
    expect(action?.targetType).toBe("ResearchQuestion");
  });

  it("getActionByName returns undefined for unknown", () => {
    expect(getActionByName("nonexistent")).toBeUndefined();
  });

  it("getActionsByTarget filters correctly", () => {
    const questionActions = getActionsByTarget("ResearchQuestion");
    expect(questionActions.length).toBe(3);
    expect(questionActions.every((a) => a.targetType === "ResearchQuestion")).toBe(true);
  });

  it("question actions match design", () => {
    const scope = getActionByName("scope_question");
    expect(scope?.allowedSourceStates).toEqual(["DRAFT"]);
    expect(scope?.targetState).toBe("SCOPED");

    const activate = getActionByName("activate_question");
    expect(activate?.allowedSourceStates).toContain("DRAFT");
    expect(activate?.allowedSourceStates).toContain("SCOPED");
    expect(activate?.requiresGate).toBe(true);

    const archive = getActionByName("archive_question");
    expect(archive?.requiresGate).toBe(false);
  });

  it("hypothesis actions match design", () => {
    const confirm = getActionByName("confirm_hypothesis");
    expect(confirm?.allowedSourceStates).toEqual(["ACTIVE"]);
    expect(confirm?.targetState).toBe("CONFIRMED");
    expect(confirm?.requiresGate).toBe(true);

    const reject = getActionByName("reject_hypothesis");
    expect(reject?.targetState).toBe("REJECTED");
  });

  it("protocol actions match design", () => {
    const freeze = getActionByName("freeze_protocol");
    expect(freeze?.allowedSourceStates).toEqual(["REVIEWED"]);
    expect(freeze?.targetState).toBe("FROZEN");
    expect(freeze?.requiresGate).toBe(true);
  });
});
