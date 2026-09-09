# P7 — Verification（回溯基线）

> 阶段唯一问题：**是否有证据证明规格被正确实现？**
> 链条：REQ → Criterion → Test/实测 → Evidence → 状态。无证据 = 未验证。

## 覆盖矩阵

| REQ | 验证方式 | 证据 | 判定 |
|---|---|---|---|
| REQ-R1 | 实测（多轮） | arXiv/S2 真论文+URL；http→https 修复记录 | ✅ PASS |
| REQ-R2 | 实测 | CS 错配文献对教育心理学问题 0 入库（LLM 评估过滤） | ✅ PASS |
| REQ-R3 | 单测+代码检查 | hypothesis 工厂含 falsificationCondition；research 命令真落库 | ✅ PASS |
| REQ-R4 | 实测 | sandbox 真执行（print→2 实测；LLM 协议实验 SUPPORTING 0.85） | ✅ PASS |
| REQ-R5 | 单测（test/research/citation-gate） | enforceCitationGate：报告引用⊆知识库来源（arXiv 版本归一/中文标点安全/非学术链接放行）；**接入点待 REQ-R5b** | 🟡 PARTIAL(函数就绪) |
| REQ-R6 | 实测 | SSE 事件流完整（thinking/tool:calling/result 逐条） | ✅ PASS |
| REQ-G1 | e2e 测试（test/server/approval-flow） | manual：阶段完成挂起→awaiting_approval 事件→decision(approve)→研究恢复推进，全链 86ms 可回归 | ✅ PASS |
| REQ-G2 | 单测（test/core/control/gates 等） | gates 三态判定用例 | ✅ 对象层 PASS |
| REQ-G3 | API 端点存在（chain） | 前端下钻未打通 | 🟡 PARTIAL |
| REQ-G4 | 实测 | 网关 502/断线场景重试+降级记录（fallback 警告实证） | ✅ PASS |
| REQ-REC1 | **杀进程实测** | 重启后 19 事件按 seq 补发 | ✅ PASS |
| REQ-REC2 | 杀进程实测（2026-09-09） | 轮1建项目→杀→轮2 GET /api/projects 返回该项目（投影重建：object:mutated 事件入账本+启动重放） | ✅ PASS |
| REQ-REC3 | 代码存在 | PG 模式未端到端实测 | 🟡 PARTIAL |
| REQ-REC4 | 无实现 | — | ❌ FAIL(未实现) |
| REQ-REC5 | 单测+代码审查（2026-09-09） | agent loop 三刹车：LLM 超时(120s 可env)/工具超时(30s)/工具输出回填截断(8k chars)；core 214 测试绿 | ✅ PASS（持续集成防回归） |
| REQ-M1 | 双终端实测 | POST 202 秒回 + 事件流收到 run:start/phase:start | ✅ PASS |
| REQ-M2 | **一致性测试+幂等实测** | test/protocol（46 用例双向对齐）；codegen md5 复验 | ✅ PASS |
| REQ-M3 | 浏览器走查 | ResearchView 链路通；其余视图旧栈 | 🟡 PARTIAL |
| REQ-M4 | **亲手终端实测** | TUI 渲染 8 阶段时间线（含 error 事件入账渲染） | ✅ PASS |
| REQ-M5 | 文档审查 | PROTOCOL.md 覆盖 33 端点+13 事件 | ✅ PASS |
| REQ-E1 | **注入实测** | 违规 import → 红（含文件:行）；撤销 → 绿 | ✅ PASS |
| REQ-E2 | 全量回归 | 523/523 + tsc 零错（多轮复验） | ✅ PASS |
| REQ-E3 | 文档审查（2026-09-09） | README 已重写为六包/协议/SE 现实（每节对照真实文件） | ✅ PASS |
| REQ-E4 | git 验证 | tag python-legacy-final 后移除（packages/apps/tests/pyproject 等 158 文件）；ts 526/526 不受影响；compose 无悬空引用 | ✅ PASS |

### 新登记差距（2026-09-09 发现）

| REQ | 能力 | 状态 |
|---|---|---|
| REQ-R5b | agent-research 版报告正文落库（当前 Report 对象仅 title/status 空壳，正文未持久化——citation gate 的接入前提） | ❌ 未实现 |

## 汇总

```text
PASS 17 · PARTIAL 2 · FAIL 1（+新登记 R5b）
FAIL 即路线图：R5b(报告正文落库) > REC4(断点续跑)
PARTIAL 补验：M3/M2b(视图迁移)
FAIL 即路线图：REC2(投影重建) > E3/E4(文档遗产) > REC4(断点续跑)
PARTIAL 补验顺序：G1(manual 实测) → REC5(刹车) → R5(引用 gate) → M3/M2b(视图迁移)
```

## 回归防线（已固化）

```text
每次合并前必须：tsc --noEmit 零错 + vitest 全绿（含架构测试/契约对齐/账本用例）
生成物校验：codegen 重跑 diff 必须为空
```

## P7 Exit Gate 自查

| 问 | 答 |
|---|---|
| 每条 REQ 有验证方式或显式 FAIL | 是（24/24 全覆盖） |
| 证据可复查 | 实测过程在会话记录；测试在仓库 |
| 无"应该没问题"式判定 | 是——全部 PASS/FAIL/PARTIAL 三态显式 |
