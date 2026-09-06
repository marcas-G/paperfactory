# App Layer 前端开发 — 接口需求 & 执行记录

**创建:** 2026-09-06
**设计文档:** `docs/design/app-layer-v2.md`

## 需要 API/Orchestration 层提供的接口

### 新增 REST 端点

| 方法 | 路径 | 参数 | 返回类型 | 状态 |
|------|------|------|----------|------|
| `GET` | `/api/projects/:id/papers` | — | `Paper[]` | TODO |
| `GET` | `/api/papers/:citationId` | — | `Paper` | TODO |
| `POST` | `/api/papers/:citationId/download-pdf` | — | `{ status: string, pdfPath?: string }` | TODO |
| `GET` | `/api/projects/:id/phases/:phaseName/versions` | — | `PhaseRun[]` | TODO |
| `GET` | `/api/projects/:id/phases/:phaseName/compare?runIds=A,B` | `runIds: string[]` | `VersionCompare` | TODO |

### 补充 SSE 事件

| 事件 | 数据字段 | 状态 |
|------|----------|------|
| `phase:rerunning` | `{ phaseName, newVersion, feedback }` | TODO |
| `paper:downloaded` | `{ citationId, pdfPath }` | TODO |
| `paper:download_failed` | `{ citationId, error }` | TODO |

### Paper 数据类型（需 API 返回）

```typescript
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
```

### VersionCompare 数据类型（需 API 返回）

```typescript
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

## 执行进度

| # | 任务 | 状态 | Commit |
|---|------|------|--------|
| 1 | Vue 3 项目脚手架 (Vite + Element Plus + vue-i18n) | TODO | — |
| 2 | 三栏布局 (TopBar + Sidebar + MainContent + DetailPanel + InputBar) | TODO | — |
| 3 | 时间线组件 (PhaseTimeline + PhaseNode) | TODO | — |
| 4 | Agent 日志组件 (AgentLog + 消息类型: Thinking/Tool/Phase/Review/Message) | TODO | — |
| 5 | SSE 连接管理 (EventSource wrapper + 事件分发) | TODO | — |
| 6 | 审批面板 (ApprovalPanel + VersionCards + DecisionButtons) | TODO | — |
| 7 | 论文库内嵌视图 (PaperLibrary + PaperCard) | TODO | — |
| 8 | 版本对比 (VersionCompare + 卡片列表 + 详情) | TODO | — |
| 9 | 中英双语 (vue-i18n locales/zh.json + en.json) | TODO | — |
| 10 | Docker 构建集成 (Dockerfile 增加 Vite build 步骤) | TODO | — |
| 11 | API 层新增端点实现 | TODO | — |
| 12 | 全量测试 + Docker 构建验证 | TODO | — |
