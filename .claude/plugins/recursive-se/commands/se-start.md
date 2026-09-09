---
description: 为一个新系统/子系统（SoI）立项——建立 docs/SE 骨架并从 P0 开始
argument-hint: [soi-name 可选，默认当前项目主系统]
---

为新的 System-of-Interest 启动递归式系统工程流程。

## 执行步骤

1. 确定 SoI 名称：用用户提供的 `$ARGUMENTS`；未提供则询问"这个 SoI 一句话叫什么、父级是谁（顶层则说 top）"。
2. 建目录 `docs/SE/<soi-name>/` 与 `docs/SE/00-overview.md`（若不存在——包含：阶段文档索引表、两条使用规则：①新开发必须挂 REQ ②差距驱动待办）。
3. 调用 Skill `se-p0-problem`，与用户协作完成 P0 五问（可先基于对话上下文起草，再请用户逐问确认/修正——**用户确认才算过**）。
4. P0 Exit Gate 六问自查全过后，写入 `docs/SE/<soi-name>/P0-problem.md`，并提示用户下一步用 `/se-next` 进 P1。

## 注意

- 若这是子 SoI（有父级）：先读取父级 `docs/SE/<父>/P4-architecture.md` 中该元素的职责与接口合约——它们是本 SoI 的 P1/P2 硬边界输入（引用原文，不重述）。
- 全程遵守 se-discipline 五条纪律。
