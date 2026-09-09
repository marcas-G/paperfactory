---
name: se-p7-verification
description: 递归式系统工程的 P7 验证阶段。当用户要验证需求被实现、建证据矩阵、跑验收测试、做 V&V 时使用。回答"有没有客观证据证明规格被正确实现"（Did we build it right）。与 P8（做的是对的东西）严格区分。
---

# P7 — Verification

> 本阶段唯一核心问题：**有什么客观证据证明当前 SoI 符合它定义的 Specification？**
> = Did we build it **right**?（P8 才问 right thing）

## 铁律：证据链

```
REQ → Verification Method → Acceptance Criterion → Evidence → PASS / FAIL / BLOCKED
```
**"应该没问题 / 基本实现 / 覆盖率很高" 都不是证据。**

## 五问

### P7-Q1 每条 Requirement 是否有验证证据？

对 P2 台账逐条出证据（四选一或组合）：**Test / Analysis / Demonstration / Inspection**。
反例（禁）：`牵引供电系统整体测试正常`——哪条 REQ？什么判据？什么证据？

### P7-Q2 接口 Contract 是否得到验证？

每个 P4-Q5/P5-Q1 接口：两端**联合**验证（不是各自测完就宣称接口没问题）。

### P7-Q3 多元素集成后是否符合预期？

跨元素场景级验证（回放 P1 的 C 场景逐条测）。

### P7-Q4 异常和边界条件是否得到验证？

故障注入 / 降级路径 / 恢复判据（P5-Q4/Q6 的每条都要有对应验证）。

### P7-Q5 还有哪些 Verification Gap？

汇总：无法验证的 REQ（缺工具/缺环境/成本过高）→ 显式 BLOCKED + 风险声明。
**未验证 ≠ 失败，但未验证未声明 = 失败。**

## 集成与递归（V 模型的右翼）

子 SoI 各自 P7 通过 ≠ 父级通过：**父级要对自己 P3 的跨元素逻辑（时序/失败响应）再做集成验证**——这是 V 模型左右翼的对应关系。

## 输出规范

`docs/SE/<soi-name>/P7-verification.md`：REQ×证据矩阵（REQ / 方法 / 判据 / 证据指针 / 状态）+ Gap 清单 + 汇总行（PASS x / FAIL x / BLOCKED x）。FAIL/BLOCKED = 路线图。

## Exit Gate

每 REQ 三态显式（无"默认过"）？接口联合验证？异常路径覆盖？Gap 有风险声明？
