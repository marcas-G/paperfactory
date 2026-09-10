# Research Agent 工程宪法

全项目最高级别工程约束。任何设计、编码、重构、工具接入必须与本文一致。

技术栈：TypeScript + Bun + Effect + Drizzle + SQLite（账本）/ PostgreSQL（可选）+ Hono + SolidJS（Web）/ ANSI TUI。
多端协议见 `docs/PROTOCOL.md`，系统工程基线见 `docs/SE/`。

---

## 三条治理公理（不可违反）

> **LLM proposes; the system decides.**
> **Tools execute; the controller governs.**
> **Evidence changes research state; prose does not.**

---

## 1. 项目本质

一站式 Research Agent Platform：持续维护结构化研究状态，识别关键不确定性，选择研究动作，调用专业能力执行，依据证据推进状态演化。

核心不是"消息"，是：Project / State / Object / Action / Evidence / Decision / Event。Chat 只是交互方式。

## 2. 架构分层与依赖铁律

```
schema（契约，零依赖）
  ← core（状态机/门/工具/账本/投影）
    ← research（编排/phase-contracts/引用门）
      ← server（Hono 路由 + SSE 事件流）
client/tui 只碰 protocol + client（禁止 import server/core 内部）
```

- 架构测试（`test/architecture/dependency-rules`）锁定方向，违规即红
- 每个包有单一职责，新增代码必须明确归属

## 3. 命令与事件分离（多端通信）

- **命令**：`POST /api/research/run` 等，秒回 202 + runId，异步执行
- **事件**：`GET /api/events` 统一 SSE 流（seq 单调、Last-Event-ID 断线续传）
- **资源**：`GET /api/projects/...` 幂等查询
- **契约**：`@pf/protocol` 端点表 → codegen 生成 `@pf/client` SDK

## 4. 事件溯源账本

- SQLite append-only（`packages/core/src/ledger/`），seq 全局单调
- 对象写入双发 `object:mutated`/`object:deleted` 事件（ProjectingObjectStore）
- 内存模式启动时从账本重放对象（`replayObjectsInto`）
- 事件不可变，重放安全

## 5. LLM 调用纪律

- 优先 `streamResponse()`（流式，逐 token 发 thinking 事件）；不可用时降级 `sendMessages()`
- 三层刹车：LLM 超时（默认 120s，env 可调）/ 工具超时（30s）/ 工具输出回填截断（8k chars）
- 工具参数必须经 Schema 校验（decode 先于 execute）
- 引用门：报告引用 ⊆ 已入库来源（`enforceCitationGate`）

## 6. 工具系统

- 三段式：`input` Schema + `execute` Effect + `toModelOutput` 翻译
- `ToolRegistry.materialize()` 按权限过滤（deny 的工具对模型隐身）
- 工具结果包含实际内容摘要（不只是计数），确保信息透明

## 7. 研究编排

- 8 阶段契约：文献→缺口→假设→实验设计→实验执行→证据评估→确证→报告
- manual 模式：阶段完成挂起等审批（approve/modify/reject）
- phase 级断点续跑：`POST /api/research/resume`（跳过已完成阶段）
- 报告正文经引用门清洗后落库（content + citationStats）

## 8. Deterministic where possible, semantic where necessary

能用代码判断的（Protocol 存在？Hypothesis 可证伪？引用在库里？）不交给 LLM。只有真正需要语义判断的才用 LLM。

## 9. No Leap / No Orphan / Single Ownership / No Hidden Design / Evidence over Claim

- 不跳步（Problem→Requirement→Logic→Architecture→Design）
- 无孤儿（每条 REQ/功能/元素可回溯"为什么存在"）
- 唯一主责（每个逻辑责任/关键状态有且只有一个权威拥有者）
- 无隐藏设计（代码里的设计决策升格为 ADR）
- 证据高于宣称（PASS/FAIL 必须有证据链）

## 10. 新开发必须挂 REQ

任何新功能先在 `docs/SE/P2-requirements.md` 登记 REQ（或被拒绝），实现后 P7 补证据。差距驱动待办——只允许"消掉哪个差距做什么"。

## 11. 工程实践

- 测试从包目录跑（`cd ts && npx vitest run`），不从根跑
- codegen 生成物（`@pf/client/generated`）禁止手改，重跑 `npm run generate`
- 提交用 conventional commit（`feat(core): ...`）
- 退出/清理：TUI 恢复终端、server 清理进程、PG 模式确保 schema
