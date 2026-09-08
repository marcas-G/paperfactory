/**
 * 端点契约表 —— 多端 API 契约的唯一定义处。
 *
 * 架构（对标 OpenCode protocol/client）：本表是 Source of Truth，
 * packages/client/script/generate.ts 读取本表生成 typed SDK 函数；
 * test/protocol/endpoints-match.test.ts 遍历本表对真实 Hono app 做回归。
 * 后端实现以本表为准对齐（改协议 = 改这里 + 重跑 codegen + 回归测试）。
 *
 * 覆盖范围：server 全部 HTTP API 端点（/health + /api/**）。
 * 例外：GET /（SPA 静态入口，依赖前端 build 产物，非 API 契约）不入表。
 */

/* ------------------------------------------------------------------ */
/*  契约元类型                                                          */
/* ------------------------------------------------------------------ */

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface EndpointDef {
  /** 生成的 SDK 函数名（camelCase，全表唯一） */
  name: string;
  method: HttpMethod;
  /** 路径模板，:param 为路径参数（与 server 路由注册一致） */
  path: string;
  /** path 中参数名，按出现顺序（codegen 依此生成函数参数） */
  pathParams?: readonly string[];
  /** query 参数类型名（本文件导出的 interface；必填 query 用 queryRequired） */
  query?: string;
  queryRequired?: boolean;
  /** 请求 body 类型名（本文件导出的 interface）；无 body 端点省略 */
  request?: string;
  /** body 整体可省略（如 runPhase 的 { question? }） */
  requestBodyOptional?: boolean;
  /** 响应类型名（本文件导出的 interface，或内置 string/unknown） */
  response: string;
  /** 响应为 text/event-stream：普通 fetch 会挂到流结束，事件订阅用 subscribeEvents */
  sse?: boolean;
  summary?: string;
}

/* ------------------------------------------------------------------ */
/*  通用类型                                                            */
/* ------------------------------------------------------------------ */

/** 后端统一错误信封（见 server middleware/error.ts） */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/* ------------------------------------------------------------------ */
/*  health                                                             */
/* ------------------------------------------------------------------ */

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

/* ------------------------------------------------------------------ */
/*  projects                                                           */
/* ------------------------------------------------------------------ */

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

export interface CreateProjectRequest {
  name: string;
}

