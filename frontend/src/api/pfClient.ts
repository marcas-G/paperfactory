/**
 * pfClient —— 生成 SDK 的 web 组装点。
 *
 * 链路：@pf/protocol 契约 → codegen 生成 SDK（ts/packages/client/src/generated）
 *      → axiosAdapter 注入 axios → 本文件组合出 typed API 对象。
 *
 * 改协议：改 ts/packages/protocol → 重跑 `npx tsx packages/client/script/generate.ts`
 * （ts/ 目录下），本文件按需补充新端点的绑定。
 */
import axios from 'axios';
import {
  axiosAdapter,
  getHealth,
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  getProjectHypotheses,
  getProjectEvidence,
  getProjectKnowledge,
  getProjectReports,
  getProjectAll,
  getProjectPapers,
  getProjectPhases,
  getProjectPhasesGrouped,
  getPhaseVersions,
  comparePhaseVersions,
  getEvidenceChain,
  submitPhaseDecision,
  runPhase,
  getPaper,
  downloadPaperPdf,
  startResearch,
  stopResearchRun,
  getResearchRunStatus,
  createResearchQuestion,
  getResearchObject,
  updateResearchObject,
  deleteResearchObject,
  runAgent,
  subscribeEvents,
  type ClientAdapter,
  type CreateProjectRequest,
  type UpdateProjectRequest,
  type PhaseDecisionRequest,
  type RunPhaseRequest,
  type StartResearchRequest,
  type CreateQuestionRequest,
  type UpdateResearchObjectRequest,
  type AgentRunRequest,
  type ComparePhasesQuery,
} from '../../../ts/packages/client/src/index';

/** 同源部署：请求路径直接用契约原样路径（/api/...），vite proxy / 反代转发 */
const adapter: ClientAdapter = axiosAdapter(
  axios.create({ headers: { 'Content-Type': 'application/json' } })
);

/** typed API 对象——契约函数 + 注入的 adapter，视图层不再手拼 URL */
export const pf = {
  getHealth: () => getHealth(adapter),
  createProject: (body: CreateProjectRequest) => createProject(adapter, body),
  getProjects: () => getProjects(adapter),
  getProject: (id: string) => getProject(adapter, id),
  updateProject: (id: string, body: UpdateProjectRequest) => updateProject(adapter, id, body),
  deleteProject: (id: string) => deleteProject(adapter, id),
  getProjectHypotheses: (id: string) => getProjectHypotheses(adapter, id),
  getProjectEvidence: (id: string) => getProjectEvidence(adapter, id),
  getProjectKnowledge: (id: string) => getProjectKnowledge(adapter, id),
  getProjectReports: (id: string) => getProjectReports(adapter, id),
  getProjectAll: (id: string) => getProjectAll(adapter, id),
  getProjectPapers: (id: string) => getProjectPapers(adapter, id),
  getProjectPhases: (id: string) => getProjectPhases(adapter, id),
  getProjectPhasesGrouped: (id: string) => getProjectPhasesGrouped(adapter, id),
  getPhaseVersions: (id: string, phaseName: string) => getPhaseVersions(adapter, id, phaseName),
  comparePhaseVersions: (id: string, phaseName: string, query?: ComparePhasesQuery) =>
    comparePhaseVersions(adapter, id, phaseName, query),
  getEvidenceChain: (id: string, objectType: string, objectId: string) =>
    getEvidenceChain(adapter, id, objectType, objectId),
  submitPhaseDecision: (id: string, runId: string, body: PhaseDecisionRequest) =>
    submitPhaseDecision(adapter, id, runId, body),
  runPhase: (id: string, phaseName: string, body?: RunPhaseRequest) =>
    runPhase(adapter, id, phaseName, body),
  getPaper: (citationId: string) => getPaper(adapter, citationId),
  downloadPaperPdf: (citationId: string) => downloadPaperPdf(adapter, citationId),
  /** 命令通道：202 秒回 runId，全部进度经 /api/events 事件流到达 */
  startResearch: (body: StartResearchRequest) => startResearch(adapter, body),
  stopResearchRun: (runId: string) => stopResearchRun(adapter, runId),
  getResearchRunStatus: (runId: string) => getResearchRunStatus(adapter, runId),
  createResearchQuestion: (body: CreateQuestionRequest) => createResearchQuestion(adapter, body),
  getResearchObject: (objectId: string) => getResearchObject(adapter, objectId),
  updateResearchObject: (objectId: string, body: UpdateResearchObjectRequest) =>
    updateResearchObject(adapter, objectId, body),
  deleteResearchObject: (objectId: string) => deleteResearchObject(adapter, objectId),
  runAgent: (body: AgentRunRequest) => runAgent(adapter, body),
};

/**
 * 统一事件流订阅（SSE）——同源 web 传 baseUrl ''，
 * 断线重连由 EventSource 自动携带 Last-Event-ID，服务端按 seq 补发。
 */
export { subscribeEvents };
