import { describe, it, expect } from "vitest";
import { applyBlindReviewPolicy } from "@cognition/policies";
import type { KnowledgeItem } from "@domain/objects/knowledge";
import type { Result } from "@domain/objects/result";

const mockKnowledgeTestSet = (): KnowledgeItem => ({
  knowledgeId: "00000000-0000-4000-a000-000000000004",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  summary: "Test set knowledge",
  sourceType: "paper",
  sourceIds: [],
  status: "VALIDATED",
  certaintyLevel: 0.9,
  questionIds: [],
  tags: ["test-set"],
  metadata: {},
  createdAt: new Date(),
});

const mockKnowledgeTrainSet = (): KnowledgeItem => ({
  knowledgeId: "11111111-1111-4111-a111-111111111111",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  summary: "Training set knowledge",
  sourceType: "paper",
  sourceIds: [],
  status: "VALIDATED",
  certaintyLevel: 0.9,
  questionIds: [],
  tags: ["train-set"],
  metadata: {},
  createdAt: new Date(),
});

const mockRawResult = (): Result => ({
  resultId: "00000000-0000-4000-a000-000000000003",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  experimentId: "00000000-0000-4000-a000-000000000000",
  summary: "Unpublished raw result",
  status: "RAW",
  data: { p_value: 0.01 },
  metadata: {},
  createdAt: new Date(),
});

const mockValidatedResult = (): Result => ({
  resultId: "22222222-2222-4222-a222-222222222222",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  experimentId: "00000000-0000-4000-a000-000000000000",
  summary: "Published validated result",
  status: "VALIDATED",
  data: { p_value: 0.01 },
  metadata: {},
  createdAt: new Date(),
});

describe("Blind Review Policies", () => {
  it("HIDE_TEST_SET excludes test-set knowledge items", () => {
    const context = {
      knowledgeItems: [mockKnowledgeTestSet(), mockKnowledgeTrainSet()],
      results: [],
    };
    const filtered = applyBlindReviewPolicy(context, "HIDE_TEST_SET");
    expect(filtered.knowledgeItems.length).toBe(1);
    expect(filtered.knowledgeItems[0].tags).not.toContain("test-set");
  });

  it("HIDE_FUTURE_RESULT excludes RAW status results", () => {
    const context = {
      knowledgeItems: [],
      results: [mockRawResult(), mockValidatedResult()],
    };
    const filtered = applyBlindReviewPolicy(context, "HIDE_FUTURE_RESULT");
    expect(filtered.results.length).toBe(1);
    expect(filtered.results[0].status).not.toBe("RAW");
  });

  it("HIDE_CONFIRMATORY_RESULT excludes supporting evidence", () => {
    const context = {
      knowledgeItems: [],
      results: [],
      evidence: [
        {
          evidenceId: "00000000-0000-4000-a000-000000000002",
          projectId: "00000000-0000-4000-a000-000000000000",
          branchId: "00000000-0000-4000-a000-000000000000",
          resultId: null,
          summary: "Supporting evidence",
          direction: "SUPPORTING" as const,
          status: "VALIDATED" as const,
          strength: 0.8,
          scope: "lab",
          metadata: {},
          createdAt: new Date(),
        },
        {
          evidenceId: "11111111-1111-4111-a111-111111111111",
          projectId: "00000000-0000-4000-a000-000000000000",
          branchId: "00000000-0000-4000-a000-000000000000",
          resultId: null,
          summary: "Conflicting evidence",
          direction: "CONFLICTING" as const,
          status: "VALIDATED" as const,
          strength: 0.6,
          scope: "lab",
          metadata: {},
          createdAt: new Date(),
        },
      ],
    };
    const filtered = applyBlindReviewPolicy(context, "HIDE_CONFIRMATORY_RESULT");
    expect(filtered.evidence?.length).toBe(1);
    expect(filtered.evidence?.[0].direction).toBe("CONFLICTING");
  });

  it("no policy returns context unchanged", () => {
    const context = {
      knowledgeItems: [mockKnowledgeTestSet()],
      results: [mockRawResult()],
    };
    const filtered = applyBlindReviewPolicy(context, null);
    expect(filtered.knowledgeItems.length).toBe(1);
    expect(filtered.results.length).toBe(1);
  });

  it("HIDE_REVIEW_OUTCOME hides review-related metadata", () => {
    const context = {
      knowledgeItems: [],
      results: [],
      submissions: [
        {
          submissionId: "00000000-0000-4000-a000-000000000005",
          projectId: "00000000-0000-4000-a000-000000000000",
          branchId: "00000000-0000-4000-a000-000000000000",
          reportId: "00000000-0000-4000-a000-000000000000",
          venue: "Nature",
          status: "UNDER_REVIEW" as const,
          metadata: {
            reviewerComments: "Review is positive",
            decision: "accept",
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    const filtered = applyBlindReviewPolicy(context, "HIDE_REVIEW_OUTCOME");
    const submission = filtered.submissions?.[0];
    expect(submission?.metadata).toEqual({});
  });
});
