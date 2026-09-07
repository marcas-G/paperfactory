# App Layer 前端开发 — 接口需求 & 执行记录

**创建:** 2026-09-06
**设计文档:** `docs/design/app-layer-v2.md`

## 需要 API/Orchestration 层提供的接口

### 新增 REST 端点

| 方法 | 路径 | 参数 | 返回类型 | 状态 |
|------|------|------|----------|------|
| `GET` | `/api/projects/:id/papers` | — | `Paper[]` | ✅ |
| `GET` | `/api/papers/:citationId` | — | `Paper` | ✅ |
| `POST` | `/api/papers/:citationId/download-pdf` | — | `{ status: string, pdfPath?: string }` | ✅ |
| `GET` | `/api/projects/:id/phases/:phaseName/versions` | — | `PhaseRun[]` | ✅ |
| `GET` | `/api/projects/:id/phases/:phaseName/compare?runIds=A,B` | `runIds: string[]` | `VersionCompare` | ✅ |

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
| 1 | Vue 3 项目脚手架 (Vite + Element Plus + vue-i18n) | ✅ | 76e301a6 |
| 2 | 三栏布局 (TopBar + Sidebar + DetailPanel + InputBar) | ✅ 完整实现 | 76e301a6 |
| 3 | 时间线组件 (PhaseTimeline) | ✅ 完整实现 | 76e301a6 |
| 4 | Agent 日志组件 (AgentLog + 消息类型) | ✅ 完整实现 | 76e301a6 |
| 5 | SSE 连接管理 (自动重连) | ✅ 完整实现 | 76e301a6 |
| 6 | 审批面板 (ApprovalPanel + VersionCards) | ✅ 完整实现 | 76e301a6 |
| 7 | 论文库内嵌视图 (PaperLibrary) | ✅ 完整实现 | 76e301a6 |
| 8 | 版本对比 (VersionCards) | ✅ 完整实现 | 76e301a6 |
| 9 | 中英双语 (vue-i18n) | ✅ | 76e301a6 |
| 10 | Docker 构建集成 | ✅ | 76e301a6 |
| 11 | API 层新增端点 (5 个) | ✅ 13 新测试 | 76e301a6 |
| 12 | 全量测试验证 | ✅ 480 pass | 76e301a6 |
