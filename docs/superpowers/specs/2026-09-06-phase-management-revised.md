# PaperFactory Phase Management & Human-in-the-Loop — Revised Design

## Overview

PaperFactory 当前的问题：Agent 跑完一堆东西，用户看不懂、不能参与判断、不能回退修改。

**核心设计原则：人在环中，可读、可判断、可决策。**

## Requirements (Confirmed with User)

### 1. 研究持久化 — 直接写 PG

**要求：** 研究过程中所有数据直接写 PostgreSQL，不经过 InMemoryObjectStore。崩溃可恢复。

**影响：**
- `routes.ts` 中 `/api/research/stream` 和 `/api/research/run` 使用 `PgObjectStore` 而非 `InMemoryObjectStore`
- PhaseRun、EvidenceChain、Citation、KnowledgeItem、Hypothesis 等全部直接写 PG
- 研究结束后不再需要批量导出到 PG（因为已经在 PG 里了）

### 2. Phase Version Management

**要求：** 每个阶段执行产生一个 `phase_run`，支持多版本。用户 approve 后标记为 active，modify/reject 后产生新版本。

**数据模型：** `phase_runs` 表（已实现）

**版本生命周期：**
- v1: Agent 执行 → self-review → 用户 approve → active，继续下一阶段
- v2: 用户 modify/reject → Agent 自动重跑（SSE 不中断） → self-review → 用户 approve → v2 active，v1 标记非 active
- 下游阶段基于 active 版本的数据执行

### 3. Self-Review

**要求：** 每个阶段输出经过 FALSIFY 模式自我审查（最多 3 轮修订）。

**auto 模式下：** self-review 失败（3 轮后仍有 blocking issues）→ 带着问题继续，不暂停。

**manual 模式下：** self-review 失败 → 仍然送到用户面前，让用户 decide。

### 4. Human-in-the-Loop — SSE 自动重跑

**要求：** manual 模式下，SSE 流在阶段完成后暂停，等待用户决策。

**决策流程：**
1. 阶段完成 → SSE 发送 `phase:awaiting_approval`
2. 前端显示决策按钮（批准/修改/拒绝）
3. 用户点"批准" → SSE 恢复，继续下一阶段
4. 用户点"修改"（带反馈）→ SSE 流内 Agent 自动重跑该阶段（新版），完成后再次暂停等待
5. 用户点"拒绝"（带原因）→ SSE 流内 Agent 自动重跑（新版），完成后再次暂停等待

**关键：** 重跑在 SSE 流内部自动完成，不中断连接，用户不需要手动触发。

### 5. Evidence Chain — 图结构，引用式嵌入

**要求：**
- 每个阶段完成后构建证据链（当前已实现）
- 证据链是图结构，不是树
- **不直接展示完整图**，而是嵌入到内容文本中
- 类似引用：内容中的观点/结论可以点击查看出处（跳转上游）或查看被谁引用（跳转下游）
- 总体证据链图可以单独查看

**实现方式：**
- 内容文本中的关键术语自动标注可点击的引用标记
- 点击引用标记弹出/侧边显示该对象的证据链（上游来源 + 下游引用）
- 独立的证据链图视图（可选，全局查看）

### 6. Paper 管理 — 论文库

**要求：**
- 搜索到的论文保存到 `citations` 表，包含完整元数据（标题、作者、年份、摘要、引用数、PDF 链接）
- 前端有一个**论文库**视图，按项目分组
- 论文库展示简略信息：标题 + 作者 + 年份 + 引用数
- 点击论文查看详情（摘要、PDF 链接等）
- **PDF 下载：** 多源尝试下载（openAccessPdf → 其他来源），失败如实报告，不影响主流程
- 本地 PDF 保存在 `data/papers/<project_id>/<citation_id>.pdf`

### 7. 版本对比 UI

**要求：** 侧边栏每个阶段显示版本号。点击阶段可：
- 查看当前 active 版本的详情
- 切换版本（下拉列表）
- 对比两个版本的 diff（agent_output 的差异）

### 8. 审批交互

**要求：**
- 阶段完成后，前端清晰显示审批状态和决策按钮
- 修改/拒绝时弹出反馈输入框
- 决策后 SSE 自动恢复（approve 进入下一阶段，modify/reject 触发重跑）
- 重跑期间显示"正在根据反馈重新执行..."状态

## Architecture

| Layer | Change |
|-------|--------|
| **Persistence** | 研究流程直接使用 PgObjectStore，不再用 InMemoryObjectStore |
| **Domain** | PhaseRun, EvidenceChain 对象（已有） |
| **Runtime** | self-review 集成、SSE 内重跑逻辑、PDF 下载 |
| **API** | 论文库端点、版本对比端点 |
| **Frontend** | 论文库视图、版本切换+对比、审批交互、引用式证据链嵌入 |

## API Design

### 新增端点

```
# 论文库
GET  /api/papers                     -- 所有论文列表（可选项目过滤）
GET  /api/projects/:id/papers        -- 某项目的论文
GET  /api/papers/:citationId         -- 论文详情（含 PDF 下载状态）
POST /api/papers/:citationId/download-pdf  -- 触发 PDF 下载

# 版本对比
GET  /api/projects/:id/phases/:phaseName/compare?v1=X&v2=Y  -- 版本 diff

# 证据链图
GET  /api/projects/:id/evidence-graph  -- 全图（节点+边）
```

### SSE Events（修正）

```
event: phase:awaiting_approval
data: { runId, phaseName, phaseVersion, summary, paperCards, toolCalls, rawOutput }

event: phase:self_review
data: { passed, rounds, issues }

event: phase:rerunning
data: { phaseName, newVersion, feedback, reason }

event: phase:approved
data: { runId, phaseName }

event: phase:rejected
data: { runId, phaseName, feedback }

event: paper:downloaded
data: { citationId, pdfPath }

event: paper:download_failed
data: { citationId, error }
```

## Testing Strategy

1. PG 直接持久化：研究中途 kill 进程，恢复后数据仍在 PG
2. SSE 自动重跑：manual 模式 reject → 验证 SSE 流内自动重跑
3. 版本对比：同一阶段 v1 和 v2，diff 正确
4. 论文库：搜索论文 → 论文库可见 → 按项目过滤
5. 证据链引用嵌入：内容中的引用标记可点击查看上游/下游
