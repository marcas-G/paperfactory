# PaperFactory 前端设计 — App Layer

## 用户决策记录

| 维度 | 决策 |
|------|------|
| 用户画像 | 科研人员独立使用 |
| 流程可视化 | 线性时间线（8 阶段从上到下） |
| 论文库 | 项目内嵌视图 |
| 思考可视化 | 实时流式 |
| 审批体验 | 展示完整内容供用户审批（非盲批） |
| 版本对比 | 卡片列表 + 详情（不同方向，非严格优劣） |
| 前端框架 | Vue 3 + Composition API |
| 构建方式 | Docker 构建中集成 Vite |
| 国际化 | 中英双语可切换 |

## 技术栈

- **Vue 3** (Composition API, `<script setup>`)
- **Vite** 构建
- **Element Plus** UI 组件库（中文友好，科研人员常用风格）
- **i18n** (vue-i18n) 中英双语
- 保持现有 REST API + SSE 协议不变

## 页面结构

### 三栏布局

```
┌──────────────────────────────────────────────────────────────────┐
│ TOPBAR: Logo | 研究 | 项目 | [zh/en] | 状态指示灯               │
├──────────┬──────────────────────────────────┬────────────────────┤
│          │                                  │                    │
│ 项目列表 │   主内容区 (动态切换)              │   详情面板         │
│ (左 240) │                                  │   (右 360)         │
│          │  - 时间线视图                     │                    │
│          │  - 流式 Agent 日志               │   - 阶段内容审批   │
│          │  - 论文库内嵌                     │   - 版本卡片列表   │
│          │                                  │   - 证据链         │
│          │                                  │   - Self-Review    │
├──────────┴──────────────────────────────────┴────────────────────┤
│ 输入栏: [研究问题输入] [开始研究] [停止]                          │
└──────────────────────────────────────────────────────────────────┘
```

### 视图（路由）

| 路由 | 视图 | 说明 |
|------|------|------|
| `/research/:projectId` | 研究视图 | 时间线 + Agent 日志 + 详情面板 |
| `/projects` | 项目列表 | 所有项目卡片，支持搜索/删除 |
| `/papers` | 论文库（全局） | 跨项目论文浏览（可选） |

## 组件设计

### 核心组件树

```
App
├── TopBar                              # 顶部导航栏
│   ├── Logo
│   ├── NavTabs                         # 研究/项目/论文库
│   ├── LanguageSwitcher                # zh/en
│   └── StatusIndicator                 # 就绪/研究中/完成/错误
│
├── Sidebar                             # 左侧项目列表
│   ├── ProjectItem                     # 单个项目（含删除按钮）
│   └── NewProjectButton
│
├── MainContent                         # 主内容区（动态）
│   ├── TimelineView                    # 线性时间线（8 阶段）
│   │   └── PhaseNode                   # 单个阶段节点
│   │       ├── PhaseIcon               # 状态图标
│   │       ├── PhaseLabel              # 名称 + 版本号
│   │       └── PhaseStatusDot          # 颜色状态点
│   ├── AgentLog                        # Agent 实时日志
│   │   ├── ThinkingMessage             # 思考事件
│   │   ├── ToolCallMessage             # 工具调用（可折叠）
│   │   ├── PhaseMessage                # 阶段事件
│   │   ├── ReviewMessage               # Self-Review 事件
│   │   └── PaperCard                   # 论文卡片
│   └── PaperLibraryView                # 论文库（项目内嵌）
│       └── PaperItem                   # 单篇论文（标题/作者/年份/引用）
│
├── DetailPanel                         # 右侧详情面板
│   ├── PhaseDetail                     # 阶段详情
│   │   ├── RawOutput                   # Agent 原始输出
│   │   ├── StructuredSummary           # 结构化摘要
│   │   ├── ToolCallLog                 # 工具调用记录
│   │   ├── SelfReviewResult            # Self-Review 结果
│   │   ├── EvidenceChain               # 证据链
│   │   └── ApprovalPanel               # 审批面板
│   │       ├── VersionCards            # 版本卡片列表
│   │       ├── VersionDetail           # 版本详情（点击进入）
│   │       └── DecisionButtons         # 批准/修改/拒绝
│   └── ProjectDetail                   # 项目详情（非研究时）
│
└── InputBar                            # 底部输入栏
    ├── QuestionInput
    ├── SendButton
    └── StopButton
```

## API 接口（App 层向 Orchestration 层请求）

