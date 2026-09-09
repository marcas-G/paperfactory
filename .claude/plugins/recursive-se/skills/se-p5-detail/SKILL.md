---
name: se-p5-detail
description: 递归式系统工程的 P5 详细设计阶段。当用户对叶子元素做详细设计、定义精确接口契约/不变量/异常语义，或说"P5/详细设计"时使用。只对递归判断中判定为"叶子"的元素执行。
---

# P5 — Detailed Design

> 本阶段唯一核心问题：**这个叶子元素具体怎样工作？**
> P4 回答"谁负责"，P5 回答"具体怎样做到"。**只对叶子元素执行**（见 se-recursion-check）。

## 六问

### P5-Q1 外部接口的精确定义？

每个接口五件套：`Interface / Input / Output / Preconditions / Postconditions`。
反例（禁）：`整流设备把交流电变成直流电`——不足以形成可实现契约。

### P5-Q2 核心参数、内部状态和不变量？

`Parameters / States / Invariant: Always [...]`。
**不变量是设计的灵魂**：任何时刻都必须成立的命题（P7 会直接对它出测试）。

### P5-Q3 内部工作流程或机制？

达到 P5-Q1 契约的内部步骤/机制（可精确到算法/状态流转）。

### P5-Q4 异常和故障语义？

每个故障：检测方式 / 内部响应 / 对外表现（调用方看到什么）/ 恢复路径。
反例（禁）：`出错时记录日志`——调用方视角的语义呢？

### P5-Q5 并行、冗余、一致性和资源共享规则？

`Shared Resource / Normal Configuration / Failure Configuration / Coordination Rule`。
要求：单点故障的扩散边界必须显式（不得因 A 坏导致健康的 B 被误伤）。

### P5-Q6 生命周期和维护规则？

`Lifecycle / Inspection / Maintenance / Replacement / Return-to-Service Criteria`。
**重新投入服务的判据必须明确**（修完≠能用，要有检查判据）。

## 输出规范

`docs/SE/<soi-name>/P5-detail--<元素名>.md`（每叶子一份）或合并 `P5-detailed-design.md`。

## Exit Gate

接口五件套齐？不变量可测？故障有对外语义？单点故障边界显式？恢复判据明确？
