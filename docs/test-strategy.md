# PaperFactory 分层测试方案

## 目标

**清晰的分层 + 每层独立可运行 + 无重复 + 统一 fixture**

## 分层架构（8 层）

```
第 1 层  domain/        领域对象工厂、事件、ID、枚举（零依赖）
第 2 层  cognition/     认知模式（零依赖）
第 3 层  persistence/   持久化（→ domain）
第 4 层  control/       控制器、引擎、规则（→ domain, persistence）
第 5 层  runtime/       Agent loop、思考引擎（→ domain/enums, runtime 内部）
第 6 层  orchestration/ 编排器：phase/agent/hypothesis（→ 1-5）
第 7 层  api/           HTTP 端点 + SSE（→ 4-6）
第 8 层  app/           CLI, App 初始化（→ 全层 + evals + observability）
前端     frontend/      Vue 3 SPA，通过 HTTP 调用第 7 层 API
```

### 测试目录

```
test/
├── fixtures/            # 共享 fixture factory
│   └── test-context.ts  #   → 统一创建 ObjectStore + Controller + Provider
│
├── domain/              # 第 1 层
├── cognition/           # 第 2 层
├── persistence/         # 第 3 层
├── control/             # 第 4 层
├── runtime/             # 第 5 层（仅纯引擎）
├── orchestration/       # 第 6 层（编排器测试）
├── api/                 # 第 7 层
├── integration/         # 外部依赖（DB / HTTP / 网络）
├── e2e/                 # 端到端
└── app/                 # 第 8 层
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

# 第 6 层：orchestration（中速）
vitest run test/orchestration/

# 第 7 层：API（中速）
vitest run test/api/

# 第 8 层：app
vitest run test/app/

# 外部依赖（需要 Docker PG）
vitest run test/integration/

# E2E（慢，<30s）
vitest run test/e2e/
```
