import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Submission, createSubmission } from "../../../src/domain/objects/submission";


describe("Submission Schema", () => {
  const decode = Schema.decodeSync(Submission);
  const base = createSubmission();

  it("accepts valid submission", () => {
    const s = decode(base);
    expect(s.status).toBe("READY");
    expect(s.venue).toBe("Nature");
    expect(s.createdAt).toBeInstanceOf(Date);
    expect(s.updatedAt).toBeInstanceOf(Date);
  });

  it("requires non-empty venue", () => {
    expect(() => decode({ ...base, venue: "" })).toThrow();
  });

  it("accepts all valid status values", () => {
    for (const status of [
      "READY", "MATCHED", "FITTED", "SUBMITTED",
      "UNDER_REVIEW", "REBUTTAL_READY", "ACCEPTED", "REJECTED",
    ]) {
      expect(decode({ ...base, status }).status).toBe(status);
    }
  });

  it("validates status enum", () => {
    expect(() => decode({ ...base, status: "INVALID" })).toThrow();
  });

  it("factory with override", () => {
    const s = createSubmission({ status: "ACCEPTED", venue: "Science" });
    expect(s.status).toBe("ACCEPTED");
    expect(s.venue).toBe("Science");
  });
});
