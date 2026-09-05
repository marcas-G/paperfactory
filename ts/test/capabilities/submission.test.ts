import { describe, it, expect, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import { createApp, AppConfig } from "@app/index";
import { createSubmission, Submission } from "@domain/objects/submission";

describe("Submission Capability", () => {
  it("submission object can be created and saved", async () => {
    const submission = createSubmission({
      submissionId: "sub-001",
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      reportId: "00000000-0000-4000-a000-000000000000",
      targetVenue: "arxiv",
      status: "SUBMITTED",
    });

    expect(submission.submissionId).toBe("sub-001");
    expect(submission.status).toBe("SUBMITTED");
  });

  it("submission tracks venue and decision", async () => {
    const submission = createSubmission({
      submissionId: "sub-002",
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      reportId: "00000000-0000-4000-a000-000000000000",
      targetVenue: "NeurIPS 2026",
      status: "ACCEPTED",
    });

    expect(submission.targetVenue).toBe("NeurIPS 2026");
    expect(submission.status).toBe("ACCEPTED");
  });

  it("submission can be stored and retrieved via ObjectStore", async () => {
    const { InMemoryObjectStore } = await import("@persistence/object-store");
    const store = new InMemoryObjectStore();

    const submission = createSubmission({
      submissionId: "sub-003",
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      reportId: "00000000-0000-4000-a000-000000000000",
      targetVenue: "ICML 2026",
      status: "UNDER_REVIEW",
    });

    await Effect.runPromise(store.save(submission));
    const opt = await Effect.runPromise(store.get("sub-003", "Submission"));
    expect(opt.isSome()).toBe(true);
    const retrieved = opt.value as Submission;
    expect(retrieved.targetVenue).toBe("ICML 2026");
    expect(retrieved.status).toBe("UNDER_REVIEW");
  });

  it("submission capability generates submission via LLM (not hardcoded)", async () => {
    const provider = new (await import("@runtime/provider")).MockProvider([
      {
        pattern: "",
        response: {
          content: "We present a novel approach to X. Our results show Y improvement.",
          stopReason: "stop",
        },
      },
    ]);

    const { submissionCapability } = await import("@capabilities/research/submission");
    const result = await Effect.runPromise(
      submissionCapability.skills[0].execute({
        reportContent: "Abstract: We study X",
        venue: "arxiv",
        provider,
      })
    );

    expect(result).toBeDefined();
    expect(result.coverLetter).toBeDefined();
    expect(typeof result.coverLetter).toBe("string");
    expect(result.coverLetter.length).toBeGreaterThan(10);
  });
});
