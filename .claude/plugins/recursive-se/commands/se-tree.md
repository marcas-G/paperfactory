---
description: 显示 SE 递归树——各 SoI 的层级与阶段进度
---

扫描 `docs/SE/` 全部 SoI 目录，渲染递归树与进度。

## 执行步骤

1. 列出 `docs/SE/` 下全部 SoI 目录（目录名含 `--` 的为子 SoI，如 `metro-x--traction-power`）。
2. 对每个 SoI 检查 P0-P8 文件存在性与完成标记（文档末尾是否有 Exit Gate 自查表）。
3. 渲染：

```
metro-x                      [P0✓ P1✓ P2✓ P3✓ P4✓ → 递归判断✓ | P5✓ P6… P7… P8…]
├── metro-x--rolling-stock   [P0✓ P1✓ P2… → 停在 P2]
├── metro-x--signaling       [P0✓ … 判定：叶子 → P5✓ P6✓]
└── metro-x--traction-power  [P0✓ P1✓ P2✓ P3✓ P4✓ → 3 元素：2 叶子 1 提升]
    └── traction-power--substation-A [P0…]
```

4. 标出"卡点"：每个非终态 SoI 的下一步动作（如 `→ /se-next 将进 P3`）。

## 注意

目录树 = 物理化的递归树。若发现子 SoI 目录与父级 P4 递归判断表不一致（判断表没登记却建了目录，或反之），如实报告——这是文档漂移，需修正。
