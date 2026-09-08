import type { Hypothesis } from "@pf/schema/objects/hypothesis";
import type { Evidence } from "@pf/schema/objects/evidence";
import type { ResearchQuestion } from "@pf/schema/objects/question";
import type { KnowledgeItem } from "@pf/schema/objects/knowledge";
import type { ResearchGap } from "@pf/schema/objects/gap";
import type { Experiment } from "@pf/schema/objects/experiment";
import type { Result } from "@pf/schema/objects/result";
import type { Claim } from "@pf/schema/objects/claim";
import type { Report } from "@pf/schema/objects/report";

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
