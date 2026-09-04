import type { Hypothesis } from "@domain/objects/hypothesis";
import type { Evidence } from "@domain/objects/evidence";
import type { ResearchQuestion } from "@domain/objects/question";
import type { KnowledgeItem } from "@domain/objects/knowledge";
import type { ResearchGap } from "@domain/objects/gap";
import type { Experiment } from "@domain/objects/experiment";
import type { Result } from "@domain/objects/result";
import type { Claim } from "@domain/objects/claim";
import type { Report } from "@domain/objects/report";

export interface WorkflowManifest {
  hypotheses: ReadonlyArray<Hypothesis>;
  evidence: ReadonlyArray<Evidence>;
  questions: ReadonlyArray<ResearchQuestion>;
  knowledgeItems: ReadonlyArray<KnowledgeItem>;
  researchGaps: ReadonlyArray<ResearchGap>;
  experiments: ReadonlyArray<Experiment>;
  results: ReadonlyArray<Result>;
  claims: ReadonlyArray<Claim>;
  reports: ReadonlyArray<Report>;
}

export interface MutableManifest {
  hypotheses: Array<Hypothesis>;
  evidence: Array<Evidence>;
  questions: Array<ResearchQuestion>;
  knowledgeItems: Array<KnowledgeItem>;
  researchGaps: Array<ResearchGap>;
  experiments: Array<Experiment>;
  results: Array<Result>;
  claims: Array<Claim>;
  reports: Array<Report>;
}

export function createEmptyManifest(): MutableManifest {
  return {
    hypotheses: [],
    evidence: [],
    questions: [],
    knowledgeItems: [],
    researchGaps: [],
    experiments: [],
    results: [],
    claims: [],
    reports: [],
  };
}
