import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Result, createResult } from "../../../src/domain/objects/result";


describe("Result Schema", () => {
  const decode = Schema.decodeSync(Result);
  const base = createResult();

  it("accepts valid result", () => {
    const r = decode(base);
    expect(r.status).toBe("RAW");
    expect(r.data).toEqual({});
    expect(r.metadata).toEqual({});
    expect(r.createdAt).toBeInstanceOf(Date);
  });

  it("accepts result data", () => {
    const r = decode({ ...base, data: { mean: 42.5, p_value: 0.001 } });
    expect(r.data).toEqual({ mean: 42.5, p_value: 0.001 });
  });

  it("accepts all valid status values", () => {
    for (const status of ["RAW", "VALIDATED", "INVALIDATED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("validates status enum", () => {
    expect(() => decode({ ...base, status: "INVALID" })).toThrow();
  });

  it("allows empty summary", () => {
    const r = decode({ ...base, summary: "" });
    expect(r.summary).toBe("");
  });

  it("factory with override", () => {
    const r = createResult({ status: "VALIDATED", data: { x: 1 } });
    expect(r.status).toBe("VALIDATED");
  });
});
