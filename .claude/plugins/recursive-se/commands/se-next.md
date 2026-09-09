---
description: 推进当前 SoI 的下一阶段（自动判断位置，过 Exit Gate 才放行）
argument-hint: [soi-name 可选]
---

推进递归式 SE 流程的下一步。

## 执行步骤

1. **定位**：读 `docs/SE/` 目录（`$ARGUMENTS` 指定 SoI，否则取最近修改的那个），根据已存在的 P0-P8 文件判断当前停在哪个阶段。
2. **先验收上一阶段**：加载上一阶段的 skill，逐条过它的 Exit Gate——任何一问答不满，**停下补齐，不放行**（把缺口列出请用户决策：补 / 修改上阶段文档 / 明示接受并记录原因）。
3. **执行下一阶段**：加载对应 skill，与用户协作完成该阶段问答，按 skill 的输出规范写入 `docs/SE/<soi>/`。
4. 提示再下一步。

## 阶段序列与特殊跳转

```
P0 → P1 → P2 → P3 → P4 → 【se-recursion-check 强制介入】
  ├─ 全部元素是叶子 → P5（逐叶子）→ P6 → P7 → P8
  └─ 有元素要提升  → 对该元素 /se-start <新soi>（递归下钻，父级暂停在 P4→P5 之间）
```

- P4 完成后**必须**执行 recursion-check（调用 Skill `se-recursion-check`），不许直接跳 P5。
- P2 完成时若 P3 产生派生需求，回写 P2 台账后再进 P4。
- P7 的 FAIL/BLOCKED 若用户选择"带伤前进"，须在 P7 文档记录风险声明后进 P8。

## 底线

任何阶段答不出核心问题 = 停在那里，宁停勿跳（Rule 1 No Leap）。
