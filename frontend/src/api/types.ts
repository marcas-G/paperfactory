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
  pdfDownloadStatus: 'pending' | 'downloading' | 'downloaded' | 'failed';
  createdAt: string;
}

export interface ToolCall {
  toolName: string;
  input: object;
  output: string;
}

export interface SelfReview {
  passed: boolean;
  rounds: number;
  issues: Array<{ severity: string; category: string; message: string }>;
}

export interface PhaseRun {
  phaseRunId: string;
  projectId: string;
  phaseName: string;
  phaseVersion: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'WAITING_APPROVAL' | 'REJECTED' | 'MODIFY_REQUESTED';
  artifacts: Record<string, string[]>;
  agentOutput: string;
  toolCalls: ToolCall[];
  selfReview: SelfReview | null;
  humanFeedback: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}
