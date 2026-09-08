export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  description: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface PhaseRunDTO {
  phaseRunId: string;
  projectId: string;
  phaseName: string;
  phaseVersion: number;
  status: string;
  artifacts: Record<string, string[]>;
  agentOutput: string;
  toolCalls: Array<{ toolName: string; input: Record<string, unknown>; output: string }>;
  selfReview: { passed: boolean; rounds: number; issues: Array<{ severity: string; category: string; message: string }> } | null;
  humanFeedback: string | null;
  active: boolean;
  objectType: string;
  objectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Paper {
  citationId: string;
  sourceTitle: string;
  sourceAuthors: string[];
  sourceYear: number | null;
  abstract: string;
  sourceUrl: string;
  citationCount: number;
  relevanceScore: number;
  localPdfPath: string | null;
  pdfDownloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  createdAt: string;
}

export interface VersionCompare {
  versions: Array<{
    runId: string;
    version: number;
    summary: string;
    status: string;
    active: boolean;
    output: string;
    toolCalls: Array<{ toolName: string; input: Record<string, unknown>; output: string }>;
    selfReview: { passed: boolean; rounds: number; issues: Array<{ severity: string; category: string; message: string }> } | null;
    createdAt: string;
  }>;
  diff: Array<{
    field: string;
    changes: Array<{ from: string; to: string }>;
  }>;
}

export interface EvidenceChainLink {
  upstream: Array<{ targetType: string; targetId: string; relation: string }>;
  downstream: Array<{ sourceType: string; sourceId: string; relation: string }>;
}

export interface ResearchObject {
  [key: string]: unknown;
}

const TYPE_MAP: Record<string, string> = {
  knowledgeIds: "KnowledgeItem",
  hypothesisIds: "Hypothesis",
  gapIds: "ResearchGap",
  experimentIds: "Experiment",
  resultIds: "Result",
  evidenceIds: "Evidence",
  reportIds: "Report",
  citationIds: "Citation",
};

export function toProjectSummary(raw: Record<string, unknown>): ProjectSummary {
  return {
    id: String(raw.projectId ?? raw.id ?? ""),
    name: String(raw.name ?? ""),
    status: String(raw.status ?? ""),
    createdAt: raw.createdAt instanceof Date ? (raw.createdAt as Date).toISOString() : String(raw.createdAt ?? ""),
  };
}

export function toProjectDetail(raw: Record<string, unknown>): ProjectDetail {
  return {
    ...toProjectSummary(raw),
    description: String(raw.description ?? ""),
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    updatedAt: raw.updatedAt instanceof Date ? (raw.updatedAt as Date).toISOString() : String(raw.updatedAt ?? ""),
  };
}

export function toPhaseRunDTO(raw: Record<string, unknown>): PhaseRunDTO {
  const artifacts = (raw.artifacts as Record<string, string[]>) ?? {};
  const firstKey = Object.keys(artifacts)[0];
  return {
    phaseRunId: String(raw.phaseRunId ?? ""),
    projectId: String(raw.projectId ?? ""),
    phaseName: String(raw.phaseName ?? ""),
    phaseVersion: Number(raw.phaseVersion ?? 0),
    status: String(raw.status ?? ""),
    artifacts,
    agentOutput: String(raw.agentOutput ?? ""),
    toolCalls: (raw.toolCalls as Array<{ toolName: string; input: Record<string, unknown>; output: string }>) ?? [],
    selfReview: raw.selfReview as PhaseRunDTO["selfReview"],
    humanFeedback: raw.humanFeedback as string | null,
    active: Boolean(raw.active),
    objectType: firstKey ? (TYPE_MAP[firstKey] ?? firstKey) : "",
    objectId: firstKey ? (artifacts[firstKey]?.[0] ?? "") : "",
    createdAt: raw.createdAt instanceof Date ? (raw.createdAt as Date).toISOString() : String(raw.createdAt ?? ""),
    updatedAt: raw.updatedAt instanceof Date ? (raw.updatedAt as Date).toISOString() : String(raw.updatedAt ?? ""),
  };
}

export function toPaper(raw: Record<string, unknown>): Paper {
  const ci = raw;
  const citationCount =
    ci.metadata && typeof ci.metadata === "object" && "citationCount" in ci.metadata && typeof (ci.metadata as Record<string, unknown>).citationCount === "number"
      ? (ci.metadata as Record<string, unknown>).citationCount as number
      : 0;
  const localPdfPath = ci.localPdfPath ? String(ci.localPdfPath) : null;
  return {
    citationId: String(ci.citationId ?? ""),
    sourceTitle: String(ci.sourceTitle ?? "Unknown"),
    sourceAuthors: (ci.sourceAuthors as string[]) ?? [],
    sourceYear: ci.sourceYear ? Number(ci.sourceYear) : null,
    abstract: String(ci.abstract ?? ""),
    sourceUrl: String(ci.sourceUrl ?? ""),
    citationCount,
    relevanceScore: Number(ci.relevanceScore ?? 0),
    localPdfPath,
    pdfDownloadStatus: localPdfPath ? "downloaded" : "pending",
    createdAt: ci.createdAt instanceof Date ? (ci.createdAt as Date).toISOString() : String(ci.createdAt ?? ""),
  };
}
