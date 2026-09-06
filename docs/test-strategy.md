# PaperFactory 分层测试方案

## 目标

**清晰的分层 + 每层独立可运行 + 无重复 + 统一 fixture**

## 分层架构

```
test/
├── fixtures/            # 共享 fixture factory
│   ├── test-context.ts  #   → 统一创建 ObjectStore + Controller + Provider
│   └── deterministic.ts #   → 统一创建 DeterministicProvider
│
├── domain/              # 第 1 层：纯函数，无依赖
│   ├── events.test.ts
│   ├── enums.test.ts
│   ├── ids.test.ts
│   ├── project.test.ts
│   └── objects/         #   每个对象 1 个文件，测试 createX 工厂 + 约束
│
├── cognition/           # 第 2 层：认知模式
│   └── modes.test.ts
│
├── persistence/         # 第 3 层：内存 store（无外部依赖）
│   ├── object-store.test.ts
│   └── event-store.test.ts
│
├── control/             # 第 4 层：控制器 + 引擎 + 规则
│   ├── engine.test.ts
│   ├── actions.test.ts
│   ├── gates.test.ts
│   ├── policy.test.ts
│   ├── controller.test.ts
│   ├── branches.test.ts
│   ├── approvals.test.ts
│   └── tasks.test.ts
│
├── runtime/             # 第 5 层：Agent + 工具 + 引擎
│   ├── agent/           #   Agent loop
│   ├── tools/           #   工具（搜索/代码/文件系统）
│   ├── workflows/       #   引擎（ToT/Debate/CoVe/SelfCons/SelfReview）
│   ├── provider.test.ts
│   ├── hooks/
│   └── sandbox/
│
├── api/                 # 第 6 层：HTTP 端点
│   └── routes.test.ts   #   合并后的唯一 API 测试
│
├── integration/         # 外部依赖（DB / HTTP / 网络）
│   ├── database.test.ts
│   ├── pg-stores.test.ts  #   合并 PG object + event store
│   └── provider.test.ts   #   OpenAI HTTP 调用
│
├── e2e/                 # 端到端（仅 2 个）
│   ├── research-flow.test.ts  #   合并 full-research-flow + full-pipeline
│   └── thinking-paradigms.test.ts  #   思考范式验证
│
└── app/                 # App 初始化 + CLI
    ├── index.test.ts
    └── cli.test.ts
```

## 合并/删除清单

| 操作 | 文件 | 理由 |
|------|------|------|
| **删除** | `api/crud.test.ts` | 功能被 `api/hono-routes.test.ts` 覆盖 |
| **删除** | `api/routes.test.ts` | 功能被 `api/hono-routes.test.ts` 覆盖 |
| **合并→** `api/routes.test.ts` | `api/hono-routes.test.ts` + `api/integration.test.ts` | 同一套 setup，统一为唯一 API 测试 |
| **删除** | `e2e/full-pipeline.test.ts` | 和 `e2e/full-research-flow.test.ts` 同一模式 |
| **合并→** `e2e/research-flow.test.ts` | `e2e/full-research-flow.test.ts` | 重命名，清理 |
| **删除** | `e2e/agent-loop.test.ts` | 功能被 `runtime/agent/loop.test.ts` + `react-reflexion.test.ts` 覆盖 |
| **删除** | `e2e/backtrack-correction.test.ts` | 和 `e2e/hypothesis-verification.test.ts` 重复 |
| **合并→** `e2e/hypothesis-verification.test.ts` | `e2e/backtrack-correction.test.ts` 的独特测试 | 保留已有文件 |
| **保留** | `e2e/thinking-paradigms.test.ts` | 思考范式 E2E，和 runtime 版本粒度不同 |
| **保留** | `e2e/report-generation.test.ts` | 报告生成 E2E |
| **保留** | `runtime/workflows/thinking-paradigm-integration.test.ts` | Phase 级别集成，和 e2e 粒度不同 |
| **删除** | `runtime/blocks/execution-block.test.ts` | 对应源码未被主流程使用 |
| **删除** | `runtime/subagent/executor.test.ts` | 对应源码未被主流程使用 |
| **保留** | `runtime/workflows/parallel.test.ts` | 工作流引擎 |
| **保留** | `runtime/workflows/pipeline.test.ts` | 工作流引擎 |

## Fixture 统一

所有需要 ObjectStore + Controller 的测试统一使用 `createTestContext()` from `fixtures/test-context.ts`。

## 每层运行命令

```bash
# 第 1-2 层：纯函数（快，<1s）
vitest run test/domain/ test/cognition/

# 第 3 层：内存 store（快，<1s）
vitest run test/persistence/

# 第 4 层：control（快，<2s）
vitest run test/control/

# 第 5 层：runtime（中速，<10s）
vitest run test/runtime/

# 第 6 层：API（中速，<5s）
vitest run test/api/

# 外部依赖（需要 Docker）
vitest run test/integration/

# E2E（慢，<30s）
vitest run test/e2e/

# App
vitest run test/app/
```
