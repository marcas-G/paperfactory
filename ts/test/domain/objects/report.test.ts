import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Report, createReport } from "../../../src/domain/objects/report";

const anotherUUID = "11111111-1111-4111-a111-111111111111";

describe("Report Schema", () => {
  const decode = Schema.decodeSync(Report);
  const base = createReport();

  it("accepts valid report", () => {
    const r = decode(base);
    expect(r.status).toBe("DRAFT");
    expect(r.sectionIds).toEqual([]);
    expect(r.createdAt).toBeInstanceOf(Date);
    expect(r.updatedAt).toBeInstanceOf(Date);
  });

  it("requires non-empty title", () => {
    expect(() => decode({ ...base, title: "" })).toThrow();
  });

  it("accepts all valid status values", () => {
    for (const status of ["DRAFT", "OUTLINED", "DRAFTED", "REVIEWED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("validates status enum", () => {
    expect(() => decode({ ...base, status: "INVALID" })).toThrow();
  });

  it("accepts section IDs", () => {
    const r = decode({ ...base, sectionIds: [anotherUUID] });
    expect(r.sectionIds).toEqual([anotherUUID]);
  });

  it("factory with override", () => {
    const r = createReport({ status: "DRAFTED", sectionIds: [anotherUUID] });
    expect(r.status).toBe("DRAFTED");
  });
});
