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
| REQ-R5 | 人工抽查 | 三份报告引用均可点开；**程序化校验缺失** | 🟡 PARTIAL |
| REQ-R6 | 实测 | SSE 事件流完整（thinking/tool:calling/result 逐条） | ✅ PASS |
| REQ-G1 | 代码+单测存在 | **端到端 manual 全流程未实测** | 🟡 PARTIAL |
| REQ-G2 | 单测（test/core/control/gates 等） | gates 三态判定用例 | ✅ 对象层 PASS |
| REQ-G3 | API 端点存在（chain） | 前端下钻未打通 | 🟡 PARTIAL |
| REQ-G4 | 实测 | 网关 502/断线场景重试+降级记录（fallback 警告实证） | ✅ PASS |
| REQ-REC1 | **杀进程实测** | 重启后 19 事件按 seq 补发 | ✅ PASS |
| REQ-REC2 | 杀进程实测（2026-09-09） | 轮1建项目→杀→轮2 GET /api/projects 返回该项目（投影重建：object:mutated 事件入账本+启动重放） | ✅ PASS |
| REQ-REC3 | 代码存在 | PG 模式未端到端实测 | 🟡 PARTIAL |
| REQ-REC4 | 无实现 | — | ❌ FAIL(未实现) |
| REQ-REC5 | 部分 | maxIterations 用例在；超时/截断无 | 🟡 PARTIAL |
| REQ-M1 | 双终端实测 | POST 202 秒回 + 事件流收到 run:start/phase:start | ✅ PASS |
| REQ-M2 | **一致性测试+幂等实测** | test/protocol（46 用例双向对齐）；codegen md5 复验 | ✅ PASS |
| REQ-M3 | 浏览器走查 | ResearchView 链路通；其余视图旧栈 | 🟡 PARTIAL |
| REQ-M4 | **亲手终端实测** | TUI 渲染 8 阶段时间线（含 error 事件入账渲染） | ✅ PASS |
| REQ-M5 | 文档审查 | PROTOCOL.md 覆盖 33 端点+13 事件 | ✅ PASS |
| REQ-E1 | **注入实测** | 违规 import → 红（含文件:行）；撤销 → 绿 | ✅ PASS |
| REQ-E2 | 全量回归 | 523/523 + tsc 零错（多轮复验） | ✅ PASS |
| REQ-E3 | 文档审查（2026-09-09） | README 已重写为六包/协议/SE 现实（每节对照真实文件） | ✅ PASS |
| REQ-E4 | git 验证 | tag python-legacy-final 后移除（packages/apps/tests/pyproject 等 158 文件）；ts 526/526 不受影响；compose 无悬空引用 | ✅ PASS |

## 汇总

```text
PASS 13 · PARTIAL 6 · FAIL 4
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
