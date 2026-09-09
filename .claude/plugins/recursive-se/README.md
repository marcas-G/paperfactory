# recursive-se

递归式需求驱动系统工程插件（NASA Systems Engineering × V-Model）。

**任何系统、任何层级，同一套问题结构**：问题 → 干系人 → 需求 → 逻辑 → 架构 →（递归判断：够简单做详设，还是提升为新 SoI 重走一遍）→ 详设 → 实现 → 验证 → 确认。整个工程是**递归树**，不是单链条。

## 组成

- **10 个 skills**：P0-P8 九阶段各一（按需加载该阶段的问答结构与 Exit Gate）+ 递归判断（P4 后强制分叉）
- **5 个命令**：
  - `/se-start [soi]` 新 SoI 立项（建 docs/SE 骨架，从 P0 开始）
  - `/se-next` 推进下一阶段（先验收上阶段 Exit Gate，不放过关）
  - `/se-tree` 递归树与各 SoI 进度
  - `/se-gap` 汇总 P7 矩阵差距 = 差距驱动的路线图
  - `/se-discipline` 五条纪律速查
- **状态全部落盘在项目的 `docs/SE/`**：插件无状态，项目持有真相（换 AI/换机器/人看，同一套事实）。

## 核心机制

1. **命令/技能分离**：命令管流程编排（判断在哪、过闸、加载哪个 skill），技能管阶段方法论（问什么、什么算合格）。
2. **Exit Gate 是闸不是装饰**：`/se-next` 先验收上一阶段六问，答不满停下补齐。
3. **P4 是递归分叉点**：完成后强制 se-recursion-check，每元素判定"叶子→P5"或"提升 SoI→重走 P0"。
4. **两条使用规则**（写入项目 00-overview）：新开发必须挂 REQ；差距驱动待办。

## 安装（本地）

```bash
# 方式一：用户级（所有项目可用）
mkdir -p ~/.claude/plugins && cp -r <本目录> ~/.claude/plugins/recursive-se

# 方式二：项目级（仅当前项目）
mkdir -p .claude/plugins && cp -r <本目录> .claude/plugins/recursive-se
```

## 产出的文档形态（在项目中）

```
docs/SE/
├── 00-overview.md            索引 + 使用规则
└── <soi-name>/               每个 SoI 一套（子 SoI 目录名：<父>--<元素>）
    ├── P0-problem.md         …P8-validation.md
    └── P7-verification.md    ★ REQ×证据矩阵（差距的来源）
```

## 方法论来源

《递归式需求驱动系统工程开发手册：NASA Systems Engineering × V-Model》。
