# 第 7 层 API 层 — 接口契约

## 承上启下

### 第 7 层需要第 6 层（Orchestration）提供的接口

| 接口 | 来源 | 用途 |
|------|------|------|
| `runAgentDrivenResearch(ctx)` | `@orchestration/agent-research` | 启动完整研究流程 |
| `runPhase(contract, store, provider, ...)` | `@orchestration/phase-contracts` | 单阶段执行 |
| `PHASE_CONTRACTS` | `@orchestration/phase-contracts` | 阶段定义列表 |

### 第 7 层提供给第 8 层（App/前端）的接口

#### REST API（已实现）

| 方法 | 路径 | 请求体 | 响应体 | 说明 |
|------|------|--------|--------|------|
| `GET` | `/health` | — | `{ status: "ok", timestamp, uptime }` | 健康检查 |
| `GET` | `/` | — | HTML (Vue SPA) | 前端入口 |
| `POST` | `/api/projects` | `{ name: string }` | `{ id, name, status, createdAt }` | 创建项目 |
| `GET` | `/api/projects` | — | `ProjectSummary[]` | 项目列表 |
| `GET` | `/api/projects/:id` | — | `ProjectDetail` | 项目详情 |
| `PUT` | `/api/projects/:id` | `{ name?, status?, description?, metadata? }` | `ProjectDetail` | 更新项目 |
| `DELETE` | `/api/projects/:id` | — | `{ deleted: string }` | 删除项目（级联） |
| `POST` | `/api/research/questions` | `{ title, statement, domain }` | `{ questionId, title, status }` | 创建研究问题 |
| `GET` | `/api/research/:objectId` | — | `ResearchObject` | 查询研究对象 |
| `PUT` | `/api/research/:objectId` | `{ status?, statement?, title? }` | `ResearchObject` | 更新研究对象 |
| `DELETE` | `/api/research/:objectId` | — | `{ deleted, type }` | 删除研究对象 |
| `GET` | `/api/projects/:id/all` | — | `{ hypotheses, evidence, knowledge, reports, experiments, citations }` | 项目全部数据 |
| `GET` | `/api/projects/:id/hypotheses` | — | `Hypothesis[]` | 假设列表 |
| `GET` | `/api/projects/:id/evidence` | — | `Evidence[]` | 证据列表 |
| `GET` | `/api/projects/:id/knowledge` | — | `KnowledgeItem[]` | 知识列表 |
| `GET` | `/api/projects/:id/reports` | — | `Report[]` | 报告列表 |
| `POST` | `/api/agent/run` | `{ prompt: string }` | `{ runId, status, result, events }` | Agent 单次运行 |
| `POST` | `/api/agent/stream` | `{ prompt: string }` | SSE stream | Agent SSE 流 |
| `POST` | `/api/research/run` | `{ question: string }` | `{ runId, projectId, status, ... }` | 阻塞式研究 |
| `POST` | `/api/research/stream` | `{ question: string, mode?: "manual"\|"auto" }` | SSE stream | 流式研究 |
| `POST` | `/api/research/:runId/stop` | — | `{ runId, stopped }` | 停止研究 |
| `GET` | `/api/research/:runId/status` | — | `{ runId, status }` | 研究状态 |
| `GET` | `/api/projects/:id/phases` | — | `PhaseRunDTO[]` | 阶段运行列表 |
| `GET` | `/api/projects/:id/phases/grouped` | — | `Record<phaseName, PhaseRunDTO[]>` | 分组版本 |
| `GET` | `/api/projects/:id/chain/:objectType/:objectId` | — | `{ upstream, downstream }` | 证据链 |
| `POST` | `/api/projects/:id/phases/:runId/decision` | `{ decision: "approve"\|"modify"\|"reject", feedback? }` | `PhaseRunDTO` | 审批决策 |
| `POST` | `/api/projects/:id/phases/:phaseName/run` | `{ question? }` | `{ phaseName, status, output, savedIds, toolCalls }` | 重跑阶段 |
| `GET` | `/api/projects/:id/papers` | — | `Paper[]` | 项目论文 |
| `GET` | `/api/papers/:citationId` | — | `Paper` | 论文详情 |
| `POST` | `/api/papers/:citationId/download-pdf` | — | `{ status, pdfPath? }` | 触发 PDF 下载 |
| `GET` | `/api/projects/:id/phases/:phaseName/versions` | — | `PhaseRunDTO[]` | 阶段版本列表 |
| `GET` | `/api/projects/:id/phases/:phaseName/compare?runIds=A,B` | — | `VersionCompare` | 多版本对比 |

#### SSE 事件规范

