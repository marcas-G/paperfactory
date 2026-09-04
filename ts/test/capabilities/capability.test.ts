import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { Capability, createCapability, composeCapabilities, Skill } from "@capabilities/generic/capability";

describe("Capability", () => {
  it("creates capability with skills and tools", () => {
    const skill: Skill = {
      name: "test_skill",
      description: "A test skill",
      execute: (input) => Effect.succeed({ result: "done", ...input }),
    };

    const cap = createCapability(
      "test_cap",
      "Test capability",
      [skill],
      [],
      (input) => Effect.succeed({ processed: true, ...input })
    );

    expect(cap.name).toBe("test_cap");
    expect(cap.skills).toHaveLength(1);
    expect(cap.tools).toHaveLength(0);
  });

  it("executes capability", async () => {
    const cap: Capability = createCapability(
      "echo",
      "Echo capability",
      [],
      [],
      (input) => Effect.succeed({ echoed: input.inputValue, ...input })
    );

    const result = await Effect.runPromise(cap.execute({ inputValue: "hello" }));
    expect(result.echoed).toBe("hello");
  });

  it("composes multiple capabilities", async () => {
    const cap1: Capability = createCapability(
      "step1",
      "First step",
      [],
      [],
      (input) => Effect.succeed({ step1: true, ...input })
    );

    const cap2: Capability = createCapability(
      "step2",
      "Second step",
      [],
      [],
      (input) => Effect.succeed({ step2: true, ...input })
    );

    const composite = composeCapabilities([cap1, cap2]);
    expect(composite.skills.length).toBe(0);
    expect(composite.tools.length).toBe(0);

    const result = await Effect.runPromise(composite.execute({ query: "test" }));
    expect(result.step1).toBe(true);
    expect(result.step2).toBe(true);
    expect(result.query).toBe("test");
  });

  it("capability tool binding", () => {
    const skill: Skill = {
      name: "compute",
      description: "Compute",
      execute: (_input) => Effect.succeed({ computed: true }),
    };
    const cap = createCapability("compute", "Compute", [skill], [], () => Effect.succeed({}));
    expect(cap.skills).toHaveLength(1);
    expect(cap.skills[0].name).toBe("compute");
  });
});