### 现有接口（已实现，保持不变）

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/api/projects` | 创建项目 |
| `GET` | `/api/projects` | 项目列表 |
| `GET` | `/api/projects/:id` | 项目详情 |
| `PUT` | `/api/projects/:id` | 更新项目 |
| `DELETE` | `/api/projects/:id` | 删除项目（级联） |
| `GET` | `/api/projects/:id/all` | 项目全部数据 |
| `GET` | `/api/projects/:id/phases` | 阶段运行列表 |
| `GET` | `/api/projects/:id/phases/grouped` | 按阶段名分组的版本 |
| `GET` | `/api/projects/:id/chain/:type/:id` | 证据链（双向） |
| `POST` | `/api/projects/:id/phases/:runId/decision` | 审批决策 |
| `POST` | `/api/projects/:id/phases/:phaseName/run` | 重跑阶段 |
| `POST` | `/api/research/stream` | SSE 研究流 |
| `POST` | `/api/research/:runId/stop` | 停止研究 |
| `GET` | `/api/research/:runId/status` | 研究状态 |
| `POST` | `/api/agent/run` | Agent 单次运行 |
| `POST` | `/api/agent/stream` | Agent SSE 流 |
| `GET` | `/health` | 健康检查 |

### 新增接口（本次实现）

| 方法 | 路径 | 用途 | 返回 |
|------|------|------|------|
| `GET` | `/api/projects/:id/papers` | 项目论文列表 | `Paper[]` |
| `GET` | `/api/papers/:citationId` | 论文详情 | `Paper` |
| `POST` | `/api/papers/:citationId/download-pdf` | 触发 PDF 下载 | `{ status, pdfPath? }` |
| `GET` | `/api/projects/:id/phases/:phaseName/versions` | 阶段所有版本详情 | `PhaseRun[]` |
| `GET` | `/api/projects/:id/phases/:phaseName/compare?runIds=A,B` | 多版本对比 | `{ versions[], diff }` |

### SSE 事件（补充）

| 事件 | 数据 | 说明 |
|------|------|------|
| `phase:rerunning` | `{ phaseName, newVersion, feedback }` | 阶段重跑中 |
| `paper:downloaded` | `{ citationId, pdfPath }` | PDF 下载完成 |
| `paper:download_failed` | `{ citationId, error }` | PDF 下载失败 |

### 数据类型

```typescript
// Paper (论文)
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

// PhaseRun (阶段运行) — 已有，补充字段
interface PhaseRun {
  phaseRunId: string;
  projectId: string;
  phaseName: string;
  phaseVersion: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'WAITING_APPROVAL' | 'REJECTED' | 'MODIFY_REQUESTED';
  artifacts: Record<string, string[]>;
  agentOutput: string;
  toolCalls: Array<{ toolName: string; input: object; output: string }>;
  selfReview: { passed: boolean; rounds: number; issues: Array<{ severity: string; category: string; message: string }> } | null;
  humanFeedback: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// VersionCompare (版本对比)
interface VersionCompare {
  versions: Array<{
    runId: string;
    version: number;
    summary: string;           // LLM 生成的简短摘要
    status: string;
    active: boolean;
    output: string;            // 完整原始输出
    toolCalls: ToolCall[];
    selfReview: SelfReview | null;
    createdAt: string;
  }>;
  diff: Array<{
    field: string;
    changes: Array<{ from: string; to: string }>;
  }>;
}
```

## 审批面板设计

审批面板在 DetailPanel 中展示，当阶段状态为 `WAITING_APPROVAL` 时自动显示。

### 展示内容（全可折叠）

1. **结构化摘要** — 根据阶段类型自动渲染：
   - 文献搜索 → 关键发现列表 + 研究空白列表
   - 假设生成 → 假设卡片列表（陈述 + 研究价值 + 证伪条件）
   - 证据评估 → 证据方向分布 + 结论
   - 报告生成 → 报告大纲预览

2. **版本卡片列表** — 该阶段所有版本的卡片：
   - 每行：版本号 + 状态 + 简短摘要 + 时间
   - 点击进入版本详情（完整输出 + 工具调用 + Self-Review）

3. **Self-Review 结果** — 审查轮数 + 问题列表（blocking/warning）

4. **工具调用记录** — 可折叠的工具调用历史

5. **决策按钮** — 批准 / 修改（弹出反馈输入） / 拒绝（弹出原因输入）

## 国际化

- `vue-i18n` 管理中英文
- 语言切换在 TopBar 右上角
- 默认语言：中文（`zh-CN`）
- 翻译文件：`locales/zh.json`, `locales/en.json`

## 构建集成

Dockerfile 修改：
1. `frontend/` 目录独立 Vite 项目
2. Docker build 阶段：`npm install && npm run build` → 输出到 `dist/`
3. 复制 `dist/` 到 `src/api/static/`
4. 现有 `index.html` 替换为 Vue SPA entry point
