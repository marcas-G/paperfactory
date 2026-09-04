import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import {
  Protocol,
  createProtocol,
  isProtocolFrozen,
  canModifyProtocol,
} from "../../../src/domain/objects/protocol";


describe("Protocol Schema", () => {
  const decode = Schema.decodeSync(Protocol);
  const base = createProtocol();

  it("accepts valid protocol", () => {
    const p = decode(base);
    expect(p.status).toBe("DRAFT");
    expect(p.steps).toEqual([]);
    expect(p.createdAt).toBeInstanceOf(Date);
    expect(p.updatedAt).toBeInstanceOf(Date);
  });

  it("requires non-empty title", () => {
    expect(() => decode({ ...base, title: "" })).toThrow();
  });

  it("accepts experiment steps", () => {
    const p = decode({ ...base, steps: ["Step 1", "Step 2"] });
    expect(p.steps).toEqual(["Step 1", "Step 2"]);
  });

  it("accepts all valid status values", () => {
    for (const status of ["DRAFT", "REVIEWED", "FROZEN", "SUPERSEDED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("validates status enum", () => {
    expect(() => decode({ ...base, status: "INVALID" })).toThrow();
  });

  it("factory with override", () => {
    const p = createProtocol({ status: "FROZEN", steps: ["A", "B"] });
    expect(p.status).toBe("FROZEN");
    expect(p.steps).toEqual(["A", "B"]);
  });
});

describe("Protocol FROZEN immutability invariant", () => {
  // Design §4.3 Protocol: "FROZEN 后不可修改（科研纪律：防止 p-hacking）"
  it("FROZEN protocol cannot be modified", () => {
    const frozen = createProtocol({ status: "FROZEN" });
    expect(isProtocolFrozen(frozen)).toBe(true);
    expect(canModifyProtocol(frozen)).toBe(false);
  });

  it("DRAFT protocol can be modified", () => {
    const draft = createProtocol({ status: "DRAFT" });
    expect(isProtocolFrozen(draft)).toBe(false);
    expect(canModifyProtocol(draft)).toBe(true);
  });

  it("REVIEWED protocol can be modified", () => {
    const reviewed = createProtocol({ status: "REVIEWED" });
    expect(isProtocolFrozen(reviewed)).toBe(false);
    expect(canModifyProtocol(reviewed)).toBe(true);
  });

  it("SUPERSEDED protocol cannot be modified", () => {
    const superseded = createProtocol({ status: "SUPERSEDED" });
    expect(isProtocolFrozen(superseded)).toBe(false);
    expect(canModifyProtocol(superseded)).toBe(false);
  });
});
