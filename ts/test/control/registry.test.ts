import { ActionRegistry } from "@control/registry";
import { ActionDefinition } from "@control/actions";

describe("ActionRegistry", () => {
  it("auto-registers ALL_ACTIONS on construction", () => {
    const registry = new ActionRegistry();
    expect(registry.list().length).toBeGreaterThan(0);
  });

  it("get returns registered action", () => {
    const registry = new ActionRegistry();
    const action = registry.get("assess_hypothesis");
    expect(action).toBeDefined();
    expect(action!.name).toBe("assess_hypothesis");
  });

  it("get returns undefined for unknown action", () => {
    const registry = new ActionRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("has returns true for registered action", () => {
    const registry = new ActionRegistry();
    expect(registry.has("assess_hypothesis")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);
  });

  it("register adds a new action", () => {
    const registry = new ActionRegistry();
    const custom: ActionDefinition = {
      name: "custom_action",
      targetType: "Hypothesis",
      targetState: "CUSTOM",
      requiresGate: false,
    };
    registry.register(custom);
    expect(registry.has("custom_action")).toBe(true);
    expect(registry.get("custom_action")).toBe(custom);
  });

  it("list returns all registered actions", () => {
    const registry = new ActionRegistry();
    const initial = registry.list().length;
    registry.register({
      name: "extra_1",
      targetType: "Hypothesis",
      targetState: "EXTRA",
      requiresGate: false,
    });
    registry.register({
      name: "extra_2",
      targetType: "Evidence",
      targetState: "EXTRA",
      requiresGate: false,
    });
    expect(registry.list().length).toBe(initial + 2);
  });

  it("register overrides existing action", () => {
    const registry = new ActionRegistry();
    const original = registry.get("assess_hypothesis");
    registry.register({
      name: "assess_hypothesis",
      targetType: "Hypothesis",
      targetState: "OVERRIDDEN",
      requiresGate: true,
    });
    const updated = registry.get("assess_hypothesis");
    expect(updated!.targetState).toBe("OVERRIDDEN");
    expect(updated).not.toBe(original);
  });
});