| 事件名 | 数据字段 | 触发时机 |
|--------|----------|----------|
| `run:start` | `{ runId, projectId, question }` | 研究流程启动 |
| `phase:start` | `{ phase, content, timestamp }` | 阶段开始 |
| `phase:progress` | `{ content, phase, timestamp, runId?, objectType?, objectId? }` | 阶段进展 |
| `phase:complete` | `{ phase, content, timestamp, needsApproval, runId, objectType, objectId, rawOutput, toolCalls }` | 阶段完成 |
| `phase:awaiting_approval` | `{ runId, phaseName, summary }` | 等待人工审批 |
| `phase:approved` | — | 用户批准 |
| `phase:modified` | — | 用户请求修改 |
| `phase:rejected` | — | 用户拒绝 |
| `self:review` | `{ content, phase, timestamp, passed, rounds?, issues? }` | 自我审查 |
| `thinking` | `{ content, iteration }` | Agent 思考 |
| `tool:calling` | `{ content, toolName, toolArgs }` | 工具调用中 |
| `tool:result` | `{ content, toolName, toolArgs, toolResult }` | 工具结果 |
| `message` | `{ content, iteration }` | Agent 消息 |
| `error` | `{ content, phase? }` | 错误 |
| `run:complete` | `{ runId, projectId, hypothesisStatements, evidenceCount, knowledgeCount, reportCount }` | 研究完成 |
| `run:error` | `{ runId, error }` | 研究出错 |

## 数据类型

```typescript
// 统一错误响应
interface ApiError {
  error: {
    code: string;           // e.g. "NOT_FOUND", "VALIDATION_ERROR", "INTERNAL_ERROR"
    message: string;
    details?: Record<string, unknown>;
  };
}

// 项目摘要
interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

// 项目详情
interface ProjectDetail extends ProjectSummary {
  description: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

// 阶段运行 DTO
interface PhaseRunDTO {
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

// 论文
interface Paper {
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

// 版本对比
interface VersionCompare {
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
```

## 第 7 层内部架构

### 文件结构

```
api/
├── routes.ts              # createHonoApp 入口（组装各模块路由）
├── routes/
│   ├── health.ts          # GET /, GET /health
│   ├── projects.ts        # /api/projects/* CRUD
│   ├── research.ts        # /api/research/* (run/stream/stop/status)
│   ├── research-objects.ts# /api/research/:objectId (GET/PUT/DELETE)
│   ├── agent.ts           # /api/agent/* (run/stream)
│   ├── phases.ts          # /api/projects/:id/phases/*
│   └── papers.ts          # /api/papers/*, /api/projects/:id/papers
├── middleware/
│   ├── cors.ts            # CORS 中间件
│   ├── error.ts           # 统一错误处理
│   └── validation.ts      # 请求体验证
├── types.ts               # API 数据类型定义（DTOs）
└── utils.ts               # generateUuid, buildToolDefs, lineDiff 等工具
```

### 待完成改进

| # | 改进项 | 优先级 | 状态 |
|---|--------|--------|------|
| 1 | 拆分 routes.ts 为模块化路由 | High | DONE |
| 2 | 统一错误响应格式 `{ error: { code, message } }` | High | DONE |
| 3 | CORS 中间件 | High | DONE |
| 4 | 请求体验证（Zod 或手动验证） | High | TODO |
| 5 | 消除 `any` 类型 → 使用 DTO 类型守卫 | Medium | DONE (types.ts created with DTOs + transform functions) |
| 6 | SSE 事件类型对齐（确保前后端一致） | Medium | TODO |
| 7 | 删除冗余 `APIRouter` 类 | Low | DONE (removed from app/index.ts, kept in routes.ts for backward compat with tests) |
| 8 | 请求体大小限制 | Medium | TODO |

## Refactoring Summary (2026-09-07)

### Files Created
- `ts/src/api/types.ts` — API DTO types (ApiError, ProjectSummary, ProjectDetail, PhaseRunDTO, Paper, VersionCompare, EvidenceChainLink, ResearchObject) + transform functions (toProjectSummary, toProjectDetail, toPhaseRunDTO, toPaper)
- `ts/src/api/middleware/cors.ts` — CORS middleware
- `ts/src/api/middleware/error.ts` — Unified error handling (errorHandler, notFoundHandler)
- `ts/src/api/utils.ts` — Shared utilities (generateUuid, buildToolDefs, lineDiff)
- `ts/src/api/routes/health.ts` — GET /, GET /health
- `ts/src/api/routes/projects.ts` — All /api/projects* endpoints
- `ts/src/api/routes/research-objects.ts` — Research object CRUD
- `ts/src/api/routes/agent.ts` — Agent endpoints (run/stream)
- `ts/src/api/routes/research-runs.ts` — Research run endpoints (run/stream/stop/status)
- `ts/src/api/routes/phases.ts` — Phase endpoints
- `ts/src/api/routes/papers.ts` — Paper endpoints

### Files Modified
- `ts/src/api/routes.ts` — Now the assembler (976 lines → 88 lines), imports all route modules, registers middleware, exports createHonoApp + APIRouter for backward compat
- `ts/src/app/index.ts` — Removed APIRouter import and usage
- `ts/test/app/index.test.ts` — Removed apiRouter assertion

### Verification
- Docker build: PASS
- All 480 tests: PASS (64 test files)
- No endpoint behavior changed