import { describe, it, expect } from "vitest";
import { ContextCompiler } from "@cognition/compiler";
import type { Hypothesis } from "@domain/objects/hypothesis";
import type { Evidence } from "@domain/objects/evidence";
import type { Result } from "@domain/objects/result";
import type { KnowledgeItem } from "@domain/objects/knowledge";
import type { Submission } from "@domain/objects/submission";
import type { Report } from "@domain/objects/report";

const mockHypothesis = (): Hypothesis => ({
  hypothesisId: "00000000-0000-4000-a000-000000000001",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  gapId: null,
  statement: "X causes Y",
  falsificationCondition: "If Y does not occur when X is applied",
  status: "ACTIVE",
  supportingEvidenceIds: [],
  conflictingEvidenceIds: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
});

const mockEvidence = (): Evidence => ({
  evidenceId: "00000000-0000-4000-a000-000000000002",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  resultId: null,
  summary: "Evidence for X causes Y",
  direction: "SUPPORTING",
  status: "VALIDATED",
  strength: 0.8,
  scope: "lab conditions",
  metadata: {},
  createdAt: new Date(),
});

const mockResult = (): Result => ({
  resultId: "00000000-0000-4000-a000-000000000003",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  experimentId: "00000000-0000-4000-a000-000000000000",
  summary: "Experiment result",
  status: "VALIDATED",
  data: {},
  metadata: {},
  createdAt: new Date(),
});

const mockKnowledge = (): KnowledgeItem => ({
  knowledgeId: "00000000-0000-4000-a000-000000000004",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  summary: "Prior knowledge",
  sourceType: "paper",
  sourceIds: [],
  status: "VALIDATED",
  certaintyLevel: 0.9,
  questionIds: [],
  tags: [],
  metadata: {},
  createdAt: new Date(),
});

const mockSubmission = (): Submission => ({
  submissionId: "00000000-0000-4000-a000-000000000005",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  reportId: "00000000-0000-4000-a000-000000000000",
  venue: "Nature",
  status: "READY",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
});

const mockReport = (): Report => ({
  reportId: "00000000-0000-4000-a000-000000000006",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  title: "Test Report",
  status: "DRAFTED",
  sectionIds: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("ContextCompiler", () => {
  it("FALSIFY mode includes hypotheses and evidence", () => {
    const state = {
      hypotheses: [mockHypothesis()],
      evidence: [mockEvidence()],
      results: [mockResult()],
      knowledgeItems: [mockKnowledge()],
      submissions: [mockSubmission()],
      reports: [mockReport()],
    };
    const context = ContextCompiler.compile(state, "FALSIFY");
    expect(context.hypotheses.length).toBe(1);
    expect(context.evidence.length).toBe(1);
  });

  it("FALSIFY mode excludes submissions and reports", () => {
    const state = {
      hypotheses: [mockHypothesis()],
      evidence: [mockEvidence()],
      results: [mockResult()],
      knowledgeItems: [mockKnowledge()],
      submissions: [mockSubmission()],
      reports: [mockReport()],
    };
    const context = ContextCompiler.compile(state, "FALSIFY");
    expect(context.submissions).toBeUndefined();
    expect(context.reports).toBeUndefined();
  });

  it("EXPLORE mode includes knowledge items", () => {
    const state = {
      hypotheses: [mockHypothesis()],
      evidence: [mockEvidence()],
      results: [mockResult()],
      knowledgeItems: [mockKnowledge()],
      submissions: [],
      reports: [],
    };
    const context = ContextCompiler.compile(state, "EXPLORE");
    expect(context.knowledgeItems.length).toBe(1);
  });

  it("DECIDE mode includes submissions", () => {
    const state = {
      hypotheses: [],
      evidence: [],
      results: [],
      knowledgeItems: [],
      submissions: [mockSubmission()],
      reports: [mockReport()],
    };
    const context = ContextCompiler.compile(state, "DECIDE");
    expect(context.submissions?.length).toBe(1);
  });

  it("empty state produces empty context", () => {
    const state = {
      hypotheses: [],
      evidence: [],
      results: [],
      knowledgeItems: [],
      submissions: [],
      reports: [],
    };
    const context = ContextCompiler.compile(state, "FRAME");
    expect(context.hypotheses.length).toBe(0);
    expect(context.evidence.length).toBe(0);
    expect(context.results.length).toBe(0);
    expect(context.knowledgeItems.length).toBe(0);
  });

  it("different modes produce different context shapes", () => {
    const state = {
      hypotheses: [mockHypothesis()],
      evidence: [mockEvidence()],
      results: [mockResult()],
      knowledgeItems: [mockKnowledge()],
      submissions: [mockSubmission()],
      reports: [mockReport()],
    };
    const falsifyCtx = ContextCompiler.compile(state, "FALSIFY");
    const decideCtx = ContextCompiler.compile(state, "DECIDE");
    // FALSIFY has evidence, DECIDE has submissions
    expect(falsifyCtx.evidence.length).toBe(1);
    expect(falsifyCtx.submissions).toBeUndefined();
    expect(decideCtx.submissions?.length).toBe(1);
  });
});
