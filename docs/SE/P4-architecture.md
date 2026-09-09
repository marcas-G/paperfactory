# P4 — Architecture Design

> 阶段唯一问题：**哪些系统元素承担 P3 的逻辑责任？**

## 元素总览（ts/packages 六包 + 协议）

```text
┌─ 壳层（可替换、可增）──────────────────────────────┐
│  apps: web(React) · packages/tui · 未来 app/desktop │
│      只依赖：@pf/protocol 契约 + @pf/client 生成SDK  │
├─ 协议层 ──────────────────────────────────────────┤
│  @pf/protocol  端点契约表 + 事件目录（唯一权威）      │
│  @pf/client    codegen 生成的 typed SDK + adapter   │
├─ 接入层 ──────────────────────────────────────────┤
│  @pf/server    Hono 路由 + SSE(/api/events) + 审批  │
├─ 领域层 ──────────────────────────────────────────┤
│  @pf/research  研究编排：phase-contracts·agent-research│
│  @pf/core      状态机·gates·agent loop·工具·账本·存储 │
│  @pf/schema    研究对象契约（最底层，零依赖）          │
├─ 外部 ────────────────────────────────────────────┤
│  LLM 网关 · arXiv/S2 · science-service(Python 沙箱) │
│  SQLite 账本 · (可选) PostgreSQL                     │
└───────────────────────────────────────────────────┘
依赖方向铁律：schema←core←research←server；壳只碰协议
守门：test/architecture/dependency-rules（违规即红）
```

## 逻辑责任 → 元素映射（P3 → P4 追踪）

| P3 逻辑 | 承担元素 |
|---|---|
| L1.1-L1.3 观察/识别/选择 | @pf/research（phase-contracts 声明 readObjects/writeObjects/tools） |
| L1.4 上下文组织 | @pf/research + @pf/core/cognition（认知模式） |
| L1.5 认知执行 | @pf/core/runtime（agent loop + provider） |
| L1.6 能力调用 | @pf/core/runtime/tools（registry + builtins + literature）+ science-service |
| L1.7 评估 | @pf/core/control/gates |
| L1.8 状态演进 | @pf/core/control（controller/transition engine） |
| L2.1-L2.4 治理 | @pf/core/control + @pf/server（审批端点） |
| L3.1 记账 | @pf/server/events（EventBus → SQLite 账本） |
| L3.2 重放 | /api/events + seq + Last-Event-ID |
| L3.3 重建 | ❌ **无元素承担（REQ-REC2 缺口的架构位）**——规划：core/persistence 增投影器 |
| L3.4 续跑 | ❌ 无（依赖 L3.3） |
| L4.1-L4.4 | @pf/protocol + @pf/client + docs/PROTOCOL.md |

## 关键架构决策（简式 ADR）

| # | 决策 | 理由 | 替代方案与否决原因 |
|---|---|---|---|
| ADR-1 | 命令/事件分离（202 秒回 + 统一 SSE） | 长任务不可挂连接；多端同构 | 否决：同步等待（超时/断线/重试三面墙） |
| ADR-2 | SQLite 事件账本（better-sqlite3 同步写） | append-only 天然适配；零部署；量级足够 | PG（REQ-REC3 再上，账本结构不变） |
| ADR-3 | 契约表 + 模板 codegen（非 OpenAPI 全家桶） | 轻量、类型直达、幂等可测 | effect HttpApi/OpenAPI（重，当前收益不配） |
| ADR-4 | 壳只碰协议（禁内部 import） | 多端平权；核心可重构不破壳 | 否决：壳直调内部（耦合，单端化） |
| ADR-5 | LLM 提议/系统裁决分离于 core/control | 宪法公理可测试 | 否决：LLM 直改状态（不可审计） |
| ADR-6 | 沙箱执行外置 science-service（Python） | 科学栈与 agent 栈解耦 | 内嵌（重依赖拖累核心） |

## P4 Exit Gate 自查

| 问 | 答 |
|---|---|
| P3 每步有元素承担 | 是，除 L3.3/L3.4（显式标注为缺口——诚实即规格） |
| 元素间职责无重叠 | 守门由架构测试锁定 |
| 关键决策可追溯 | ADR-1..6 各含理由与替代 |
