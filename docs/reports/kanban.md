# PaperFactory 开发看板

> 自动同步自 `docs/reports/progress.json`
> 最后更新: 2026-09-04

---

## 总览

| Phase | 名称 | 状态 | 进度 | 预估 |
|-------|------|------|------|------|
| **Phase 0** | TS 脚手架 + 领域模型 | 🟡 Pending | 0/12 | 12h |
| **Phase 1** | 持久化层 | 🔴 Blocked | 0/- | 16h |
| **Phase 2** | 核心控制面 | 🔴 Blocked | 0/- | 24h |
| **Phase 3** | Provider + Tool + Agent Loop | 🔴 Blocked | 0/- | 32h |
| **Phase 4** | 科研能力层 (第一批) | 🔴 Blocked | 0/- | 20h |
| **Phase 5** | Subagent + ExecutionBlock + Hook | 🔴 Blocked | 0/- | 20h |
| **Phase 6** | 科研能力层 (第二批) | 🔴 Blocked | 0/- | 24h |
| **Phase 7** | Workflow + API | 🔴 Blocked | 0/- | 20h |
| **Phase 8** | 可观测性 + 评估 | 🔴 Blocked | 0/- | 16h |
| **Phase 9** | 前端 | 🔴 Blocked | 0/- | 40h |
| **合计** | | | **0/12** | **~224h** |

---

## Phase 0: TS 脚手架 + 领域模型 + 测试基础

### 任务列表

| ID | 任务 | 依赖 | 状态 |
|----|------|------|------|
| T001 | pnpm + tsup + vitest 项目初始化 | 无 | ⬜ Pending |
| T002 | Domain 基础设施: IDs + Enums + Events | T001 | ⬜ Pending |
| T003 | ResearchQuestion Schema + 测试 | T002 | ⬜ Pending |
| T004 | KnowledgeItem Schema + 测试 | T002 | ⬜ Pending |
| T005 | ResearchGap Schema + 测试 | T002 | ⬜ Pending |
| T006 | Hypothesis Schema + 不变量测试 | T002 | ⬜ Pending |
| T007 | Protocol Schema + FROZEN 不变量测试 | T002 | ⬜ Pending |
| T008 | Experiment + Result Schema + 测试 | T002 | ⬜ Pending |
| T009 | Evidence + Claim Schema + 测试 | T002 | ⬜ Pending |
| T010 | ResearchFailure + Report + Submission | T002 | ⬜ Pending |
| T011 | 测试数据工厂 + index.ts | T003~T010 | ⬜ Pending |
| T012 | CI 门禁集成 + 覆盖率阈值 | T011 | ⬜ Pending |

### 依赖图

```
T001 → T002 → T003 ─┐
                 → T004 ─┐
                 → T005 ─┤
                 → T006 ─┤
                 → T007 ─┤
                 → T008 ─┤
                 → T009 ─┤
                 → T010 ─┼→ T011 → T012
```

---

## 已完成 Phase 报告

| Phase | 报告 | 日期 |
|-------|------|------|
| *(暂无)* | | |

---

## CI 状态

| 流水线 | 状态 |
|--------|------|
| Python Tests | ✅ 852 passed, 95% coverage |
| Python Lint | ✅ All checks passed |
| Python Docker Build | ✅ Success |
| TypeScript | ⏳ 待 Phase 0 完成 |