export interface CreateProjectResponse {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface UpdateProjectRequest {
  name?: string;
  status?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectResponse {
  id: string;
  name: string;
  status: string;
  description: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface DeleteProjectResponse {
  deleted: string;
}

/* ------------------------------------------------------------------ */
/*  research objects（server 端未做 DTO 映射，返回原始记录）              */
/* ------------------------------------------------------------------ */

export type ResearchObject = Record<string, unknown>;
export type ResearchObjectList = ResearchObject[];

export interface ProjectBundle {
  hypotheses: ResearchObjectList;
  evidence: ResearchObjectList;
  knowledge: ResearchObjectList;
  reports: ResearchObjectList;
  experiments: ResearchObjectList;
  citations: ResearchObjectList;
}

export interface CreateQuestionRequest {
  title: string;
  statement?: string;
  domain?: string;
}

export interface ResearchQuestionRecord {
  questionId: string;
  title: string;
  statement: string;
  domain: string;
  status: string;
  createdAt: string;
}

export interface UpdateResearchObjectRequest {
  status?: string;
  statement?: string;
  title?: string;
  description?: string;
}

export interface DeleteResearchObjectResponse {
  deleted: string;
  type: string;
}

/* ------------------------------------------------------------------ */
/*  papers                                                             */
/* ------------------------------------------------------------------ */

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

export interface DownloadPdfResponse {
  status: string;
  pdfPath: string;
}

/* ------------------------------------------------------------------ */
/*  phases                                                             */
/* ------------------------------------------------------------------ */

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
}

export interface SelfReview {
  passed: boolean;
  rounds: number;
  issues: Array<{ severity: string; category: string; message: string }>;
}

export interface PhaseRunDTO {
  phaseRunId: string;
  projectId: string;
  phaseName: string;
  phaseVersion: number;
  status: string;
  artifacts: Record<string, string[]>;
  agentOutput: string;
  toolCalls: ToolCallRecord[];
  selfReview: SelfReview | null;
  humanFeedback: string | null;
  active: boolean;
  objectType: string;
  objectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhaseRunBrief {
  phaseRunId: string;
  phaseName: string;
  phaseVersion: number;
  status: string;
  active: boolean;
  createdAt: string;
}

export type PhaseRunsGrouped = Record<string, PhaseRunBrief[]>;

export interface PhaseDecisionRequest {
  decision: "approve" | "modify" | "reject";
  feedback?: string;
}

/** decision 端点返回更新后的 PhaseRun 原始记录（未做 DTO 映射） */
export type PhaseRunRecord = ResearchObject;

export interface RunPhaseRequest {
  question?: string;
}

export interface RunPhaseResponse {
  phaseName: string;
  status: string;
  output: unknown;
  rawOutput: string;
  savedIds: string[];
  toolCalls: ToolCallRecord[];
  events: unknown[];
}

export interface ComparePhasesQuery {
  /** 逗号分隔的 runId 列表，缺省比较全部版本 */
  runIds?: string;
}

export interface VersionCompare {
  versions: Array<{
    runId: string;
    version: number;
    summary: string;
    status: string;
    active: boolean;
    output: string;
    toolCalls: ToolCallRecord[];
    selfReview: SelfReview | null;
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

/* ------------------------------------------------------------------ */
/*  research runs                                                      */
/* ------------------------------------------------------------------ */

export interface StartResearchRequest {
  question: string;
  mode?: "auto" | "manual";
}

export interface StartResearchResponse {
  runId: string;
  projectId: string;
  questionId: string;
  status: string;
}

export interface StopRunResponse {
  runId: string;
  stopped: boolean;
}

export interface RunStatusResponse {
  runId: string;
  status: "running" | "stopped";
}

export interface ResearchStreamQuery {
  q: string;
}

/* ------------------------------------------------------------------ */
/*  agent                                                              */
/* ------------------------------------------------------------------ */

export interface AgentRunRequest {
  prompt: string;
}

export interface AgentRunResponse {
  runId: string;
  status: string;
  prompt: string;
  startedAt: string;
  result: string;
  events: unknown[];
}

/* ------------------------------------------------------------------ */
/*  events（SSE）                                                       */
/* ------------------------------------------------------------------ */

export interface EventsQuery {
  projectId?: string;
  lastEventId?: number;
}

/* ------------------------------------------------------------------ */
/*  契约表（34 端点）                                                    */
/* ------------------------------------------------------------------ */

export const ENDPOINTS: readonly EndpointDef[] = [
  {
    name: "getHealth",
    method: "GET",
    path: "/health",
    response: "HealthResponse",
    summary: "健康检查",
  },
  {
    name: "getEvents",
    method: "GET",
    path: "/api/events",
    query: "EventsQuery",
    response: "unknown",
    sse: true,
    summary: "统一事件流（SSE）；请用 subscribeEvents 订阅，本函数仅用于一次性拉取",
  },
  {
    name: "createProject",
    method: "POST",
    path: "/api/projects",
    request: "CreateProjectRequest",
    response: "CreateProjectResponse",
    summary: "创建项目（201）",
  },
  {
    name: "getProjects",
    method: "GET",
    path: "/api/projects",
    response: "ProjectSummary[]",
    summary: "项目列表",
  },
  {
    name: "getProject",
    method: "GET",
    path: "/api/projects/:id",
    pathParams: ["id"],
    response: "ProjectDetail",
    summary: "项目详情（404 = 不存在）",
  },
  {
    name: "updateProject",
    method: "PUT",
    path: "/api/projects/:id",
    pathParams: ["id"],
    request: "UpdateProjectRequest",
    response: "UpdateProjectResponse",
    summary: "更新项目",
  },
  {
    name: "deleteProject",
    method: "DELETE",
    path: "/api/projects/:id",
    pathParams: ["id"],
    response: "DeleteProjectResponse",
    summary: "删除项目（级联删下属对象）",
  },
  {
    name: "getProjectHypotheses",
    method: "GET",
    path: "/api/projects/:id/hypotheses",
    pathParams: ["id"],
    response: "ResearchObjectList",
    summary: "项目假设列表",
  },
  {
    name: "getProjectEvidence",
    method: "GET",
    path: "/api/projects/:id/evidence",
    pathParams: ["id"],
    response: "ResearchObjectList",
    summary: "项目证据列表",
  },
  {
    name: "getProjectKnowledge",
    method: "GET",
    path: "/api/projects/:id/knowledge",
    pathParams: ["id"],
    response: "ResearchObjectList",
    summary: "项目文献知识项列表",
  },
  {
    name: "getProjectReports",
    method: "GET",
    path: "/api/projects/:id/reports",
    pathParams: ["id"],
    response: "ResearchObjectList",
    summary: "项目报告列表",
  },
  {
    name: "getProjectAll",
    method: "GET",
    path: "/api/projects/:id/all",
    pathParams: ["id"],
    response: "ProjectBundle",
    summary: "项目全部研究对象打包",
  },
  {
    name: "getProjectPapers",
    method: "GET",
    path: "/api/projects/:id/papers",
    pathParams: ["id"],
    response: "Paper[]",
    summary: "项目文献列表（按时间倒序）",
  },
  {
    name: "getProjectPhases",
    method: "GET",
    path: "/api/projects/:id/phases",
    pathParams: ["id"],
    response: "PhaseRunDTO[]",
    summary: "阶段运行记录",
  },
  {
    name: "getProjectPhasesGrouped",
    method: "GET",
    path: "/api/projects/:id/phases/grouped",
    pathParams: ["id"],
    response: "PhaseRunsGrouped",
    summary: "阶段运行记录（按 phaseName 分组）",
  },
  {
    name: "getPhaseVersions",
    method: "GET",
    path: "/api/projects/:id/phases/:phaseName/versions",
    pathParams: ["id", "phaseName"],
    response: "PhaseRunDTO[]",
    summary: "指定阶段的全部版本",
  },
  {
    name: "comparePhaseVersions",
    method: "GET",
    path: "/api/projects/:id/phases/:phaseName/compare",
    pathParams: ["id", "phaseName"],
    query: "ComparePhasesQuery",
    response: "VersionCompare",
    summary: "阶段版本对比（含行级 diff）",
  },
  {
    name: "getEvidenceChain",
    method: "GET",
    path: "/api/projects/:id/chain/:objectType/:objectId",
    pathParams: ["id", "objectType", "objectId"],
    response: "EvidenceChainLink",
    summary: "证据链上下游",
  },
  {
    name: "submitPhaseDecision",
    method: "POST",
    path: "/api/projects/:id/phases/:runId/decision",
    pathParams: ["id", "runId"],
    request: "PhaseDecisionRequest",
    response: "PhaseRunRecord",
    summary: "人工审批（manual 模式：approve | modify | reject）",
  },
  {
    name: "runPhase",
    method: "POST",
    path: "/api/projects/:id/phases/:phaseName/run",
    pathParams: ["id", "phaseName"],
    request: "RunPhaseRequest",
    requestBodyOptional: true,
    response: "RunPhaseResponse",
    summary: "单阶段重跑（未知 phase 返回 404）",
  },
  {
    name: "getPaper",
    method: "GET",
    path: "/api/papers/:citationId",
    pathParams: ["citationId"],
    response: "Paper",
    summary: "单篇文献详情（404 = 不存在）",
  },
  {
    name: "downloadPaperPdf",
    method: "POST",
    path: "/api/papers/:citationId/download-pdf",
    pathParams: ["citationId"],
    response: "DownloadPdfResponse",
    summary: "登记 PDF 下载（返回本地路径）",
  },
  {
    name: "startResearch",
    method: "POST",
    path: "/api/research/run",
    request: "StartResearchRequest",
    response: "StartResearchResponse",
    summary: "发起研究（202 秒回 runId；全部进度经 /api/events 广播）",
  },
  {
    name: "startResearchStream",
    method: "POST",
    path: "/api/research/stream",
    request: "StartResearchRequest",
    response: "unknown",
    sse: true,
    summary: "一次性研究流（legacy 直连 SSE；多端推荐 run + subscribeEvents 组合）",
  },
  {
    name: "getResearchStream",
    method: "GET",
    path: "/api/research/stream",
    query: "ResearchStreamQuery",
    queryRequired: true,
    response: "unknown",
    sse: true,
    summary: "一次性研究流（GET + q 参数；legacy）",
  },
  {
    name: "stopResearchRun",
    method: "POST",
    path: "/api/research/:runId/stop",
    pathParams: ["runId"],
    response: "StopRunResponse",
    summary: "停止运行（404 = run 不存在/已结束）",
  },
  {
    name: "getResearchRunStatus",
    method: "GET",
    path: "/api/research/:runId/status",
    pathParams: ["runId"],
    response: "RunStatusResponse",
    summary: "运行状态（404 = run 不存在/已结束）",
  },
  {
    name: "createResearchQuestion",
    method: "POST",
    path: "/api/research/questions",
    request: "CreateQuestionRequest",
    response: "ResearchQuestionRecord",
    summary: "创建研究问题（201）",
  },
  {
    name: "getResearchObject",
    method: "GET",
    path: "/api/research/:objectId",
    pathParams: ["objectId"],
    response: "ResearchObject",
    summary: "按 id 查研究对象（跨 12 种类型；404 = 不存在）",
  },
  {
    name: "updateResearchObject",
    method: "PUT",
    path: "/api/research/:objectId",
    pathParams: ["objectId"],
    request: "UpdateResearchObjectRequest",
    response: "ResearchObject",
    summary: "更新研究对象（404 = 不存在）",
  },
  {
    name: "deleteResearchObject",
    method: "DELETE",
    path: "/api/research/:objectId",
    pathParams: ["objectId"],
    response: "DeleteResearchObjectResponse",
    summary: "删除研究对象（404 = 不存在）",
  },
  {
    name: "runAgent",
    method: "POST",
    path: "/api/agent/run",
    request: "AgentRunRequest",
    response: "AgentRunResponse",
    summary: "一次性 agent 循环（同步等待结果）",
  },
  {
    name: "streamAgent",
    method: "POST",
    path: "/api/agent/stream",
    request: "AgentRunRequest",
    response: "unknown",
    sse: true,
    summary: "agent 循环流式返回（SSE）",
  },
];
