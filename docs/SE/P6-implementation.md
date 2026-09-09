# P6 — Implementation（回溯基线）

> 阶段唯一问题：**代码是否忠实实现既定设计？** 本文是设计 ↔ 代码的映射与**已知偏差清单**。

## 设计 → 代码映射

| 设计元素（P4/P5） | 代码位置 | 忠实度 |
|---|---|---|
| schema 契约 | ts/packages/schema/src（17 文件，工厂+Schema） | ✅ |
| 状态机/门/控制器 | ts/packages/core/src/control | ✅ |
| agent loop | ts/packages/core/src/runtime/agent/loop.ts | ✅（预算仅 maxIterations，见偏差 B3） |
| 工具三段式+registry | core/src/runtime/tools（4 内置工具） | ✅ |
| 事件账本 | server/src/events.ts + SQLite | ✅（实测跨重启重放） |
| 命令受理 | server/src/routes/research-runs.ts | ✅（202 秒回实测） |
| SSE 统一流 | server/src/events.ts /api/events | ✅ |
| 审批 | research-runs.ts（挂起）+ phases.ts（decision 端点） | 🟡 见偏差 B1 |
| 文献工具 | core/src/runtime/tools/builtins/literature.ts | ✅（双源+重试实测） |
| 研究编排 | research/src（phase-contracts 8 阶段 + agent-research） | ✅ |
| 契约+codegen | protocol/src + client/script/generate.ts | ✅（幂等 md5 实证） |
| TUI | packages/tui/src（3 文件） | ✅（终端渲染实测） |
| web 壳 | frontend/src（ResearchView 走新 SDK） | 🟡 见偏差 B2 |
| 组装根 | ts/src/app/index.ts（手工装配全部依赖） | ✅ 见偏差 B5 |

## 已知偏差清单（设计 vs 实现）

| # | 偏差 | 对应 REQ | 处置 |
|---|---|---|---|
| B1 | 审批链路代码在、**端到端从未实测**（manual 模式全流程） | REQ-G1 | 列入 P7 待验证 |
| B2 | web 仅 ResearchView 用新 SDK；Projects/Papers 视图仍旧直调 | REQ-M3 🟡 | 待迁移 |
| B3 | 预算刹车只有 maxIterations；无每动作超时/输出截断 | REQ-REC5 🟡 | 待补齐 |
| B4 | ~~无投影重建~~ **RESOLVED**（2026-09-09）：ProjectingObjectStore 双写 + 启动重放；526 测试含 3 条投影用例 + 重启实测 | REQ-REC2 ✅ | 已闭环 |
| B5 | 组装根手工 new（依赖图隐在函数体，非声明式） | 工程偏好 | 暂接受（架构测试守边界即可） |
| B6 | 旧 /api/research/stream 端点与新架构并存 | 协议纯度 | 待废弃标注 |
| B7 | 报告引用约束（REQ-R5）未程序化校验 | REQ-R5 🟡 | 待加 gate |
| B8 | Python 旧版整层滞留、README 描述旧架构 | REQ-E3/E4 ❌ | 待退役 |

## P6 Exit Gate 自查

| 问 | 答 |
|---|---|
| 每设计元素有代码落点 | 是（映射表全覆盖） |
| 偏差全部显式 | B1-B8 八条，无已知未列项 |
| 无规格外功能 | 重组/账本/SDK/TUI 均可追溯到 P3 逻辑（L3/L4） |
