import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Experiment, createExperiment } from "../../../src/domain/objects/experiment";

const anotherUUID = "11111111-1111-4111-a111-111111111111";

describe("Experiment Schema", () => {
  const decode = Schema.decodeSync(Experiment);
  const base = createExperiment();

  it("accepts valid experiment", () => {
    const e = decode(base);
    expect(e.status).toBe("PLANNED");
    expect(e.protocolId).toBeNull();
    expect(e.hypothesisId).toBeNull();
    expect(e.resultIds).toEqual([]);
  });

  it("requires non-empty title", () => {
    expect(() => decode({ ...base, title: "" })).toThrow();
  });

  it("accepts protocol and hypothesis references", () => {
    const e = decode({ ...base, protocolId: anotherUUID, hypothesisId: anotherUUID });
    expect(e.protocolId).toBe(anotherUUID);
    expect(e.hypothesisId).toBe(anotherUUID);
  });

  it("accepts all valid status values", () => {
    for (const status of ["PLANNED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("validates status enum", () => {
    expect(() => decode({ ...base, status: "INVALID" })).toThrow();
  });

  it("accepts result IDs", () => {
    const e = decode({ ...base, resultIds: [anotherUUID] });
    expect(e.resultIds).toEqual([anotherUUID]);
  });

  it("factory with override", () => {
    const e = createExperiment({ status: "COMPLETED", resultIds: [anotherUUID] });
    expect(e.status).toBe("COMPLETED");
  });
});
