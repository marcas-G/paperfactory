---
name: se-p8-validation
description: 递归式系统工程的 P8 确认阶段。当用户要验证"系统是否真正解决了最初的问题"、做实战/真实环境验收、写最终判定时使用。回答 Did we build the right thing。与 P7（规格符合性）严格区分。
---

# P8 — Validation

> 本阶段唯一核心问题：**当前 SoI 最终有没有完成它存在的使命？**
> = Did we build the **right thing**?（P7 全 PASS 不代表 P8 PASS）

## 关键认知：Validation 在不同层级含义不同

> P8 不是每级都问最终用户满不满意，而是问：**当前 SoI 是否在它的父系统环境中真正完成了被赋予的使命？**
> （顶层问城市交通问题解决了吗；子系统问它真为线路提供了可靠牵引能源吗；不越级提问）

## 四问

### P8-Q1 当前 SoI 是否完成 Intended Mission？

`System-of-Interest / Intended Mission / Operational Context / Observed Outcome / Conclusion`。
反例（禁）：`所有验收试验都通过了，因此 Validation PASS`——那是 Verification 证据，不是使命完成。

### P8-Q2 P0 定义的问题是否真正得到改善？

回到本 SoI 的 P0 四问原文，逐条对照现实变化（P0-Q4 的 Outcome 承诺兑现了吗）。
**必须引用 P0 原文**，不许凭现在的记忆重述问题（记忆会漂移）。

### P8-Q3 真实运行环境下是否仍然成立？

受控验证之外：真实负载/真实用户/真实干扰下结论是否保持。

### P8-Q4 是否存在"所有规格都满足，但使命仍然失败"的情况？

主动找这类缺口（规格化的需求漏掉了使命的本质维度）——找到了就是下一代需求的最重要输入。
这问是 Validation 的灵魂：**它是唯一能发现"完美实现了错误的东西"的关卡。**

## 输出规范

`docs/SE/<soi-name>/P8-validation.md`：使命核对表（P0 承诺×现实）+ 实战证据（V-x 编号）+ 待补验证 + 最终判定（三选一：Mission satisfied / Partially / Not yet——**不许粉饰**）。

## 父级 P8 的输入

子 SoI 的 P8 结论是父级 P7-Q3（集成验证）与父级 P8 的证据之一——递归树向上汇聚。

## Exit Gate

引 P0 原文核对？真实环境证据？P8-Q4 主动找了使命缺口？判定诚实？
