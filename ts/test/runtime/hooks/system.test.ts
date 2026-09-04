import { describe, it, expect, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import { HookSystem } from "../../../src/runtime/hooks/system";

describe("HookSystem", () => {
  let system: HookSystem;

  beforeEach(() => {
    system = new HookSystem();
  });

  it("registers and retrieves hooks", () => {
    system.register({
      id: "h1",
      name: "Test Hook",
      condition: { eventType: "PRE_EXECUTE" },
      handler: {
        type: "command",
        execute: () => Effect.succeed({ handled: true }),
      },
      enabled: true,
    });

    expect(system.get("h1")).toBeDefined();
    expect(system.list().length).toBe(1);
  });

  it("unregisters hooks", () => {
    system.register({
      id: "h1",
      name: "Test",
      condition: { eventType: "PRE_EXECUTE" },
      handler: {
        type: "command",
        execute: () => Effect.succeed({}),
      },
      enabled: true,
    });
    system.unregister("h1");
    expect(system.get("h1")).toBeUndefined();
  });

  it("matches hooks by event type", async () => {
    system.register({
      id: "h1",
      name: "PreExecute",
      condition: { eventType: "PRE_EXECUTE" },
      handler: {
        type: "command",
        execute: () => Effect.succeed({ handled: true }),
      },
      enabled: true,
    });

    const matched = system.match({
      type: "PRE_EXECUTE",
      payload: {},
    });
    expect(matched.length).toBe(1);
  });

  it("matches hooks with payload matcher", async () => {
    system.register({
      id: "h1",
      name: "Matcher",
      condition: {
        eventType: "POST_TOOL_USE",
        matcher: (payload) => (payload.success as boolean) === true,
      },
      handler: {
        type: "command",
        execute: () => Effect.succeed({ matched: true }),
      },
      enabled: true,
    });

    const matched = system.match({
      type: "POST_TOOL_USE",
      payload: { success: true },
    });
    expect(matched.length).toBe(1);

    const notMatched = system.match({
      type: "POST_TOOL_USE",
      payload: { success: false },
    });
    expect(notMatched.length).toBe(0);
  });

  it("skips disabled hooks", () => {
    system.register({
      id: "h1",
      name: "Disabled",
      condition: { eventType: "PRE_EXECUTE" },
      handler: {
        type: "command",
        execute: () => Effect.succeed({}),
      },
      enabled: false,
    });

    const matched = system.match({ type: "PRE_EXECUTE", payload: {} });
    expect(matched.length).toBe(0);
  });

  it("executes matched handlers", async () => {
    system.register({
      id: "h1",
      name: "Handler",
      condition: { eventType: "PRE_EXECUTE" },
      handler: {
        type: "command",
        execute: () => Effect.succeed({ executed: true }),
      },
      enabled: true,
    });

    const results = await Effect.runPromise(
      system.execute({ type: "PRE_EXECUTE", payload: {} })
    );
    expect(results.length).toBe(1);
    expect(results[0].executed).toBe(true);
  });

  it("returns empty for no matches", async () => {
    const results = await Effect.runPromise(
      system.execute({ type: "PRE_EXECUTE", payload: {} })
    );
    expect(results).toEqual([]);
  });
});
