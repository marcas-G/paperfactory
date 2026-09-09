# PaperFactory 系统工程基线（NASA SE × V-Model）

> 本目录是整个软件的**问题驱动开发基线**：P0-P8 九阶段，每阶段回答一个层次的问题，
> 需求经 REQ 编号贯穿到验证证据。方法论模板见仓库根
> 《NASA Systems Engineering × V-Model：问题驱动的软件开发阶段模板.md》。

## 阶段文档与状态

| 阶段 | 文档 | 状态 | 说明 |
|---|---|---|---|
| P0 问题定义 | `P0-problem.md` | 基线 | 为什么需要 PaperFactory |
| P1 干系人与运行概念 | `P1-stakeholders-conops.md` | 基线 | 谁在什么环境怎样使用 |
| P2 系统需求 | `P2-requirements.md` | 基线 | REQ-编号的可验证能力清单 |
| P3 逻辑分解 | `P3-logical-decomposition.md` | 基线 | 研究循环的逻辑步骤 |
| P4 架构设计 | `P4-architecture.md` | 基线 | 六包/账本/协议的职责映射 |
| P5 详细设计 | `P5-detailed-design.md` | 基线 | 关键模块精确行为 |
| P6 实现 | `P6-implementation.md` | 回溯 | 已有代码对照设计的映射与已知偏差 |
| P7 验证 | `P7-verification.md` | 回溯 | 测试/实测 → REQ 覆盖矩阵 + 缺口 |
| P8 确认 | `P8-validation.md` | 部分 | 实战证据（铁人三轮）+ 待补验证 |

## 基线的两条使用规则

1. **新开发必须挂 REQ**：任何新功能先在 P2 登记 REQ（或被拒绝），实现后 P7 补证据。
   无 REQ 的代码视为规格外代码（技术上可存在，工程上不算交付）。
2. **差距驱动待办**：`[UNIMPLEMENTED]` / `[PARTIAL]` 标记的 REQ 就是路线图——
   不允许"想起来做什么做什么"，只允许"消掉哪个差距做什么"。

## 与项目宪法的关系

`.claude/CLAUDE.md`（52 条）定义**原则**；本目录定义**可验证的规格与证据**。
宪法说"Gate 优先于 Prompt"，这里给出每个 Gate 的 REQ 编号和 PASS 证据。
