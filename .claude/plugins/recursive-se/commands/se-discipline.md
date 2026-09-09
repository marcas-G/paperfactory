---
description: 五条最高优先级工程纪律速查（No Leap / No Orphan / Single Ownership / No Hidden Design / Evidence over Claim）
---

在任何 SE 阶段工作时，以下五条纪律优先级高于进度压力：

## Rule 1 — No Leap（不跳步）

禁止从"需要 X"直接跳到"建设方案 Y"。中间必须走完：
`Problem → Requirement → Logical Function → Architecture Alternatives → Trade-off → Design`

## Rule 2 — No Orphan（无孤儿）

任何 Requirement / 逻辑功能 / 元素 / 接口 / 验证用例，都必须能回答"**我为什么存在**"——向上追到某个需求或场景。追不到 = 删。

## Rule 3 — Single Primary Ownership（唯一主责）

任何逻辑责任、关键状态、共享资源，**有且只有一个**主要承担者/权威拥有者。协作者可以有，责任必须唯一——出问题知道找谁。

## Rule 4 — No Hidden Design（无隐藏设计）

写代码/施工时做的设计决策必须升格为显式 ADR 回写文档。**藏在实现里的设计决策不算存在**——它会在下一个人"重新设计"时爆炸。

## Rule 5 — Evidence over Claim（证据高于宣称）

任何"已完成/已满足"的判定必须给证据链：`REQ → 判据 → 证据 → PASS/FAIL`。
"应该没问题 / 基本实现 / 测过了"都不是证据。

---

冲突裁决：进度 vs 纪律 → 纪律赢；用户催 vs 证据缺 → 缺证据就标 BLOCKED，不粉饰。
