import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Protocol, createProtocol } from "../../../src/domain/objects/protocol";

const HYP_ID = "dddddddd-dddd-4ddd-dddd-dddddddddddd";

describe("Protocol Schema", () => {
  const decode = Schema.decodeSync(Protocol);
  const base = createProtocol({ hypothesisId: HYP_ID });

  it("accepts a valid protocol with DRAFT defaults", () => {
    const p = decode(base);
    // Design §4.3: 状态机 DRAFT → REVIEWED → FROZEN → SUPERSEDED
    expect(p.status).toBe("DRAFT");
    expect(p.hypothesisId).toBe(HYP_ID);
    expect(p.steps).toEqual([]);
    expect(p.metadata).toEqual({});
  });

  it("rejects empty title", () => {
    expect(() => decode({ ...base, title: "" })).toThrow();
  });

  it("rejects missing hypothesis reference", () => {
    // Design §4.4: Protocol belongs to a Hypothesis
    const { hypothesisId: _hyp, ...withoutHyp } = base;
    expect(() => decode(withoutHyp as never)).toThrow();
  });

  it("accepts all protocol status values", () => {
    for (const status of ["DRAFT", "REVIEWED", "FROZEN", "SUPERSEDED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("rejects unknown status values", () => {
    expect(() => decode({ ...base, status: "UNFROZEN" })).toThrow();
  });

  it("accepts steps and description", () => {
    const p = decode({
      ...base,
      steps: ["Collect data", "Run analysis"],
      description: "Pre-registered protocol",
    });
    expect(p.steps).toEqual(["Collect data", "Run analysis"]);
    expect(p.description).toBe("Pre-registered protocol");
  });

  it("rejects non-string steps", () => {
    expect(() => decode({ ...base, steps: [42] } as never)).toThrow();
  });

  it("honours overrides (not hard-coded)", () => {
    const p = decode(createProtocol({ status: "FROZEN", title: "T2" }));
    expect(p.status).toBe("FROZEN");
    expect(p.title).toBe("T2");
    expect(p.createdAt.getTime()).toBeGreaterThan(Date.now() - 60000);
  });
});
