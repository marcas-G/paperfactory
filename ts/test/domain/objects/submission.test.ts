import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Submission, createSubmission } from "../../../src/domain/objects/submission";

const REPORT_ID = "55555555-aaaa-4555-aaaa-555555555555";

describe("Submission Schema", () => {
  const decode = Schema.decodeSync(Submission);
  const base = createSubmission({ reportId: REPORT_ID });

  it("accepts a valid submission with READY default", () => {
    // persistence DDL: status DEFAULT 'READY'
    const s = decode(base);
    expect(s.status).toBe("READY");
    expect(s.reportId).toBe(REPORT_ID);
    expect(s.metadata).toEqual({});
  });

  it("requires a report reference", () => {
    // A submission wraps a Report
    const { reportId: _r, ...withoutReport } = base;
    expect(() => decode(withoutReport as never)).toThrow();
  });

  it("rejects empty venue", () => {
    expect(() => decode({ ...base, venue: "" })).toThrow();
  });

  it("accepts the submission lifecycle statuses", () => {
    for (const status of ["READY", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED"]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("rejects unknown status values", () => {
    expect(() => decode({ ...base, status: "IN_SPACE" })).toThrow();
  });

  it("honours overrides (not hard-coded)", () => {
    const s = decode(createSubmission({ venue: "NeurIPS", status: "SUBMITTED" }));
    expect(s.venue).toBe("NeurIPS");
    expect(s.status).toBe("SUBMITTED");
  });
});
