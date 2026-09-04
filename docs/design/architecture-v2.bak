# PaperFactory 总体设计文档 v2

> 版本: 2.1 | 日期: 2026-09-03 | 状态: Draft
> **变更**: v2.0 → v2.1，技术栈从 Python 改为 TypeScript 全栈（含 Python 微服务处理科学计算）

---

## 目录

1. [问题定义](#1-问题定义)
2. [总体架构](#2-总体架构)
3. [核心设计](#3-核心设计)
   1. [Research Object 模型](#31-research-object-模型)
   2. [Research Action 定义](#32-research-action-定义)
   3. [Tool 系统设计](#33-tool-系统设计)
   4. [Skill 系统](#34-skill-系统)
   5. [ExecutionBlock 系统](#35-executionblock-系统)
   6. [Subagent 系统](#36-subagent-系统)
   7. [Workflow 编排](#37-workflow-编排)
   8. [状态管理](#38-状态管理)
   9. [认知管线](#39-认知管线已实现简要描述)
   10. [科研循环](#310-科研循环)
4. [目录结构](#4-目录结构)
5. [开发路线图](#5-开发路线图)

---

## 1. 问题定义

### 1.1 现有 Agent 在科研场景的 6 个根本问题

基于对 Claude Code、OpenCode、CrewAI、Aider、SWE-agent 等主流 Agent 系统的深度调研，
现有 Agent 系统无法胜任全链路科研自动化，原因如下：

#### 问题 1：状态 = 对话历史（根本问题）

**现状**: Claude Code 的状态存储为 `~/.claude/projects/<project>/<session-id>.jsonl`（对话历史 JSONL），
记忆系统为自由文本 Markdown（MEMORY.md 前 200 行/25KB 硬截断）。

**问题**:
- 无结构化项目状态——无状态机、无阶段标记、无进度追踪 schema
- 重启无法恢复研究阶段——"Sessions are independent. Each new session starts with a fresh context window"
- 无法回答"研究到哪了"——依赖 compact 后的摘要质量
- 无事务性——无 ACID 语义、无回滚、无一致性保证

**根因**: 对话模型的本质限制。LLM 的状态是概率分布，不是数据库。

#### 问题 2：可重现性缺失（根本问题）

**现状**: Claude Code 的 checkpoint 机制只追踪文件快照（每用户 prompt 前最多 100 个），
不追踪 Bash 命令修改的文件、不追踪 Subagent 编辑。

**问题**:
- 相同输入 ≠ 相同输出（LLM 非确定性采样）
- 实验运行不可重放——`python train.py` 的输出不在 checkpoint 中
- 文献搜索结果不可重现——Web 内容变化 + LLM 不同采样
- 无法回答"Day 3 的决策是基于什么信息"

**根因**: Stochastic decoding + 黑箱推理。无法构建可重现的科研流程。

#### 问题 3：证据溯源断裂（根本问题）

**现状**: Subagent 只返回最终文本响应，compact 后中间推理和完整工具输出丢失（仅保留 ~12% 原文）。
无结构化引用链、无知识图谱、无"结论→数据"映射。

**问题**:
- 结论 "论文 A 使用 CNN" 没有结构化关联到 WebFetch(论文 A) 的哪一行
- 无法回答"你是从论文 A 的哪个部分得出使用 CNN 的结论？"
- 即使 `/deep-research` 的交叉验证也只能标记"未验证"，不能验证

**根因**: 对话模型没有图结构来维护"结论→论据→数据源"的引用链。

#### 问题 4：科研纪律不可强制执行（根本问题）

**现状**: CLAUDE.md 中的规则是"建议性"的（"Claude reads it and tries to follow it, but there's no guarantee"）。
Hooks 只能阻止工具调用行为（如 `Bash(rm *)`），不能约束推理逻辑。

**问题**:
- 无法冻结 Protocol——看到结果后可以静默修改分析规则（p-hacking）
- 无探索/确认阶段分离——Claude 可以在确认阶段"无意"引入探索阶段发现的变量
- 无可证伪性约束——无法要求 Claude 在生成假设时必须定义反证条件
- Hook 无法阻止 Claude 说"虽然 p=0.06，但考虑到效应量..."来合理化结论

**根因**: LLM 的推理过程对 hook 是完全黑箱的。Hooks 约束行为，不约束思维。

#### 问题 5：长期记忆有损衰减（根本问题）

**现状**: MEMORY.md 200 行/25KB 硬截断，compact 保留 ~12% 原文。
"Full tool outputs and intermediate reasoning are gone"。

**问题**:
- 第 3 周的研究：15 篇论文的具体发现 → 压缩为"相关文献表明..."
- Protocol 细节如果没写入 CLAUDE.md 就丢失
- 初步结果的具体数值如果没持久化到文件就丢失
- "If instructions seemed lost after /compact" 是已知问题

**根因**: 上下文窗口有限 + compact 有损。LLM 仍需在有限窗口内推理。

#### 问题 6：多阶段连贯性缺失（根本问题）

**现状**: Subagent 间无直接通信（各自独立上下文），Workflow 阶段间通过文本传递，
且 "No mid-run user input"。

**问题**:
- Phase 1 文献调研 (Subagent A) → 综述摘要 → Phase 2 假设生成 (Subagent B)
- 摘要中丢失了论文 #12 的关键矛盾发现
- 生成的假设 H1 忽略了已有文献中的反驳证据
- 整个实验设计方向性错误
- 每个阶段的信息损失累积，且阶段间无用户校验点

**根因**: 阶段间文本摘要天然丢失信息，无结构化知识传递机制。

### 1.2 PaperFactory 要解决的核心问题

构建一个**持续维护科研项目状态、识别当前关键不确定性、选择下一研究动作、组织所需上下文、调用专业能力执行，并依据证据推进科研状态演化的一站式 Research Agent Platform。**

覆盖全链路科研自动化：

```
调研 → 选题 → 实验设计 → 实验执行 → 论文写作 → 投稿 → 回复审稿
```

支持非线性的科研过程：

```
循环、回退、分支、暂停、重新打开、纠正、并行研究路线
```

### 1.3 核心治理原则

这三条是系统不可违反的设计公理（已冻结，见 ADR-002）：

> **LLM proposes; the system decides.**
> LLM 负责认知任务和候选判断，Controller 负责流程治理和最终决策。

> **Tools execute; the controller governs.**
> Tool 负责执行具体操作，Controller 负责判定是否允许执行和何时执行。

> **Evidence changes research state; prose does not.**
> LLM 输出、Capability 输出、Tool 输出都是 Proposal / Observation，不是 State mutation。
> 只有经过 Gate 验证的 Evidence 才能改变科研状态。

---

## 2. 总体架构

### 2.1 七层架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ L7  Application / UX                     apps/                             │
│     Project / Research Map / Tasks / Diff / Chat / Approval Queue          │
│     [部分已实现: API shell, Worker shell, Orchestration]                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ L6  Research Control Plane             packages/control                    │
│     State Manager / Action Registry / Transition Engine                    │
│     Gate Engine / Policy Engine / Task DAG / Branch Manager / Approval      │
│     [已实现]                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ L5  Cognitive Control Plane              packages/cognition                │
│     Context Compiler / Prompt Assembler / Provider Projector               │
│     Output Validator / Cognitive Mode / Blinding Policy                    │
│     [已实现]                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ L4  Agent Runtime                      packages/runtime                    │
│     Session / Run / Agent / Subagent / Skill / Tool                        │
│     Retry / Checkpoint / Permission / Sandbox / Hook                       │
│     [部分已实现: Session/Run/Agent Binding/Provider]                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ L3  Capability Layer                   packages/capabilities               │
│     Literature / Code / Experiment / Stats / Writing / Review / Citation   │
│     [待实现 - 核心]                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ L2  Data / Audit Plane                 packages/persistence                │
│     PostgreSQL / Research Graph / Vector Store / Artifacts / Event Store   │
│     [待实现]                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ L1  Platform Infrastructure                  (sandbox/network/etc)         │
│     Compute / Queue / Git / Container / Auth / Secrets / Telemetry         │
│     [待实现]                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ M0  Domain Contracts                   packages/domain                     │
│     IDs / Enums / Events / Models (innermost; no framework deps)           │
│     [已实现]                                                               │
└─────────────────────────────────────────────────────────────────────────────┘

Cross-cutting: packages/observability  packages/evals
```

**通信模型**：
```
TypeScript 主服务 (Hono API + 核心逻辑)
    ├── 直接调用 → LLM SDK (@anthropic-ai/sdk, openai)
    ├── 直接调用 → PostgreSQL (Drizzle ORM + pgvector)
    ├── 直接调用 → MCP 工具服务器
    ├── HTTP REST → Python 微服务 (scipy / GROBID / LaTeX / sandbox)
    └── 直接调用 → 文件系统 / 子进程
```

**依赖方向**（宪法 §37）：上层依赖下层，下层不反向依赖上层。

```
L7 → L6 → L5 → L4 → L3 → L2 → L1
           ↓
        M0 (Domain, 所有层可依赖)
```

### 2.2 统一运行模型

```
ResearchState_t
  → ResearchAction_t        (Control Plane 选择)
  → Context_t               (Cognitive Plane 编译)
  → Execution_t             (Runtime 执行)
  → Observation_t           (Capability 产出)
  → Evaluation_t            (Cognitive Plane 验证)
  → ResearchState_{t+1}     (Control Plane 提交)
```

### 2.3 已实现 vs 待实现

| 层级 | 模块 | Python 状态 | TS 状态 | 说明 |
|------|------|------|------|------|
| L6 | `src/control/` | **已实现** | **待重写** | Controller, ActionRegistry, TransitionEngine, TaskManager, BranchManager, ApprovalManager, PolicyEngine, GateEngine |
| L5 | `src/cognition/` | **已实现** | **待重写** | ContextCompiler, PromptAssembler, ProviderProjector, OutputValidator, CognitiveMode, Blinding/Context/Retrieval Policy |
| L4 | `src/runtime/` | **部分已实现** | **待重写** | Session, Run, Agent Binding, Provider Execution, Model Selection。待新增: Subagent, Skill, Tool, Sandbox, Hook, Checkpoint |
| L3 | `src/capabilities/` | **待实现** | **待实现** | 核心科研能力层 |
| L2 | `src/persistence/` | **待实现** | **待实现** | PostgreSQL (Drizzle) 适配器和事件存储 |
| L1 | Infrastructure | **待实现** | **Python 微服务** | 沙箱、科学计算（scipy/numpy/GROBID）、LaTeX |
| M0 | `src/domain/` | **已实现** | **待重写** | Typed IDs, Enums, Events, ResearchStateSnapshot |
| L7 | `src/api/`, `src/app/` | **部分已实现** | **待重写+新增** | Orchestration 待重写。API (Hono) 全新。 |

### 2.4 技术栈

#### 主技术栈（TypeScript 全栈 + Effect）

```
TypeScript 5.x + Node.js 22+

核心运行时:
  @effect/platform            ← Effect 生态核心
  @effect/schema              ← 类型安全 Schema（替代 zod）
  @effect/effect              ← Effect 运行时（纯函数式副作用管理）

后端:
  @effect/platform/Api        ← API 框架（Effect 原生）
  @effect/sql-pg              ← PostgreSQL 驱动（Effect 原生）
  @effect/pg-drizzle          ← Drizzle + Effect 集成
  drizzle-kit                 ← 迁移工具

持久化:
  PostgreSQL (system of record)
  pgvector (vector embeddings)

LLM 集成:
  @anthropic-ai/sdk          ← Anthropic（通过 Effect 封装）
  openai                     ← OpenAI（通过 Effect 封装）
  LiteLLM proxy (Python)     ← 统一多模型路由

并发模型:
  Effect.all()               ← 结构化并发（替代 Promise.all）
  Effect.retry()             ← 类型安全重试
  Effect.acquireUseRelease() ← 资源生命周期管理
  Schedule                   ← 退避/重试策略

测试:
  vitest                     ← 单元测试/集成测试
  @effect/test-utils          ← Effect 测试工具
  eslint                     ← lint

构建:
  tsup / esbuild             ← 打包
  pnpm                       ← 包管理

可观测性:
  @effect/platform/NodeHttpServer ← 内置 Logger
  @opentelemetry/api          ← tracing/metrics（可选集成）

前端:
  Next.js                    ← Web UI

部署:
  Docker                     ← 容器化
```

#### Python 微服务（科学计算专用）

```
paperfactory-science/         ← 独立 Python 服务
  scipy                       ← 统计检验
  numpy / pandas              ← 数据处理
  GROBID (HTTP client)        ← PDF 解析
  subprocess                  ← LaTeX 编译 / 沙箱执行

通信: HTTP REST (主服务 → 微服务)
```

**决策依据**:
- TS + Effect 全栈统一前后端语言，Effect 提供类型安全的副作用管理和结构化并发
- @effect/schema 替代 zod，编译期+运行时双重验证
- @effect/platform/Api 替代 Hono，原生 Effect 支持
- @effect/sql-pg 替代 Drizzle 直接操作，Effect 原生数据库驱动
- 科学计算(scipy/numpy/GROBID)无等效 TS 库，保留 Python 微服务
- 现有 Python 代码作为参考实现，TS 重写是学习过程

---

## 3. 核心设计

### 3.1 Research Object 模型

每个 Research Object 是一个 **Effect Schema**（`@effect/schema`）+ **Data Class** 模式。

**TS 代码风格**：
- Schema 定义：`Schema.struct({...})`，编译期+运行时双重验证
- 不可变性：`Schema.annotations({ identifier: "..." })` + Effect Data Class 模式
- UUID v4 作为 ID
- `Record<string, unknown>` 替代 `dict[str, object]`
- 所有副作用通过 `Effect<R, E, A>` 类型表达
- 资源管理通过 `Effect.acquireUseRelease` 自动清理
- 并发通过 `Effect.all({ concurrency: "unbounded" })` 结构化

#### 为什么用 @effect/schema 而不是 zod？

**核心差异不是"编译期 vs 运行时"，而是 schema 的三种类型参数 `Schema<Type, Encoded, Requirements>`**。

##### 1. 三种类型参数（zod 没有）

一个 Schema 有三个类型参数：
- **Type (A)**: 解码后的类型（你业务代码使用的类型）
- **Encoded (I)**: 编码时的类型（外部数据格式）
- **Requirements (R)**: 解码/编码需要的依赖上下文

```typescript
// zod: 只有一种类型，输入输出相同
const age = z.string().transform(s => parseInt(s));  // 类型推断复杂

// @effect/schema: 输入/输出类型天然分离
const Age = Schema.NumberFromString;
// Schema<number, string, never>
//   Type = number    ← 业务代码用 number
//   Encoded = string ← 外部数据是 string (JSON/API/表单)
//   Requirements = never ← 不需要额外依赖
```

这意味着：**同一个 Schema 同时定义了"外部怎么表示"和"内部怎么用"**，不需要写两套类型。

##### 2. 解码返回 Effect，不是 throw

```typescript
// zod: 验证失败就 throw，你必须 try/catch
try {
  const user = UserSchema.parse(input);  // 可能 throw ZodError
} catch (e) { /* 错误处理 */ }

// @effect/schema: 验证失败返回 Effect 错误，类型中声明
const result: Effect<never, ParseError, User> = Schema.decode(User)(input);
// 编译期就知道可能返回 ParseError
// 可以用 Effect.catchAll / Effect.either 处理，不会意外 throw
```

在 Effect 生态中，`Schema.decode` 返回的 `Effect` 可以直接组合到其他 Effect 操作中，不需要跳出函数式流程去 try/catch。

##### 3. 双向转换：decode 和 encode

```typescript
// zod: 只能 parse（输入→输出），没有反向
const data = schema.parse(input);  // OK
const back = schema.unparse(data); // ❌ 不存在

// @effect/schema: 天然双向
const decoded: User = yield* Schema.decode(User)(encodedInput);   // string → number
const encoded: string = yield* Schema.encode(User)(decodedUser);  // number → string
```

这在 API 场景极其重要：接收 JSON（string）→ 解码为业务类型（number/Date）→ 处理后 → 编码回 JSON。

##### 4. Schema 可以需要依赖（Requirements）

```typescript
// 这个 Schema 解码时需要访问数据库验证用户是否存在
const ValidUser = Schema.Transform(
  Schema.Struct({ id: Schema.UUID }),
  User,
  {
    decode: (input) =>
      Effect.flatMap(
        userService.findById(input.id),  // 需要数据库依赖
        Effect.fromOption(_, new UserNotFoundError(input.id))
      ),
    encode: (user) => ({ id: user.id }),
  }
);
// Schema<User, { id: string }, UserService>
// 第三个参数 = 解码需要 UserService 依赖
// 编译期就知道：用这个 Schema 必须提供 UserService
```

zod 做不到这一点——它的 transform 是纯函数，不能 Effect。

##### 5. 自动生成衍生产物

一个 Schema 定义后，Effect 生态自动生成：

| 产物 | 用途 | zod 等效 |
|------|------|---------|
| **JSON Schema** | API 文档 / OpenAPI | `zod-to-json-schema` 第三方库 |
| **Arbitrary (fast-check)** | 属性测试 / 模糊测试 | `@fast-check/zod` 第三方库 |
| **Equivalence** | 结构化相等比较 | 手动实现 |
| **Pretty Printer** | 数据格式化输出 | 手动实现 |
| **Standard Schema** | 标准 schema 格式 | 无 |

这些不是"有了就行"——在 PaperFactory 中：
- JSON Schema 直接给 LLM 做 tool definition（`@effect/platform/Api` 自动生成 OpenAPI）
- Arbitrary 用于生成测试数据（vitest + fast-check）
- Equivalence 用于比较 ResearchState 快照（判断两个版本是否真的不同）

##### 6. 精确的可选属性（exactOptionalPropertyTypes）

```typescript
// zod: { name?: string } 允许 name: undefined
const s = z.object({ name: z.string().optional() });
s.parse({ name: undefined }); // ✅ 通过（但可能不是预期行为）

// @effect/schema: 配合 exactOptionalPropertyTypes
const S = Schema.Struct({
  name: Schema.optionalWith(Schema.NonEmptyString, { exact: true }),
});
Schema.decodeSync(S)({ name: undefined }); // ❌ 编译期报错 + 运行时拒绝
```

这在科研对象中很重要——"不存在"和"存在但为空"是不同语义。

##### 总结

| 能力 | zod | @effect/schema |
|------|-----|---------------|
| 输入/输出类型分离 | ❌ 需要 transform 手动做 | ✅ `Schema<A, I, R>` |
| 错误在类型中 | ❌ throw + try/catch | ✅ `Effect<never, ParseError, A>` |
| 双向转换 | ❌ 只有 parse | ✅ decode + encode |
| Schema 需要依赖 | ❌ 纯函数 | ✅ Requirements 参数 |
| JSON Schema 生成 | 第三方库 | 内置 `JSONSchema.make()` |
| 测试数据生成 | 第三方库 | 内置 `Arbitrary.make()` |
| 相等比较 | 手动 | 内置 `Equivalence.make()` |
| 精确可选属性 | 有限 | ✅ 完整支持 |
| Effect 生态集成 | 不兼容 | 原生集成 |

**对 PaperFactory 的实际影响**：

```typescript
// ResearchQuestion 的 Schema 同时提供：
// 1. 编译期类型（业务代码直接用）
// 2. 运行时验证（API 接收数据时）
// 3. JSON Schema（给 LLM 做 tool/output contract）
// 4. Arbitrary（生成测试数据）
// 5. Equivalence（比较两个版本快照）
// 6. Pretty Printer（日志/调试输出）
// 7. decode/encode（API 请求/响应双向转换）

const question = yield* Schema.decode(ResearchQuestion)(apiInput);
const json = yield* Schema.encode(ResearchQuestion)(question);
const jsonSchema = JSONSchema.make(ResearchQuestion); // 直接给 LLM
const testGen = Arbitrary.make(ResearchQuestion);      // 测试数据
const eq = Equivalence.make(ResearchQuestion);         // 快照比较
```

一个 Schema 定义，七种用途。用 zod 需要引入 3-4 个第三方库才能勉强实现。

#### 为什么对象要 immutable？

科研状态需要**版本化**和**事件溯源**（宪法 §29, §33）。如果对象可变：
- 无法判断两个快照之间改了哪里
- 无法安全地 time-travel 回历史版本
- 并发修改会产生 race condition

`Schema.Struct` 生成的类型天然 immutable，配合 Effect 的函数式编程模型，状态变更只能通过创建新版本实现。

#### 3.1.1 ResearchQuestion

```typescript
import { Schema } from "@effect/schema/Schema";
import { Effect } from "effect";

export const QuestionStatus = Schema.Enums({
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  SCOPED: "SCOPED",
  ARCHIVED: "ARCHIVED",
} as const);

export const ResearchQuestion = Schema.Struct({
  questionId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  title: Schema.NonEmptyString,
  statement: Schema.NonEmptyString,      // 正式问题陈述
  domain: Schema.NonEmptyString,         // 研究领域标签
  status: QuestionStatus,
  relatedKnowledgeIds: Schema.Array(Schema.UUID).pipe(
    Schema.default([])
  ),
  parentQuestionId: Schema.NullOr(Schema.UUID).pipe(
    Schema.default(null)
  ),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }).pipe(
    Schema.default({})
  ),
  createdAt: Schema.Date.pipe(Schema.default(new Date())),
  updatedAt: Schema.Date.pipe(Schema.default(new Date())),
});

export type ResearchQuestion = Schema.Schema<typeof ResearchQuestion>;

// 不变量 (在 service 层检查):
// - ACTIVE/SCOPED 必须至少关联一个 KnowledgeItem
// - SCOPED 必须关联至少一个 ResearchGap

// Effect 风格的创建函数
export const createResearchQuestion = (
  input: Omit<Schema.Schema<typeof ResearchQuestion>, "questionId" | "createdAt" | "updatedAt">
): Effect.Effect<ResearchQuestion, never, never> =>
  Effect.succeed({
    questionId: crypto.randomUUID(),
    ...input,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
```

**状态机**: `DRAFT → ACTIVE → SCOPED → ARCHIVED`
**关系**: 1:N → KnowledgeItem, 1:N → ResearchGap

#### 3.1.2 KnowledgeItem

```typescript
export const KnowledgeStatus = Schema.Enums({
  DRAFT: "DRAFT",
  ASSESSED: "ASSESSED",
  VALIDATED: "VALIDATED",
  SUPERSEDED: "SUPERSEDED",
} as const);

export const KnowledgeItem = Schema.Struct({
  knowledgeId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  summary: Schema.NonEmptyString,
  sourceType: Schema.Enums({
    paper: "paper",
    experiment: "experiment",
    review: "review",
    preprint: "preprint",
  } as const),
  sourceIds: Schema.Array(Schema.UUID).pipe(Schema.default([])),
  status: KnowledgeStatus,
  certaintyLevel: Schema.Number.pipe(
    Schema.between(0, 1),
    Schema.default(0.5)
  ),
  questionIds: Schema.Array(Schema.UUID).pipe(Schema.default([])),
  tags: Schema.Array(Schema.String).pipe(Schema.default([])),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }).pipe(
    Schema.default({})
  ),
  createdAt: Schema.Date.pipe(Schema.default(new Date())),
});

export type KnowledgeItem = Schema.Schema<typeof KnowledgeItem>;
```

**状态机**: `DRAFT → ASSESSED → VALIDATED` 或 `DRAFT → SUPERSEDED`
**关系**: N:1 → ResearchQuestion, N:M → Evidence

#### 3.1.3 ResearchGap

```python
class GapStatus(StrEnum):
    IDENTIFIED = "IDENTIFIED"
    VALIDATED = "VALIDATED"
    ADDRESSED = "ADDRESSED"
    CLOSED = "CLOSED"

@dataclass(frozen=True)
class ResearchGap:
    """已识别的研究空白。"""
    gap_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    title: str
    description: str              # Gap 的具体描述
    question_id: ObjectId         # 关联的 ResearchQuestion
    status: GapStatus
    supporting_knowledge_ids: frozenset[ObjectId]  # 支撑此 Gap 存在的知识
    contradicting_knowledge_ids: frozenset[ObjectId]  # 与此 Gap 矛盾的知识
    novelty_assessment: str       # 新颖性评估摘要
    metadata: dict[str, object] = field(default_factory=dict)

    # 不变量:
    # - VALIDATED 必须通过 semantic gate（新颖性验证）
    # - ADDRESSED 必须关联至少一个已验证的 Hypothesis 或 Evidence
```

**状态机**: `IDENTIFIED → VALIDATED → ADDRESSED → CLOSED`
**关系**: N:1 → ResearchQuestion, N:M → KnowledgeItem

#### 3.1.4 Hypothesis

```python
class HypothesisStatus(StrEnum):
    PROPOSED = "PROPOSED"
    ASSESSED = "ASSESSED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    MODIFIED = "MODIFIED"

@dataclass(frozen=True)
class Hypothesis:
    """可证伪的研究假设。"""
    hypothesis_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    title: str
    statement: str                # 正式假设陈述
    gap_id: ObjectId              # 关联的 ResearchGap
    status: HypothesisStatus
    # 可证伪条件（宪法 §15.6）
    falsification_conditions: tuple[str, ...]   # 什么结果意味着应拒绝此假设
    supporting_evidence_ids: frozenset[ObjectId] = frozenset()
    contradicting_evidence_ids: frozenset[ObjectId] = frozenset()
    competing_hypothesis_ids: frozenset[ObjectId] = frozenset()  # 竞争假设
    assessment_rationale: str = ""
    metadata: dict[str, object] = field(default_factory=dict)

    # 不变量:
    # - 正式 Hypothesis 必须有 falsification_conditions（非空）
    # - REJECTED 必须关联至少一个 contradicting Evidence
    # - ACCEPTED 必须通过 semantic gate（假设评估）
```

**状态机**: `PROPOSED → ASSESSED → ACCEPTED` 或 `PROPOSED → ASSESSED → REJECTED` 或 `PROPOSED → MODIFIED → PROPOSED`
**关系**: N:1 → ResearchGap, N:M → Evidence, N:M → Hypothesis（竞争）

> **设计决策**: `falsification_conditions` 是必填字段，直接实施宪法 §15.6 Falsifiability。
> 如果无法定义合理的反证条件，该假设不能进入正式确认阶段。

#### 3.1.5 StudyDesign

```python
class StudyDesignStatus(StrEnum):
    DRAFT = "DRAFT"
    REVIEWED = "REVIEWED"
    APPROVED = "APPROVED"
    SUPERSEDED = "SUPERSEDED"

@dataclass(frozen=True)
class StudyDesign:
    """研究设计方案的顶层描述。"""
    design_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    title: str
    description: str
    hypothesis_ids: frozenset[ObjectId]
    study_type: str               # "experiment" / "simulation" / "analysis" / "survey"
    status: StudyDesignStatus
    protocols: frozenset[ObjectId] = frozenset()
    baselines: tuple[str, ...] = ()  # 基线方法名称
    metadata: dict[str, object] = field(default_factory=dict)
```

**状态机**: `DRAFT → REVIEWED → APPROVED` 或 `DRAFT → SUPERSEDED`
**关系**: N:M → Hypothesis, 1:N → Protocol

#### 3.1.6 Protocol

```python
class ProtocolStatus(StrEnum):
    DRAFT = "DRAFT"
    REVIEWED = "REVIEWED"
    FROZEN = "FROZEN"             # 不可修改（宪法 §14 探索/确认分离）
    VIOLATED = "VIOLATED"         # 检测到违反冻结状态
    ARCHIVED = "ARCHIVED"

@dataclass(frozen=True)
class Protocol:
    """可冻结的实验协议。冻结后不可修改（宪法 §14）。"""
    protocol_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    title: str
    design_id: ObjectId
    status: ProtocolStatus
    version: int
    # 冻结前可修改的部分
    primary_metric: str
    dataset_split: dict[str, str]  # {"train": "...", "val": "...", "test": "..."}
    evaluation_rules: tuple[str, ...]
    stopping_rules: tuple[str, ...]
    analysis_plan: str
    # 冻结时间
    frozen_at: str | None = None   # ISO 8601 timestamp
    # 冻结后的任何修改记录
    post_freeze_modifications: tuple[str, ...] = ()  # 宪法 §14: post-hoc 必须显式记录
    metadata: dict[str, object] = field(default_factory=dict)

    # 不变量:
    # - FROZEN 后不得修改 primary_metric, dataset_split, evaluation_rules, stopping_rules
    # - FROZEN → 任何修改必须追加到 post_freeze_modifications
    # - FROZEN 的 Protocol 只能通过创建新版本(v+1)来改变
```

**状态机**: `DRAFT → REVIEWED → FROZEN` → `FROZEN`（不可逆）或 `FROZEN → VIOLATED → ARCHIVED`
**关系**: N:1 → StudyDesign, 1:N → Experiment

> **设计决策**: Protocol 的 FROZEN 状态是强制执行（代码级 Gate），不是 Prompt 级约束。
> 这是解决 Claude Code "无法冻结 Protocol" 根本问题的核心机制。

#### 3.1.7 Experiment

```python
class ExperimentStatus(StrEnum):
    PLANNED = "PLANNED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

@dataclass(frozen=True)
class Experiment:
    """实验实例。"""
    experiment_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    title: str
    protocol_id: ObjectId
    status: ExperimentStatus
    study_phase: str              # "exploratory" / "confirmatory"（宪法 §14）
    code_repository: str | None = None
    config: dict[str, object] = field(default_factory=dict)
    result_ids: frozenset[ObjectId] = frozenset()
    started_at: str | None = None
    completed_at: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)

    # 不变量:
    # - RUNNING 的 Experiment 关联的 Protocol 必须 FROZEN（确认性实验）
    # - COMPLETED 必须至少有一个 Result
```

**状态机**: `PLANNED → RUNNING → COMPLETED` 或 `PLANNED → RUNNING → FAILED` 或 `PLANNED → CANCELLED`
**关系**: N:1 → Protocol, 1:N → Result

#### 3.1.8 Result

```python
class ResultStatus(StrEnum):
    RAW = "RAW"
    VALIDATED = "VALIDATED"
    INVALID = "INVALID"

@dataclass(frozen=True)
class Result:
    """实验的观测结果（immutable）。"""
    result_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    experiment_id: ObjectId
    status: ResultStatus
    metrics: dict[str, float]     # 结构化指标
    raw_artifact_refs: tuple[str, ...]  # 原始数据/模型文件引用
    statistical_analysis: dict[str, object] = field(default_factory=dict)
    validated_at: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)

    # 不变量:
    # - immutable（frozen=True），修改必须创建新版本
    # - VALIDATED 必须通过统计验证 Gate
```

**状态机**: `RAW → VALIDATED` 或 `RAW → INVALID`
**关系**: N:1 → Experiment, 1:N → Evidence

#### 3.1.9 Evidence

```python
class EvidenceStatus(StrEnum):
    PROPOSED = "PROPOSED"
    VERIFIED = "VERIFIED"
    RETRACTED = "RETRACTED"

class EvidenceDirection(StrEnum):
    SUPPORTING = "SUPPORTING"
    CONTRADICTING = "CONTRADICTING"

@dataclass(frozen=True)
class Evidence:
    """经过验证的论据。Result 是观测，Evidence 是可用于支持或反驳命题的对象（宪法 §30）。"""
    evidence_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    direction: EvidenceDirection
    status: EvidenceStatus
    result_ids: frozenset[ObjectId]  # 支撑此 Evidence 的 Result
    knowledge_ids: frozenset[ObjectId]  # 支撑此 Evidence 的 KnowledgeItem
    claim_scope: str                 # Evidence 能支持的结论范围
    strength: float                  # 0.0-1.0, Evidence 强度
    metadata: dict[str, object] = field(default_factory=dict)

    # 不变量:
    # - VERIFIED 必须至少关联一个 VALIDATED Result 或 VALIDATED KnowledgeItem
    # - claim_scope ⊆ evidence_scope（宪法 §15.9 Claim Calibration）
```

**状态机**: `PROPOSED → VERIFIED` 或 `PROPOSED → RETRACTED`
**关系**: N:M → Result, N:M → KnowledgeItem, N:M → Claim

#### 3.1.10 Claim

```python
class ClaimStatus(StrEnum):
    DRAFT = "DRAFT"
    ASSERTED = "ASSERTED"
    CHALLENGED = "CHALLENGED"
    SUPPORTED = "SUPPORTED"
    WEAKENED = "WEAKENED"
    RETRACTED = "RETRACTED"

@dataclass(frozen=True)
class Claim:
    """科研主张。必须关联 Evidence，不得直接关联 Result（宪法 §30）。"""
    claim_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    statement: str
    status: ClaimStatus
    hypothesis_ids: frozenset[ObjectId]  # 此 Claim 支撑的 Hypothesis
    evidence_ids: frozenset[ObjectId]    # 必须关联 Evidence
    challenge_evidence_ids: frozenset[ObjectId]  # 挑战此 Claim 的 Evidence
    scope: str                           # Claim 的适用范围
    confidence: float                    # 0.0-1.0
    metadata: dict[str, object] = field(default_factory=dict)

    # 不变量:
    # - ASSERTED/SUPPORTED 必须 claim_scope ⊆ evidence_scope（宪法 §15.9）
    # - SUPPORTED 的所有关联 Evidence 必须 VERIFIED
    # - 不得直接关联 Result（必须经过 Evidence 层）
```

**状态机**: `DRAFT → ASSERTED → SUPPORTED` 或 `DRAFT → ASSERTED → CHALLENGED → WEAKENED/RETRACTED`
**关系**: N:M → Hypothesis, N:M → Evidence

#### 3.1.11 ResearchFailure

```python
class FailureKind(StrEnum):
    RUNTIME = "RUNTIME"            # 运行时失败（可 retry）
    SCIENTIFIC = "SCIENTIFIC"      # 科学性失败（不可 auto-retry，宪法 §26）
    METHOD = "METHOD"              # 方法失败
    DATA = "DATA"                  # 数据失败

@dataclass(frozen=True)
class ResearchFailure:
    """失败的正式记录。失败不是垃圾数据（宪法 §31）。"""
    failure_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    kind: FailureKind
    description: str               # 失败了什么
    root_cause: str                # 为什么失败
    evidence_ids: frozenset[ObjectId]  # 支撑此 Failure 判断的证据
    lesson: str                    # 可复用的教训
    retry_conditions: tuple[str, ...]  # 什么条件下值得重新尝试
    metadata: dict[str, object] = field(default_factory=dict)

    # 不变量:
    # - SCIENTIFIC 失败不得 auto-retry
    # - 必须有 lesson 或 root_cause 之一
```

> **设计决策**: ResearchFailure 是一等公民对象。防止 Agent 在条件未改变时反复提出已明确失败的路线（宪法 §31）。

#### 3.1.12 Decision

```python
@dataclass(frozen=True)
class Decision:
    """科研过程中的正式决策。"""
    decision_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    decision_type: str             # "hypothesis_selection" / "venue_matching" / "method_choice" / ...
    rationale: str
    alternatives_considered: tuple[str, ...]
    chosen_option: str
    evidence_ids: frozenset[ObjectId] = frozenset()
    made_by: str                   # "USER" / "AGENT" / "SYSTEM"
    made_at: str                  # ISO 8601
    metadata: dict[str, object] = field(default_factory=dict)
```

#### 3.1.13 Approval

```python
class ApprovalStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"

@dataclass(frozen=True)
class Approval:
    """Human-in-the-loop 审批记录（宪法 §28）。"""
    approval_id: ObjectId
    project_id: ProjectId
    branch_id: BranchId
    status: ApprovalStatus
    requested_action: str
    requester: str                # "USER" / "AGENT" / "SYSTEM"
    resolver: str | None = None   # 审批人
    resolution_note: str = ""
    expires_at: str | None = None
    requested_at: str | None = None
    resolved_at: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)
```

### 3.2 Research Action 定义

所有 Action 遵循 `ResearchActionDefinition` 的结构（`packages/control/actions.py`）：

```python
@dataclass(frozen=True)
class ResearchActionDefinition:
    action_type: str
    target_object_type: str
    allowed_source_states: frozenset[str]
    required_gate_ids: frozenset[str] = field(default_factory=frozenset)
    side_effect_level: SideEffectLevel = SideEffectLevel.NONE
    requires_approval: bool = False
```

#### 3.2.1 调研阶段 Actions

| Action | Target | Source States | Target State | Gates | SideEffect | Approval | CognitiveMode |
|--------|--------|---------------|--------------|-------|------------|----------|---------------|
| `SEARCH_LITERATURE` | ResearchQuestion | `{DRAFT, ACTIVE}` | `ACTIVE` | `RATE_LIMIT` | READ | No | EXPLORE |
| `RETRIEVE_PAPER` | KnowledgeItem | `{DRAFT}` | `ASSESSED` | `SOURCE_AVAILABLE` | READ | No | EXPLORE |
| `PARSE_DOCUMENT` | KnowledgeItem | `{DRAFT}` | `ASSESSED` | `PARSE_SUCCESS` | READ | No | MAP |
| `READ_PAPER` | KnowledgeItem | `{DRAFT, ASSESSED}` | `ASSESSED` | `CONTENT_VALID` | READ | No | MAP |
| `ANALYZE_CITATIONS` | KnowledgeItem | `{ASSESSED}` | `ASSESSED` | - | READ | No | COMPARE |
| `SYNTHESIZE_LITERATURE` | ResearchQuestion | `{ACTIVE}` | `SCOPED` | `MIN_COVERAGE` | INTERNAL_WRITE | No | SYNTHESIZE |

> **为什么 SEARCH_LITERATURE 的 target_state 不变**: 搜索文献不改变问题的状态，只丰富关联的 KnowledgeItem。
> 此处 `ACTIVE → ACTIVE` 表示 Action 合法执行但不推进状态机——文献搜索是增量积累过程。

#### 3.2.2 选题阶段 Actions

| Action | Target | Source States | Target State | Gates | SideEffect | Approval | CognitiveMode |
|--------|--------|---------------|--------------|-------|------------|----------|---------------|
| `IDENTIFY_GAP` | ResearchGap | `{DRAFT}` | `IDENTIFIED` | - | INTERNAL_WRITE | No | DISCRIMINATE |
| `VALIDATE_GAP` | ResearchGap | `{IDENTIFIED}` | `VALIDATED` | `NOVELTY_CHECK`, `CONTRADICTION_CHECK` | INTERNAL_WRITE | Yes | FALSIFY |
| `PROPOSE_HYPOTHESIS` | Hypothesis | `{DRAFT}` | `PROPOSED` | `FALSIFIABLE` | INTERNAL_WRITE | No | DISCRIMINATE |
| `ASSESS_HYPOTHESIS` | Hypothesis | `{PROPOSED}` | `ASSESSED` | `EVIDENCE_GROUNDING` | INTERNAL_WRITE | Yes | VERIFY |
| `ANALYZE_COMPETING` | Hypothesis | `{ASSESSED}` | `ASSESSED` | - | READ | No | COMPARE |

> **设计决策**: `VALIDATE_GAP` 和 `ASSESS_HYPOTHESIS` 需要人工审批。
> 这两个决策点决定了研究方向，属于宪法 §28 的关键不可逆决策。
> `FALSIFIABLE` Gate 确保假设具有可证伪条件（宪法 §15.6）。

#### 3.2.3 实验设计阶段 Actions

| Action | Target | Source States | Target State | Gates | SideEffect | Approval | CognitiveMode |
|--------|--------|---------------|--------------|-------|------------|----------|---------------|
| `DESIGN_STUDY` | StudyDesign | `{DRAFT}` | `REVIEWED` | `COVERAGE_CHECK` | INTERNAL_WRITE | No | DISCRIMINATE |
| `CREATE_PROTOCOL` | Protocol | `{DRAFT}` | `REVIEWED` | `COMPLETENESS` | INTERNAL_WRITE | No | FRAME |
| `FREEZE_PROTOCOL` | Protocol | `{REVIEWED}` | `FROZEN` | `NO_OPEN_ISSUES` | INTERNAL_WRITE | Yes | DECIDE |
| `REVIEW_PROTOCOL` | Protocol | `{REVIEWED}` | `REVIEWED` | - | READ | No | VERIFY |
| `SELECT_BASELINE` | StudyDesign | `{REVIEWED}` | `APPROVED` | `BASELINE_ADEQUATE` | INTERNAL_WRITE | Yes | COMPARE |

> **设计决策**: `FREEZE_PROTOCOL` 需要人工审批。冻结是不可逆操作（宪法 §14），
> 必须在用户确认后执行。一旦 FROZEN，Protocol 的 primary_metric/dataset_split
> 等字段代码级不可修改。

#### 3.2.4 实验执行阶段 Actions

| Action | Target | Source States | Target State | Gates | SideEffect | Approval | CognitiveMode |
|--------|--------|---------------|--------------|-------|------------|----------|---------------|
| `GENERATE_CODE` | Experiment | `{PLANNED}` | `PLANNED` | `PROTOCOL_FROZEN` | COMPUTE | No | FRAME |
| `EXECUTE_CODE` | Experiment | `{PLANNED}` | `RUNNING` | `ENVIRONMENT_READY` | COMPUTE | Yes | - |
| `RUN_EXPERIMENT` | Experiment | `{RUNNING}` | `COMPLETED` | `PROTOCOL_COMPLIANT` | COMPUTE | No | - |
| `COLLECT_RESULT` | Result | `{DRAFT}` | `RAW` | `DATA_PRESENT` | INTERNAL_WRITE | No | VERIFY |
| `ANALYZE_STATISTICS` | Result | `{RAW}` | `VALIDATED` | `STAT_VALID` | COMPUTE | No | DIAGNOSE |
| `DIAGNOSE_RESULT` | Result | `{RAW, VALIDATED}` | `VALIDATED` | - | READ | No | DIAGNOSE |

> **设计决策**: `EXECUTE_CODE` 需要审批（COMPUTE 级副作用）。`PROTOCOL_FROZEN` Gate
> 在代码级检查关联 Protocol 是否为 FROZEN 状态，防止在 Protocol 未冻结前运行确认性实验。

#### 3.2.5 论文写作阶段 Actions

| Action | Target | Source States | Target State | Gates | SideEffect | Approval | CognitiveMode |
|--------|--------|---------------|--------------|-------|------------|----------|---------------|
| `CREATE_OUTLINE` | Manuscript | `{DRAFT}` | `OUTLINED` | `EVIDENCE_AVAILABLE` | INTERNAL_WRITE | No | SYNTHESIZE |
| `DRAFT_SECTION` | Manuscript | `{OUTLINED, DRAFTING}` | `DRAFTING` | - | INTERNAL_WRITE | No | SYNTHESIZE |
| `INSERT_CITATION` | Manuscript | `{DRAFTING}` | `DRAFTING` | `CITATION_VALID` | INTERNAL_WRITE | No | VERIFY |
| `SELF_REVIEW` | Manuscript | `{DRAFTING}` | `REVIEWED` | `COMPLETENESS` | INTERNAL_WRITE | No | FALSIFY |
| `REVISE_MANUSCRIPT` | Manuscript | `{REVIEWED}` | `DRAFTING` | - | INTERNAL_WRITE | No | SYNTHESIZE |

#### 3.2.6 投稿阶段 Actions

| Action | Target | Source States | Target State | Gates | SideEffect | Approval | CognitiveMode |
|--------|--------|---------------|--------------|-------|------------|----------|---------------|
| `MATCH_VENUE` | Submission | `{DRAFT}` | `VENUE_SELECTED` | - | READ | Yes | COMPARE |
| `ASSESS_FIT` | Submission | `{VENUE_SELECTED}` | `FIT_ASSESSED` | `FIT_THRESHOLD` | INTERNAL_WRITE | No | DECIDE |
| `ADAPT_FORMAT` | Submission | `{FIT_ASSESSED}` | `FORMATTED` | `FORMAT_VALID` | EXTERNAL_WRITE | No | FRAME |
| `PREPARE_REBUTTAL` | Submission | `{UNDER_REVIEW}` | `REBUTTAL_READY` | `CONCERNS_IDENTIFIED` | INTERNAL_WRITE | Yes | FALSIFY |

### 3.3 Tool 系统设计

> **借鉴来源**: Claude Code 的 MCP 集成 + ToolSearch 延迟加载 + 并行执行策略
> + Aider 的多输出格式 + SWE-agent 的 ACI 设计原则

#### 为什么工具要分只读/写入，分别并发/顺序？

**问题**: 为什么不所有工具一起并发执行？

**答案**: 写入工具有竞态条件，并发执行导致数据不一致。

| 工具类型 | 并发安全 | 执行策略 | 示例 |
|---------|---------|---------|------|
| 只读（READ/NONE） | ✅ | `Effect.all({ concurrency: "unbounded" })` | search_scholarly, read_file |
| 有副作用（WRITE/COMPUTE） | ❌ | `Effect.all({ concurrency: 1 })` | write_file, execute_python |

```typescript
// 只读并发：3个搜索同时发起，耗时 = max(t1, t2, t3)
const results = yield* Effect.all([
  searchSemanticScholar("transformer attention"),
  searchArxiv("efficient attention mechanism"),
  searchOpenAlex("sparse attention survey"),
], { concurrency: "unbounded" });

// 写入顺序：写文件必须等上一个写完，避免覆盖
const writes = yield* Effect.all([
  writeTempFile("result_1.json", data1),
  writeTempFile("result_2.json", data2),
], { concurrency: 1 });  // 顺序执行
```

#### 为什么用 MCP 协议接入外部工具？

MCP（Model Context Protocol）是当前 AI 工具接入的事实标准（Linux Foundation 托管，Claude/ChatGPT/VS Code 原生支持）。通过 MCP 接入：
- 不需要为每个工具写 adapter，符合开放封闭原则
- ToolSearch 延迟加载 schema，减少 LLM 上下文消耗
- 社区已有 500+ MCP Server，开箱即用

#### 3.3.1 ToolRegistry

```typescript
import { Effect, Layer } from "effect";
import { Schema } from "@effect/schema/Schema";

export const SideEffectLevel = Schema.Enums({
  NONE: "NONE",
  READ: "READ",
  INTERNAL_WRITE: "INTERNAL_WRITE",
  COMPUTE: "COMPUTE",
  EXTERNAL_WRITE: "EXTERNAL_WRITE",
} as const);

export const ToolDefinition = Schema.Struct({
  name: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
  inputSchema: Schema.Object,
  outputSchema: Schema.Object,
  timeout: Schema.Number.pipe(Schema.int(), Schema.positive()).pipe(
    Schema.default(60)
  ),
  sideEffectLevel: SideEffectLevel.pipe(Schema.default("NONE")),
  requiresSandbox: Schema.Boolean.pipe(Schema.default(false)),
  permissionRule: Schema.Enums({
    deny: "deny",
    ask: "ask",
    allow: "allow",
  } as const).pipe(Schema.default("allow")),
  mcpServer: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  version: Schema.String.pipe(Schema.default("1.0.0")),
});

export type ToolDefinition = Schema.Schema<typeof ToolDefinition>;

// Effect 风格的 Service 接口
export class ToolRegistry extends Effect.Service<ToolRegistry>()(
  "ToolRegistry",
  {
    effect: (take) => ({
      register: (tool: typeof ToolDefinition.Type) => Effect.sync(() => {
        // ...注册逻辑
      }),
      get: (name: string) => Effect.map(
        Effect.sync(() => /* lookup */),
        result => result!,
      ),
      listReadable: Effect.sync(() => {
        // ...返回只读工具
      }),
      listWritable: Effect.sync(() => {
        // ...返回有副作用工具
      }),
    }),
  }
) {}
```

#### 3.3.2 ToolOutput

```typescript
export const ToolOutput = Schema.Struct({
  toolName: Schema.String,
  status: Schema.Enums({
    success: "success",
    error: "error",
    timeout: "timeout",
  } as const),
  data: Schema.Record({ key: Schema.String, value: Schema.Unknown }).pipe(
    Schema.default({})
  ),
  error: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  usage: Schema.Record({ key: Schema.String, value: Schema.Number }).pipe(
    Schema.default({})
  ),
  artifacts: Schema.Array(Schema.String).pipe(Schema.default([])),
});

export type ToolOutput = Schema.Schema<typeof ToolOutput>;
```

#### 3.3.3 并行执行策略（Effect 结构化并发）

```typescript
import { Effect, Schedule } from "effect";

export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  executeBatch(calls: ToolCall[]): Effect.Effect<ToolOutput[], never, never> {
    const readable = calls.filter(c => this.isReadable(c.toolName));
    const writable = calls.filter(c => !this.isReadable(c.toolName));

    // 只读工具: Effect.all + concurrency = 完全并发
    const readEffects = Effect.all(
      readable.map(c => this.executeSingle(c)),
      { concurrency: "unbounded" }
    );

    // 写工具: Effect.all + concurrency: 1 = 顺序执行（无竞态）
    const writeEffects = Effect.all(
      writable.map(c => this.executeSingle(c)),
      { concurrency: 1 }
    );

    // 组合：先并发读，再顺序写
    return Effect.zipRight(readEffects, writeEffects).map(() =>
      // 合并结果
      [] as ToolOutput[]
    );
  }

  private isReadable(toolName: string): boolean {
    // ...
  }

  private executeSingle(
    call: ToolCall
  ): Effect.Effect<ToolOutput, ToolError, never> {
    // 内置重试策略
    return Effect.async<ToolOutput, ToolError>((callback) => {
      // 工具执行逻辑
    }).pipe(
      Effect.retry(
        Schedule.recurs(2).pipe(
          Schedule.intersect(Schedule.exponential("100 millis"))
        )
      ),
      Effect.catchAllCause(cause =>
        Effect.logWarning(`Tool ${call.toolName} failed: ${cause}`)
      )
    );
  }
}
```

#### 3.3.5 MCP 协议集成

```
PaperFactory Tool Registry
    ├── Built-in Tools (代码硬编码)
    └── MCP Tools (运行时动态发现)
            ├── stdio transport
            ├── SSE transport
            └── HTTP transport
```

MCP 工具使用 ToolSearch 延迟加载 schema（借鉴 Claude Code），减少上下文消耗。

#### 3.3.6 权限层级

```
deny → ask → allow
```

- **deny**: 完全禁止调用
- **ask**: 调用前请求审批
- **allow**: 直接执行

粒度：工具级（`Bash`）、参数级（`Bash(npm run *)`）、路径级（`Read(./.env)`）

#### 3.3.7 沙箱设计

```
沙箱层级:
├── 文件系统隔离: bubblewrap (Linux) / Seatbelt (macOS)
│   ├── 只读挂载项目目录
│   ├── 可写挂载临时目录
│   └── 受保护路径（配置文件等不可写）
├── 网络隔离: 代理 + 域名白名单
├── 凭据保护: deny（完全屏蔽）+ mask（占位符替换）
└── 环境变量清洗: 执行前 unset 敏感变量
```

#### 3.3.8 工具分类

| 类别 | 工具 | SideEffect | Sandbox |
|------|------|------------|---------|
| **信息获取** | `search_scholarly`, `get_paper_meta`, `get_paper_pdf`, `parse_pdf`, `web_search`, `search_code` | READ | No |
| **文件系统** | `read_file`, `write_file`, `list_directory`, `search_files`, `diff_files` | INTERNAL_WRITE | Yes |
| **代码执行** | `execute_python`, `execute_bash`, `install_package`, `run_notebook` | COMPUTE | Yes |
| **LaTeX** | `write_latex`, `compile_latex`, `check_latex` | INTERNAL_WRITE | Yes |
| **数据处理** | `read_csv`, `query_data`, `plot_data`, `stat_test`, `fit_model` | COMPUTE | Yes |
| **网络** | `fetch_url`, `git_operations` | EXTERNAL_WRITE | Yes |

### 3.4 Skill 系统

> **借鉴来源**: Claude Code 的 Skill 系统（Markdown + YAML frontmatter，
> 动态上下文注入 `!`git diff`` 语法，按需加载，作用域，热加载）

#### 为什么 Skill 用 Markdown 而不是 TypeScript 代码？

**核心原因**: Skill 是**给 LLM 看的指令**，不是给编译器看的代码。

| 维度 | Markdown Skill | TS 代码 |
|------|---------------|--------|
| **LLM 可读性** | ✅ 自然语言，LLM 理解好 | ❌ 代码格式，浪费 token |
| **热加载** | ✅ 文件变更自动重载 | ❌ 需重新编译 |
| **动态注入** | ✅ `!`git diff`` 运行时替换 | ❌ 需额外解析 |
| **作用域** | ✅ 项目级/个人级/全局级 | ❌ 需额外配置 |

#### 为什么需要热加载？

Skill 在开发阶段会频繁修改。热加载（chokidar 文件监听）意味着：
- 改完 SKILL.md 保存，立即生效，不用重启服务
- Effect 风格的实现：文件变更 → 重新 parse → 更新内存 Map
- 生产环境可关闭热加载，启动时一次性加载

#### 3.4.1 定义格式

```
packages/skills/lit-review/SKILL.md
```

```yaml
---
name: lit-review
description: 系统性文献综述技能
context: fork
allowed-tools: search_scholarly get_paper_meta get_paper_pdf parse_pdf read_file
cognitive-mode: EXPLORE
max-iterations: 20
---

## 步骤
1. 根据 ResearchQuestion 确定搜索关键词
2. 搜索相关文献（search_scholarly）
3. 获取论文元数据（get_paper_meta）
4. 解析 PDF（parse_pdf）
5. 提取知识单元（KnowledgeItem）
6. 综合文献发现
7. 生成综述报告

## 输出契约
- 每个发现的论文创建一个 KnowledgeItem
- 综述报告写入 Manuscript 草稿

## 动态上下文
!`git diff HEAD`  # 当前代码变更
!`ls -la data/`   # 当前数据文件
```

#### 3.4.2 作用域

```
优先级（高→低）:
1. 项目级:  <project>/.paperfactory/skills/
2. 个人级:  ~/.paperfactory/skills/
3. 全局级:  /usr/local/paperfactory/skills/
```

#### 3.4.3 加载机制

```typescript
import { Effect, Layer, Cause } from "effect";
import { NodeContext } from "@effect/platform-node";
import { FileSystem } from "@effect/platform/FileSystem";
import { Path } from "@effect/platform/Path";

export class SkillLoader extends Effect.Service<SkillLoader>()(
  "SkillLoader",
  {
    deps: { FileSystem: FileSystem, Path: Path },
    effect: (take) => ({
      FileSystem: take.FileSystem,
      Path: take.Path,
      _skills: new Map<string, Skill>(),

      loadScope: (scopePath: string) =>
        Effect.gen(function*() {
          // 读取目录
          const entries = yield* take.FileSystem.listDirectory(scopePath);
          for (const entry of entries) {
            if (!entry.isDirectory) continue;
            const skillMd = yield* take.Path.join(entry.path, "SKILL.md");
            const parsed = yield* Effect.orDie(
              Effect.either(this.parse(skillMd))
            );
            if (parsed._tag === "Right") {
              this._skills.set(parsed.right.name, parsed.right);
            }
          }
          // 热加载：Effect 风格的文件监听
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              chokidar.watch(scopePath, { ignored: /(^|[/\\])\../ })
            ),
            (watcher) => Effect.sync(() => watcher.close())
          ).pipe(
            Effect.flatMap((watcher) =>
              Effect.async<void>((cb) => {
                watcher.on("change", (filePath: string) =>
                  this.onFileChange(filePath).pipe(
                    Effect.runFork,
                    Effect.tap((_) => cb(Cause.succeed()))
                  )
                );
              })
            )
          );
        }),

      get: (name: string) =>
        Effect.succeed(this._skills.get(name)),

      parse: (filePath: string) =>
        Effect.flatMap(
          take.FileSystem.readText(filePath),
          (content) => Effect.sync(() => parseSkillMd(content))
        ),

      onFileChange: (filePath: string) =>
        Effect.when(
          Effect.flatMap(
            this.parse(filePath),
            (skill) => Effect.sync(() =>
              this._skills.set(skill.name, skill)
            )
          ),
          () => filePath.endsWith("SKILL.md")
        ),
    }),
  }
) {}
```

### 3.5 ExecutionBlock 系统

> **自研核心**: 这是 PaperFactory 区别于通用 Coding Agent 的关键组件。
> 将科研步骤分解为确定性步骤 + LLM 认知点 + 条件分支的组合。

#### 为什么需要 ExecutionBlock，而不是让 LLM 直接编排？

**问题**: 为什么不把循环/分支写在 Prompt 里让 LLM 自己决定下一步？

**答案**: LLM 维护循环是**不可靠的**——它会遗忘步骤、陷入无限循环、跳过关键验证。

| 方式 | 可靠性 | 可审计 | Token 消耗 |
|------|--------|--------|-----------|
| LLM 在 Prompt 里维护循环 | ❌ 会遗忘/循环/跳过 | ❌ 黑盒 | 极高（每步都在上下文） |
| 代码编排（ExecutionBlock） | ✅ 确定性 | ✅ 每步可追溯 | 低（中间结果不进上下文） |

**借鉴 Claude Code Dynamic Workflow**: 把编排逻辑从 LLM 上下文移到代码中。

```typescript
// 错误方式：让 LLM 在对话中维护循环
// "请搜索文献，如果不够就继续搜索，直到找到10篇..."
// → LLM 可能只搜3次就停止了，可能无限搜索

// 正确方式：代码控制循环
Effect.loop(0, {
  body: (i) => Effect.gen(function*() {
    const papers = yield* searchLiterature(query, { page: i });
    const state = yield* validateCoverage(papers);
    return { papers, sufficient: state.coverage >= 0.8 };
  }),
  while: (result) => !result.sufficient,  // 确定性条件
}).pipe(
  Effect.tapBoth({
    onSuccess: (papers) => Effect.logInfo(`Found ${papers.length} papers`),
    onFailure: () => Effect.logWarning("Coverage insufficient after max iterations"),
  })
)
```

#### 为什么有验证-修复循环？

**借鉴 Aider**: Aider 的 lint-修复循环是代码编辑质量的保证——编辑 → lint → 错误反馈给 LLM → 修复 → 再 lint，直到通过。

科研场景中同样需要：
```
LLM 生成 Hypothesis
  → Validator 检查可证伪性（falsification condition 是否存在）
  → 不通过 → 错误反馈给 LLM
  → LLM 重新生成（包含 falsification condition）
  → 通过 → 输出
```

没有验证-修复循环，LLM 的输出质量完全依赖一次生成的运气。有了循环，系统能**迭代改进输出直到满足质量标准**。

#### 为什么 Hook 是可配置的，不是内置的？

科研场景的验证规则千差万别。写死在代码里就不通用了：

```typescript
// 场景 1: 实验前检查 Protocol 是否冻结
{ eventType: "PRE_TOOL_USE", matcher: "execute_python",
  condition: "status == 'CONFIRMATORY' && !protocol.frozen" }

// 场景 2: 代码执行后自动 lint
{ eventType: "POST_TOOL_USE", matcher: "execute_python",
  handler: { type: "command", config: { command: "ruff check generated_code/" } } }

// 场景 3: 论文章节写完后自动编译 LaTeX
{ eventType: "POST_TOOL_USE", matcher: "write_latex",
  handler: { type: "command", config: { command: "pdflatex paper.tex" } } }
```

Hook 的**匹配链**（事件 → matcher → condition → handler）让同一个 ExecutionBlock 在不同场景下有不同的验证行为，**不需要改 Block 的代码**。

#### 3.5.1 ExecutionBlock 定义

```typescript
import { Effect } from "effect";
import { Schema } from "@effect/schema/Schema";

export const BlockStepType = Schema.Enums({
  TOOL_CALL: "TOOL_CALL",
  COGNITIVE_CALL: "COGNITIVE_CALL",
  CONDITION: "CONDITION",
  TRANSFORM: "TRANSFORM",
  AGGREGATE: "AGGREGATE",
  VALIDATE: "VALIDATE",
} as const);

export const BlockStep = Schema.Struct({
  stepId: Schema.NonEmptyString,
  stepType: BlockStepType,
  description: Schema.String,
  toolName: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  toolArgs: Schema.NullOr(
    Schema.Record({ key: Schema.String, value: Schema.Unknown })
  ).pipe(Schema.default(null)),
  cognitiveMode: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  outputContractId: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  conditionExpr: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  trueSteps: Schema.Array(Schema.String).pipe(Schema.default([])),
  falseSteps: Schema.Array(Schema.String).pipe(Schema.default([])),
  validatorName: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
});

export const ExecutionBlock = Schema.Struct({
  blockId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  description: Schema.String,
  steps: Schema.Array(BlockStep),
  entryStep: Schema.NonEmptyString,
  successConditions: Schema.Array(Schema.String),
  failureHandler: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  maxIterations: Schema.Number.pipe(
    Schema.int(),
    Schema.atLeast(1),
    Schema.default(1)
  ),
});

export type BlockStep = Schema.Schema<typeof BlockStep>;
export type ExecutionBlock = Schema.Schema<typeof ExecutionBlock>;
```

#### 3.5.2 BlockExecutor（Effect 风格）

```typescript
import { Effect, Schedule } from "effect";

export class BlockExecutor {
  constructor(
    private toolExecutor: ToolExecutor,
    private cognitiveExecutor: CognitiveExecutor,
    private validatorRegistry: ValidatorRegistry,
  ) {}

  execute(
    block: ExecutionBlock,
    context: Record<string, unknown>,
  ): Effect.Effect<BlockResult, BlockError, never> {
    // 验证-修复循环：用 Effect 的 loop + retry 实现
    const runOnce = (iteration: number) =>
      Effect.gen(function* () {
        const state = yield* Effect.tryPromise(() =>
          this.runSteps(block, context)
        );
        const validation = yield* Effect.tryPromise(() =>
          this.validate(block, state)
        );
        if (validation.passed) {
          return { success: true as const, state, iterations: iteration + 1 };
        }
        // 修复：将验证错误注入 context
        context["validationErrors"] = validation.errors;
        return Effect.succeed({
          success: false as const,
          iterations: iteration + 1,
          needsRetry: true,
        });
      });

    // Effect loop: 最多 maxIterations 次
    return Effect.loop(0, {
      body: (i) => runOnce(i).pipe(
        Effect.filterOrFail(
          (r) => !("needsRetry" in r) || !r.needsRetry,
          () => new BlockError(`Validation failed after ${block.maxIterations} attempts`)
        )
      ),
      while: (i) => i < block.maxIterations,
    });
  }
}
```

#### 3.5.3 验证-修复循环

```
BlockStep 输出
    ↓
Validator 验证 (schema / lint / 统计检查)
    ↓
通过? ── yes ──→ BlockResult(success)
    │
    no
    ↓
错误反馈给 LLM（COGNITIVE_CALL 步骤）
    ↓
LLM 生成修复
    ↓
回到 Validator（最多 max_iterations 次）
```

> **借鉴来源**: Aider 的 lint-修复循环。编辑 → lint → 错误反馈给 LLM → 修复 → 再 lint，直到通过。

#### 3.5.4 Hook 系统

> **借鉴来源**: Claude Code 的 Hooks（PreToolUse/PostToolUse，支持 command/HTTP/MCP/prompt/agent handler）

```typescript
import { Schema } from "@effect/schema/Schema";

export const HookEventType = Schema.Enums({
  PRE_EXECUTE: "PRE_EXECUTE",
  POST_EXECUTE: "POST_EXECUTE",
  PRE_TOOL_USE: "PRE_TOOL_USE",
  POST_TOOL_USE: "POST_TOOL_USE",
  PRE_COGNITIVE: "PRE_COGNITIVE",
  POST_COGNITIVE: "POST_COGNITIVE",
  PRE_VALIDATION: "PRE_VALIDATION",
  POST_VALIDATION: "POST_VALIDATION",
} as const);

export const HookHandler = Schema.Struct({
  handlerType: Schema.Enums({
    command: "command",
    http: "http",
    mcp: "mcp",
    prompt: "prompt",
    agent: "agent",
  } as const),
  handlerConfig: Schema.Record({
    key: Schema.String,
    value: Schema.Unknown,
  }),
});

export const Hook = Schema.Struct({
  hookId: Schema.NonEmptyString,
  eventType: HookEventType,
  matcher: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  condition: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  handler: Schema.NullOr(HookHandler).pipe(Schema.default(null)),
});
```

Hook 匹配链：`事件 → matcher → condition → handler`

### 3.6 Subagent 系统

> **借鉴来源**: Claude Code 的 Subagent（独立上下文窗口 + 独立工具集 + 独立模型选择 + worktree/sandbox 隔离）

#### 为什么 Subagent 要独立上下文，而不是共享父 Agent 的？

**答案**: 共享上下文导致**信息污染**和**Token 浪费**。

| 场景 | 共享上下文 | 独立上下文 |
|------|----------|-----------|
| 文献调研 | 主上下文被 50 篇论文填满 | 子 Agent 独立窗口，只返回摘要 |
| 并行实验 | 3 个实验互相干扰 | 3 个独立工作目录，互不干扰 |
| Token 消耗 | 每次调用都带完整历史 | 子 Agent 只带必要信息 |
| 模型选择 | 只能用主模型 | 可用更便宜的模型（如 Haiku） |

**效果**: 一个文献调研 Subagent 读取 50 篇论文，主 Agent 上下文只增加 1 条摘要消息（~200 tokens），而不是 50 篇论文内容（~100,000 tokens）。

#### 为什么需要 worktree/sandbox 隔离？

- **worktree**: 每个 Subagent 在独立 git worktree 中工作，修改不影响主仓库。适合"并行探索不同假设"场景。
- **sandbox**: 在 bubblewrap/Seatbelt 容器中运行，文件系统+网络完全隔离。适合"执行不可信代码"场景。

#### 3.6.1 设计

```typescript
import { Schema } from "@effect/schema/Schema";

export const SubagentDefinition = Schema.Struct({
  subagentId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  description: Schema.String,
  systemPrompt: Schema.String,
  allowedTools: Schema.Array(Schema.String),
  disallowedTools: Schema.Array(Schema.String).pipe(Schema.default([])),
  model: Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  maxTurns: Schema.Number.pipe(Schema.int()).pipe(Schema.default(50)),
  maxBudgetUsd: Schema.NullOr(Schema.Number).pipe(Schema.default(null)),
  isolation: Schema.Enums({
    sandbox: "sandbox",
    worktree: "worktree",
    none: "none",
  } as const).pipe(Schema.default("sandbox")),
  skills: Schema.Array(Schema.String).pipe(Schema.default([])),
  hooks: Schema.Array(Hook).pipe(Schema.default([])),
});

export const SubagentResult = Schema.Struct({
  subagentId: Schema.NonEmptyString,
  status: Schema.Enums({
    success: "success",
    failed: "failed",
    budget_exceeded: "budget_exceeded",
  } as const),
  summary: Schema.String,
  structuredOutput: Schema.Record({
    key: Schema.String,
    value: Schema.Unknown,
  }).pipe(Schema.default({})),
  toolCallsMade: Schema.Number.pipe(Schema.int()).pipe(Schema.default(0)),
  totalCost: Schema.Number.pipe(Schema.default(0)),
});

export type SubagentDefinition = Schema.Schema<typeof SubagentDefinition>;
export type SubagentResult = Schema.Schema<typeof SubagentResult>;
```

#### 3.6.2 隔离机制

- **独立上下文窗口**: 子 Agent 只有自己的 system prompt，不继承父对话历史
- **独立工具集**: 通过 `allowed_tools`/`disallowed_tools` 精确控制
- **独立模型选择**: 可使用更便宜的模型（如 Haiku）来省钱
- **工作空间隔离**: `isolation: worktree` 在独立 git worktree 中运行
- **沙箱隔离**: `isolation: sandbox` 在 bubblewrap 沙箱中运行
- **结果汇总**: 只返回摘要，完整推理过程保留在子 Agent 日志中

#### 3.6.3 内置 Subagent

```
├── lit-reviewer   (只读工具, 用于文献探索)
├── coder          (代码生成和执行)
├── analyst        (统计分析和诊断)
├── writer         (论文写作)
└── reviewer       (审稿视角的验证)
```

### 3.7 Workflow 编排

> **借鉴来源**: Claude Code Dynamic Workflow（代码脚本编排，非 LLM 维护，
> 中间结果在脚本变量中不进 LLM 上下文）

#### 为什么 Workflow 是代码脚本，不是 LLM 生成的？

Claude Code 的 Dynamic Workflow 证明了一个核心原则：**编排逻辑应该由确定性代码控制，不是 LLM**。

```
LLM 编排:  "先调研，然后选题，然后做实验..."
  → 可能跳过步骤、可能循环、可能忘记中间结果

代码编排:  const results = await Effect.all([h1, h2, h3], { concurrency: 4 })
  → 确定性执行、可审计、可恢复
```

#### 为什么中间结果不进 LLM 上下文？

Workflow 的中间结果（如文献调研的 50 篇论文摘要）如果全部进入 LLM 上下文：
- 浪费 token（100,000+ tokens）
- 污染上下文窗口，后续步骤没有空间

代码编排的中间结果存在**脚本变量**中，只有最终摘要才进入 LLM 上下文。

#### 为什么每个 phase 后有用户交互点？

这是 PaperFactory 区别于 Claude Code Workflow 的关键设计。Claude Code 的 Workflow 有 "No mid-run user input" 的限制。而科研需要**人在环中**做关键决策：

```
Phase 1: 文献调研完成 → 暂停 → 用户确认调研方向
Phase 2: 假设生成完成 → 暂停 → 用户选择探索哪些假设
Phase 3: 实验设计完成 → 暂停 → 用户审批 Protocol
```

#### 3.7.1 设计（Effect 风格）

```typescript
// workflows/paper-generation.ts
import { Effect } from "effect";

export class PaperGenerationWorkflow {
  readonly name = "paper-generation";

  run(ctx: WorkflowContext) {
    return Effect.gen(function*() {
      // Phase 1: 文献调研（并行探索）
      const litReview = yield* Effect.flatMap(
        phase("literature-review", () => this.literaturePhase(ctx)),
        () => Effect.sync(() => {})
      );

      // Phase 2: Gap 识别（串行）
      const gaps = yield* phase("gap-identification", () =>
        this.gapPhase(ctx, litReview)
      );

      // Phase 3: 并行假设探索（Effect.all + concurrency）
      const hypothesisResults = yield* Effect.all(
        gaps.map(gap => this.exploreHypothesis(ctx, gap)),
        { concurrency: 4 }
      );

      // Phase 4: 实验执行
      const experiments = yield* phase("experiment-execution", () =>
        this.experimentPhase(ctx, hypothesisResults)
      );

      // Phase 5: 论文写作
      const manuscript = yield* phase("manuscript-writing", () =>
        this.writingPhase(ctx, experiments)
      );

      return { success: true as const, data: { manuscript } };
    });
  }
}
```

#### 3.7.2 关键特性

- **代码脚本编排**: 编排逻辑编码为 TypeScript 代码，不依赖 LLM 在上下文中维护
- **循环/分支/并行**: `parallel()` 最多 16 并发，`pipeline()` 列表并行
- **中间结果在脚本变量中**: 不进入 LLM 上下文，节省 token
- **可恢复**: 暂停后已完成的 agent 返回缓存结果
- **阶段间用户交互**: 每个 `phase()` 后可以暂停征求用户意见（区别于 Claude Code 的 "No mid-run user input"）

### 3.8 状态管理

#### 3.8.1 ResearchStateSnapshot（已实现）

参见 `packages/domain/models.py`。不可变，revision 单调递增。

#### 为什么状态必须不可变（immutable）？

科研需要**版本化**和**事件溯源**（宪法 §29, §33）。不可变状态带来三个关键能力：

1. **Time-travel**: 可以精确回答"Day 3 的研究状态是什么"——不是摘要，是完整快照
2. **Diff**: 可以精确回答"从 Day 3 到 Day 5 改了什么"——对象级对比，不是文本 diff
3. **Replay**: 可以从初始状态 + 事件日志重建任意时刻的状态——不依赖数据库备份

对比 Claude Code：
```
Claude Code: 状态 = 对话历史 JSONL
  → compact 后 88% 信息丢失
  → 无法回答"Day 3 的具体决策依据是什么"

PaperFactory: 状态 = 不可变快照 + 事件日志
  → 每次变更 revision + 1
  → 完整审计链，可追溯每个决策
```

#### 为什么用 @effect/sql-pg 而不是 Drizzle 直接操作？

Drizzle 的 API 基于 async/await，不是 Effect 风格。`@effect/sql-pg` 原生支持：
- **类型安全错误**: 数据库错误在 `Effect<E, A>` 类型中，不是 try/catch
- **依赖注入**: `Effect.Service` 自动注入 PostgresClient，测试时注入 mock
- **事务管理**: `Effect.scoped` 自动管理事务提交/回滚
- **与 Effect 生态集成**: 可以直接组合 `Effect.all` / `Effect.retry` 等

#### 3.8.2 ResearchObjectStore（待实现）

```typescript
import { Effect } from "effect";
import { PostgresClient } from "@effect/sql-pg";
import { Sql } from "@effect/sql";

// Effect Service 模式
export class ResearchObjectStore extends Effect.Service<ResearchObjectStore>()(
  "ResearchObjectStore",
  {
    deps: { postgres: PostgresClient },
    effect: (take) => ({
      postgres: take.postgres,
      save: (obj: ResearchObject) =>
        Effect.gen(function*() {
          const currentRev = yield* this.getRevision(obj.projectId, obj.branchId);
          yield* this.postgres.execute(
            `INSERT INTO research_objects (id, project_id, branch_id, object_type, status, data, revision)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            obj.questionId, obj.projectId, obj.branchId,
            obj.objectType, obj.status, JSON.stringify(obj.data),
            currentRev + 1
          );
        }),
      get: (objectId: string) =>
        Effect.flatMap(
          this.postgres.one(
            `SELECT * FROM research_objects WHERE id = $1`,
            objectId
          ),
          Effect.map((row) => row as ResearchObject)
        ),
      getRevision: (projectId: string, branchId: string) =>
        Effect.map(
          this.postgres.one(
            `SELECT MAX(revision) as max_rev FROM research_objects
             WHERE project_id = $1 AND branch_id = $2`,
            projectId, branchId
          ),
          Effect.map((row) => (row.max_rev ?? 0) as number)
        ),
      snapshot: (projectId: string, branchId: string) =>
        Effect.map(
          this.postgres.all(
            `SELECT * FROM research_objects
             WHERE project_id = $1 AND branch_id = $2`,
            projectId, branchId
          ),
          Effect.map((rows) => buildSnapshot(rows))
        ),
    }),
  }
) {}
```

#### 3.8.3 版本化

每次状态变更 `revision + 1`。历史版本不可覆盖，支持时间旅行查询。

#### 3.8.4 分支管理（已实现）

参见 `packages/control/branches.py` 和 `packages/control/branch_manager.py`。
支持 `ACTIVE`/`PAUSED`/`MERGED`/`REJECTED`/`ARCHIVED` 状态。

#### 3.8.5 事件溯源

所有重要状态变化产生不可变的 Domain Event（参见 `packages/domain/events.py`）。
事件不可删除、不可修改，支持完整审计。

### 3.9 认知管线（已实现，简要描述）

```
ContextCompiler.compile
  → PromptAssembler.assemble
  → ProviderProjector.project
  → OutputValidator.validate
```

- **10 种 CognitiveMode**: FRAME, EXPLORE, MAP, COMPARE, FALSIFY, DIAGNOSE, DISCRIMINATE, VERIFY, SYNTHESIZE, DECIDE
- **BlindingPolicy**: 程序级信息隐藏（非 Prompt 级）
- **ContextPolicy**: 控制 Agent 能看到什么
- **RetrievalPolicy**: 控制检索策略

详见 `packages/cognition/modes.py` 和相关模块。

### 3.10 科研循环

四种科研循环（宪法 §13）：

#### Discovery Loop（发现循环）

```
观察现象 → 提出解释 → 搜索反例 → 发现新现象 → 修正解释
```

用于调研和选题阶段。

#### Confirmation Loop（确认循环）

```
假设 → 冻结协议 → 执行实验 → 分析结果 → 确认/否定假设
```

Protocol 必须 FROZEN，不得 post-hoc 修改。

#### Engineering Loop（工程循环）

```
设计 → 实现 → 验证 → 调优 → 再验证
```

用于代码生成和实验执行。

#### Correction Loop（纠正循环）

```
发现问题 → 分析根因 → 修正 → 重新发现
```

用于实验失败后的回退和修正。

#### 回退机制

```
调研 → 选题 → 实验 → 失败
                              → ResearchFailure(SCIENTIFIC)
                              → 回退到选题 → 调整假设 → 新实验
                              → 回退到调研 → 重新调研
```

回退通过分支机制实现：创建新 Branch，fork 自失败前的状态快照。

---

## 4. 目录结构

```
paperfactory/
├── README.md
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── eslint.config.ts
├── drizzle.config.ts
├── .paperfactory/
│   └── skills/                          # 项目级 Skills
│       ├── lit-review/
│       │   └── SKILL.md
│       ├── experiment-design/
│       │   └── SKILL.md
│       ├── paper-writing/
│       │   └── SKILL.md
│       └── rebuttal/
│           └── SKILL.md
├── src/
│   ├── domain/                          # 领域模型 [待实现 - TS 重写]
│   │   ├── ids.ts                       # UUID 工具函数
│   │   ├── enums.ts                     # GateStatus, SideEffectLevel, etc.
│   │   ├── events.ts                    # DomainEvent, ControlEvent
│   │   ├── snapshot.ts                  # ResearchStateSnapshot
│   │   └── objects/                     # Research Object 模型 (zod schemas)
│   │       ├── question.ts
│   │       ├── knowledge.ts
│   │       ├── gap.ts
│   │       ├── hypothesis.ts
│   │       ├── design.ts
│   │       ├── protocol.ts
│   │       ├── experiment.ts
│   │       ├── result.ts
│   │       ├── evidence.ts
│   │       ├── claim.ts
│   │       ├── failure.ts
│   │       ├── decision.ts
│   │       ├── approval.ts
│   │       ├── manuscript.ts
│   │       └── submission.ts
│   ├── control/                         # 科研控制平面 [待实现 - TS 重写]
│   │   ├── actions.ts
│   │   ├── controller.ts
│   │   ├── engine.ts
│   │   ├── gates.ts
│   │   ├── registry.ts
│   │   ├── proposals.ts
│   │   ├── tasks.ts
│   │   ├── branches.ts
│   │   ├── approvals.ts
│   │   ├── policy.ts
│   │   ├── loop.ts
│   │   ├── candidates.ts
│   │   ├── merges.ts
│   │   ├── pending.ts
│   │   └── errors.ts
│   ├── cognition/                       # 认知控制平面 [待实现 - TS 重写]
│   │   ├── modes.ts
│   │   ├── context.ts
│   │   ├── compiler.ts
│   │   ├── prompt.ts
│   │   ├── provider.ts
│   │   ├── output.ts
│   │   ├── retrieval.ts
│   │   └── policies.ts
│   ├── runtime/                         # Agent 运行时 [待实现 - TS 重写]
│   │   ├── agent.ts
│   │   ├── lifecycle.ts
│   │   ├── provider.ts
│   │   ├── model-execution.ts
│   │   ├── model-selection.ts
│   │   ├── execution.ts
│   │   ├── tools/                       # Tool 系统
│   │   │   ├── registry.ts
│   │   │   ├── definition.ts
│   │   │   ├── executor.ts
│   │   │   ├── output.ts
│   │   │   ├── mcp/                     # MCP 集成 (@modelcontextprotocol/sdk)
│   │   │   │   ├── server.ts
│   │   │   │   └── transports.ts
│   │   │   └── builtins/                # 内置工具
│   │   │       ├── scholarly.ts
│   │   │       ├── filesystem.ts
│   │   │       ├── code.ts
│   │   │       ├── latex.ts
│   │   │       ├── data.ts
│   │   │       └── network.ts
│   │   ├── skills/                      # Skill 系统
│   │   │   ├── loader.ts
│   │   │   ├── definition.ts
│   │   │   └── executor.ts
│   │   ├── subagent/                    # Subagent 系统
│   │   │   ├── definition.ts
│   │   │   ├── executor.ts
│   │   │   └── isolation.ts
│   │   ├── hooks/                       # Hook 系统
│   │   │   ├── definition.ts
│   │   │   ├── dispatcher.ts
│   │   │   └── handlers/
│   │   ├── blocks/                      # ExecutionBlock 系统
│   │   │   ├── definition.ts
│   │   │   ├── executor.ts
│   │   │   └── validators.ts
│   │   ├── workflows/                   # Workflow 编排
│   │   │   ├── engine.ts
│   │   │   ├── primitives.ts
│   │   │   └── context.ts
│   │   └── sandbox/                     # 沙箱 (调用 Python 微服务)
│   │       ├── client.ts
│   │       └── network.ts
│   ├── capabilities/                    # 科研能力层 [待实现]
│   │   ├── literature/
│   │   │   ├── search.ts
│   │   │   ├── retrieval.ts
│   │   │   ├── parsing.ts
│   │   │   ├── reading.ts
│   │   │   ├── citations.ts
│   │   │   └── knowledge.ts
│   │   ├── code/
│   │   │   ├── generation.ts
│   │   │   ├── editing.ts
│   │   │   └── execution.ts
│   │   ├── experiment/
│   │   │   ├── design.ts
│   │   │   ├── execution.ts
│   │   │   ├── collection.ts
│   │   │   └── stats.ts
│   │   ├── writing/
│   │   │   ├── outline.ts
│   │   │   ├── drafting.ts
│   │   │   ├── citation.ts
│   │   │   └── review.ts
│   │   └── submission/
│   │       ├── venue-matching.ts
│   │       ├── format-adaptation.ts
│   │       └── rebuttal.ts
│   ├── persistence/                     # 数据/审计层 [待实现]
│   │   ├── postgres/
│   │   │   ├── schema.ts               # Drizzle 表定义
│   │   │   ├── client.ts               # 连接管理
│   │   │   └── migrations/             # drizzle-kit 迁移
│   │   ├── vector/
│   │   │   └── pgvector.ts
│   │   ├── event-store.ts
│   │   ├── object-store.ts
│   │   └── artifact-store.ts
│   ├── observability/                   # 可观测性 [待实现]
│   │   ├── logger.ts                   # Pino
│   │   ├── tracer.ts                   # OpenTelemetry
│   │   ├── metrics.ts
│   │   └── audit.ts
│   ├── evals/                           # 评估 [待实现]
│   │   ├── harness.ts
│   │   ├── state-transition.ts
│   │   ├── gate.ts
│   │   ├── action-selection.ts
│   │   ├── evidence-grounding.ts
│   │   └── long-horizon.ts
│   ├── api/                             # Hono API 服务 [待实现]
│   │   ├── server.ts
│   │   ├── routes/
│   │   │   ├── project.ts
│   │   │   ├── research.ts
│   │   │   ├── approval.ts
│   │   │   └── webhook.ts
│   │   └── ws/                          # WebSocket
│   │       └── stream.ts
│   └── app/                             # 应用入口
│       ├── orchestration/
│       │   ├── loop-runner.ts
│       │   └── action-executor.ts
│       └── cli.ts                       # CLI 入口
├── science-service/                     # Python 微服务 [待实现]
│   ├── pyproject.toml
│   ├── main.py                         # FastAPI 入口
│   └── modules/
│       ├── statistics.py               # scipy 统计检验
│       ├── pdf-parsing.py              # GROBID PDF 解析
│       ├── latex.py                    # LaTeX 编译
│       ├── sandbox.py                  # bubblewrap/Seatbelt 沙箱
│       └── data-processing.py          # numpy/pandas
├── workflows/                           # Workflow 脚本 [待实现]
│   ├── literature-survey.ts
│   ├── hypothesis-exploration.ts
│   ├── experiment-pipeline.ts
│   └── paper-generation.ts
├── test/                                # vitest 测试
│   ├── unit/
│   ├── integration/
│   └── evals/
└── docs/
    ├── adr/
    │   ├── ADR-001-architecture-style.md
    │   ├── ADR-002-research-state-ownership.md
    │   └── ADR-003-technology-baseline.md
    ├── architecture/
    │   ├── agent-loop.md
    │   ├── vertical-slice.md
    │   └── dependency-rules.md
    └── design/
        └── architecture-v2.md           # 本文档
```

### 4.2 状态标注图例

- **[已有 - Python]**: 现有 Python 代码，作为参考实现
- **[待实现 - TS 重写]**: 需从 Python 重写为 TypeScript
- **[待实现]**: 全新功能，尚未编码
- **[待实现 - Python 微服务]**: 科学计算专用，保留 Python

---

## 5. 开发路线图

### Phase 0：TS 项目基础 + 领域模型

**目标**: 搭建 TS 项目结构，定义所有 Research Object。

**交付物**:
- TS 项目脚手架（tsup + vitest + eslint + pnpm）
- `src/domain/objects/` 下所有 Research Object 定义（zod schema）
- 每个对象的类型定义、状态机、不变量
- 单元测试覆盖所有不变量检查

**验收标准**:
- 所有 Object 通过 zod schema 运行时验证
- 所有字段 `readonly`
- 每个对象有完整的不变量测试
- 状态机转换有明确的测试用例

### Phase 1：持久化层（Drizzle + PostgreSQL）

**目标**: PostgreSQL 持久化。

**交付物**:
- `src/persistence/postgres/` Drizzle ORM 实现
- ResearchObjectStore 持久化实现
- Event Store 持久化
- drizzle-kit 迁移脚本

**验收标准**:
- 数据可持久化、可恢复、可版本化
- 事件溯源支持完整审计
- PostgreSQL + pgvector 集成

### Phase 2：核心控制面（TS 重写）

**目标**: 将现有 Python control/cognition/runtime 重写为 TS。

**交付物**:
- `src/control/` — Controller, ActionRegistry, TransitionEngine, TaskManager, BranchManager, ApprovalManager, PolicyEngine, GateEngine
- `src/cognition/` — ContextCompiler, PromptAssembler, ProviderProjector, OutputValidator
- `src/runtime/` — Session, Run, Agent Binding, Provider Execution, Model Selection

**验收标准**:
- 覆盖现有 Python 所有功能
- vitest 测试通过
- 保持架构边界不变

### Phase 3：科研能力层（第一批）+ Python 微服务

**目标**: 实现文献调研 Capability + Python 科学计算微服务。

**交付物**:
- `src/capabilities/literature/` 完整实现
- `src/tools/builtins/scholarly.ts` 工具实现
- `science-service/` Python 微服务（scipy/numpy/GROBID/LaTeX）
- Literature Skill
- HTTP 通信：TS 主服务 → Python 微服务

**验收标准**:
- 能够执行 SEARCH_LITERATURE → RETRIEVE_PAPER → PARSE_DOCUMENT → READ_PAPER 完整链路
- 产出结构化的 KnowledgeItem
- Capability 不直接修改 Research State（通过 Observation → Gate → Transition）
- Python 微服务 HTTP 接口正确响应

### Phase 4：Tool + Skill + Subagent 系统

**目标**: 补齐 Runtime 层的执行能力。

**交付物**:
- ToolRegistry + ToolExecutor（含 MCP 集成，`@modelcontextprotocol/sdk`）
- SkillLoader（热加载，chokidar）
- SubagentExecutor（隔离执行）
- 沙箱实现（bubblewrap/Seatbelt，通过 Python 微服务）

**验收标准**:
- 只读工具并发执行（Promise.all），写工具顺序执行
- Skill 文件系统变更自动热加载
- Subagent 独立上下文和工具集
- 沙箱正确隔离文件系统和网络

### Phase 5：科研能力层（第二批）

**目标**: 实现实验执行和论文写作的 Capability。

**交付物**:
- `src/capabilities/experiment/` 完整实现
- `src/capabilities/writing/` 完整实现
- `src/tools/builtins/code.ts`, `data.ts`, `latex.ts`
- Experiment 和 Writing Skill

**验收标准**:
- 能够执行完整的 Confirmation Loop
- Protocol FROZEN 后代码级不可修改
- 产出可追溯的 Result → Evidence → Claim 链

### Phase 6：Workflow + ExecutionBlock + Hook

**目标**: 实现编排和扩展机制。

**交付物**:
- WorkflowEngine（parallel/pipeline/phase）
- ExecutionBlock + BlockExecutor + 验证-修复循环
- Hook 系统（dispatcher + handlers）

**验收标准**:
- Workflow 脚本可编排多个 Subagent 并行执行
- ExecutionBlock 支持验证-修复循环
- Hook 可在生命周期事件注入处理逻辑

### Phase 7：API 服务

**目标**: 实现 Hono API 服务。

**交付物**:
- Hono REST API
- WebSocket 实时推送
- 审批请求 API
- Webhook 接口

**验收标准**:
- RESTful API 覆盖所有核心操作
- 审批请求可通过 API 触发和响应

### Phase 8：可观测性 + 评估

**目标**: 完善系统可观测性和评估能力。

**交付物**:
- OpenTelemetry tracing/metrics
- Pino 结构化日志
- 审计日志
- 评估框架

**验收标准**:
- 每次 Research Run 可完整追踪（宪法 §45）
- 评估覆盖所有宪法要求的质量维度

### Phase 9：前端

**目标**: 实现 Next.js Web 界面。

**交付物**:
- Next.js 前端应用
- Project Workspace, Research Map, Task Board, Agent Console, Approval Queue

**验收标准**:
- 所有核心功能可通过 Web 界面操作
- Chat 只是交互层，不是状态来源

---

## 附录 A：借鉴来源索引

| 设计点 | 借鉴来源 | 说明 |
|--------|----------|------|
| Tool Registry + MCP 集成 | Claude Code | 双层注册、ToolSearch 延迟加载 |
| 并行工具执行 | Claude Code | 只读并发、写顺序 |
| 权限层级 deny→ask→allow | Claude Code | 工具级/参数级/路径级粒度 |
| OS 级沙箱 | Claude Code | bubblewrap/Seatbelt + 网络代理 |
| Subagent 独立上下文 | Claude Code | 独立系统提示 + 独立工具集 + 独立模型 |
| Skill Markdown + frontmatter | Claude Code | 作用域 + 热加载 + 动态上下文注入 |
| Workflow 代码脚本编排 | Claude Code Dynamic Workflow | 中间结果不进 LLM 上下文 |
| Hook 系统 | Claude Code | 生命周期事件 + 5 种 handler |
| Plugin 分发 | Claude Code | agents + skills + hooks + MCP 打包 |
| 多编辑格式 | Aider | 不同模型适配不同输出格式 |
| 验证-修复循环 | Aider | lint-修复循环 |
| 架构师/编辑器双模型 | Aider | 规划用强推理，执行用强编辑 |
| Repo Map (AST) | Aider | tree-sitter 解析符号地图 |
| 专用输出格式化工具 | SWE-agent ACI | 文件查看限制行数、简洁搜索结果 |
| 动作独立性 | mini-SWE-agent | 每个工具调用完全独立 |

## 附录 B：宪法引用索引

| 设计决策 | 宪法条款 | 内容 |
|----------|----------|------|
| LLM 提议/系统决策 | §10, §16, §24 | ADR-002 冻结公理 |
| 证据改变状态 | §10, §16 | ADR-002 冻结公理 |
| 工具执行/控制器治理 | §10, §24 | ADR-002 冻结公理 |
| Research State 核心 | §11 | 状态必须持久化/可版本化/可恢复/可追溯/可重建 |
| 非线性科研流程 | §13 | 循环/回退/分支/暂停/纠正 |
| 探索/确认分离 | §14 | Protocol 冻结后不可修改 |
| 科研认知纪律 | §15.1-§15.10 | Problem First / KNOWN-INFERED-ASSUMED-UNKNOWN / Evidence Grounding / Contradiction First / Falsifiability / Uncertainty Driven / Claim Calibration / Explicit Stop |
| 状态变更受控 | §16 | 无 set_status，必须经过 Transition |
| Gate 优先于 Prompt | §17 | 确定性代码判断优先于 LLM 语义判断 |
| Prompt 不是系统架构 | §18 | Prompt 是末端实现，不是核心 |
| Context 必须被编译 | §19 | 禁止堆积，必须通过 Context Compiler |
| 科研 Blinding | §20 | 程序级 Context Policy 防止信息泄漏 |
| Cognitive Mode 显式 | §21 | 不得所有任务用通用 Prompt |
| Tool/Skill/Agent/Workflow 分离 | §22 | 四个层级的可复用单元 |
| Agent 不得是黑箱 | §23 | 确定性代码优先于 Agent |
| Runtime vs 科研语义隔离 | §25 | Runtime 不理解科研含义 |
| Runtime Failure vs Scientific Failure | §26 | 可 retry vs 不可 auto-retry |
| 权限和副作用显式 | §27 | P0-P5 权限层级 |
| HITL 是正式状态 | §28 | WAITING_FOR_APPROVAL 状态 |
| 数据可版本化 | §29 | 不得静默覆盖历史版本 |
| Result/Evidence/Claim 分层 | §30 | 三层不可混淆 |
| Research Failure 保存 | §31 | 失败不是垃圾数据 |
| Research Branch 一等概念 | §32 | 并行研究路线 |
| Event 贯穿系统 | §33 | 不可变 Domain Event |
| Runtime Event vs Domain Event | §34 | 两套语义独立 |
| Source of Truth 明确 | §35 | PostgreSQL = system of record |
| Vector Retrieval 不是 Memory | §36 | 优先结构化关系 |
| 模块边界 | §37 | 新增代码必须明确归属 |
| Domain 不依赖基础设施 | §38 | Infrastructure depends on Domain |
| Modular Monolith | §39 | 初期不做微服务 |
| 不引入复杂基础设施 | §40 | 默认不要自行引入 Kafka/K8s/Neo4j 等 |
| Typed Interface 优先 | §41 | 优先 typed contract，避免 dict[str, Any] |
| Immutable 优先 | §42 | Protocol/Result/Evidence source 等不可变 |
| Explicit 优先于 Magic | §43 | 系统必须显式定义所有关键概念 |
| 可恢复性 | §44 | checkpoint/resume/retry/cancel |
| 可观测性 | §45 | 每次 Run 至少追踪 12 项指标 |
| Eval 是产品一部分 | §46 | 不仅测输出，还要测过程 |
| 开发策略 | §49 | Top-down Skeleton + Vertical Increment |
| 当前阶段总原则 | §50 | Correctness > State consistency > Controllability > ... > Agent intelligence |

---

## 附录 C：OpenCode 源码分析 — 可复用设计

> 基于 opencode-ai/opencode 源码（Go 语言，单二进制 CLI 工具）的深度分析。
> 目标：找出可以复用到 PaperFactory（TS + Effect）的设计模式。

### C.1 Provider 抽象层

**原理**：OpenCode 通过统一的 `Provider` 接口屏蔽不同 LLM 厂商的差异，内部用 `baseProvider[C ProviderClient]` 泛型基类处理通用逻辑（消息清理/重试），具体厂商实现 `ProviderClient` 接口。

**核心接口**：

```typescript
// provider.ts
import { Effect, Stream } from "effect";

// 工具调用结构（OpenCode 原样复用）
export interface ToolCall {
  id: string;         // LLM 生成的调用 ID
  name: string;       // 工具名称
  input: string;      // JSON 字符串参数
  finished: boolean;  // 是否完成（流式时分阶段）
}

// Token 用量
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

// 结束原因（OpenCode 原样复用）
export type FinishReason =
  | "end_turn"       // 正常结束
  | "max_tokens"     // 达到 token 上限
  | "tool_use"       // 请求工具调用
  | "canceled"       // 取消
  | "error"          // 错误
  | "unknown";

// 完整的 Provider 响应
export interface ProviderResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  finishReason: FinishReason;
}

// 流式事件（discriminated union，OpenCode 原样复用）
export type ProviderEvent =
  | { type: "content_start" }
  | { type: "content_delta"; content: string }
  | { type: "content_stop" }
  | { type: "thinking_delta"; thinking: string }
  | { type: "tool_use_start"; toolCall: ToolCall }
  | { type: "tool_use_delta"; toolCall: ToolCall }
  | { type: "tool_use_stop"; toolCall: ToolCall }
  | { type: "complete"; response: ProviderResponse }
  | { type: "error"; error: Error };

// Provider 接口
export interface Provider {
  sendMessages(
    messages: Message[],
    tools: BaseTool[]
  ): Effect<ProviderResponse, ProviderError>;

  streamResponse(
    messages: Message[],
    tools: BaseTool[]
  ): Stream<ProviderEvent, ProviderError>;

  model(): Model;
}
```

**为什么这样设计**：
- `sendMessages` 用于非流式场景（批量处理、后台任务）
- `streamResponse` 用于流式场景（UI 实时显示），返回 `Stream<ProviderEvent>` 而非 `Promise`
- `ProviderEvent` 是 discriminated union，编译期穷尽检查，不会漏处理事件类型
- 各厂商实现只需要实现 `stream` 方法，通用逻辑在基类处理

**复用度**：100%。接口设计直接借鉴，各厂商实现用 Effect 重写。

---

### C.2 工具系统

**原理**：OpenCode 的工具接口极简——两个方法，`Info()` 返回描述（给 LLM 看），`Run()` 执行（返回结果）。

**核心接口**：

```typescript
// tools/contracts.ts
import { Effect } from "effect";

// 工具的元信息（给 LLM 做 function calling 的 schema）
export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, any>;  // JSON Schema properties
  required: string[];
}

// LLM 发出的工具调用请求
export interface ToolCall {
  id: string;     // 调用 ID
  name: string;   // 工具名
  input: string;  // JSON 字符串参数
}

// 工具执行结果
export interface ToolResponse {
  type: "text" | "image";
  content: string;
  metadata?: string;    // 可选 JSON 元数据
  isError: boolean;
}

// 工具接口（OpenCode 原样复用，Run 改为 Effect）
export interface BaseTool {
  info(): ToolInfo;
  run(call: ToolCall): Effect<ToolResponse, ToolError>;
}
```

**具体工具实现示例**：

```typescript
// tools/builtins/bash.ts
import { Effect } from "effect";
import { execa } from "execa";

export class BashTool implements BaseTool {
  constructor(private timeout: number = 60_000) {}

  info(): ToolInfo {
    return {
      name: "bash",
      description: "Executes a bash command in the working directory.",
      parameters: {
        command: { type: "string", description: "The command to execute" },
        timeout: { type: "number", description: "Timeout in milliseconds" }
      },
      required: ["command"]
    };
  }

  run(call: ToolCall): Effect<ToolResponse, ToolError> {
    return Effect.gen(function*() {
      const params = JSON.parse(call.input) as { command: string; timeout?: number };
      const result = yield* Effect.tryPromise({
        try: () => execa(params.command, {
          shell: "bash",
          timeout: params.timeout ?? this.timeout,
          cwd: process.cwd(),
        }),
        catch: (err) => new ToolError("EXECUTION_FAILED", err.message),
      });
      return {
        type: "text",
        content: result.stdout ?? "",
        isError: result.failed,
      };
    });
  }
}
```

**为什么这样设计**：
- `info()` 返回 JSON Schema，直接映射到 LLM 的 function calling 格式
- `run()` 返回 `Effect<ToolResponse, ToolError>`，错误在类型中声明
- 接口极简，新增工具只需实现两个方法

**复用度**：100%。接口原样复用，实现用 Effect 重写。

---

### C.3 Agent Loop

**原理**：OpenCode 的 Agent Loop 是 `for` 循环 + `streamAndHandleEvents`。流式消费 Provider 事件 → 收集 tool calls → 执行工具 → 追加到消息历史 → 如果 finishReason 是 `tool_use` 则继续循环。

**核心流程**：

```typescript
// agent/loop.ts
import { Effect, Stream, Array } from "effect";

interface StreamResult {
  message: Message;
  toolResultsMsg: Message;
  finishReason: FinishReason;
  toolResults: Array<ToolResult>;
}

export class AgentLoop {
  constructor(
    private provider: Provider,
    private tools: Array<BaseTool>,
    private messages: MessageService,
  ) {}

  run(sessionId: string, content: string): Effect<Message, Error> {
    return Effect.gen(function*() {
      // 1. 获取消息历史
      let msgHistory = yield* messages.list(sessionId);

      // 2. 创建用户消息
      const userMsg = yield* messages.create(sessionId, {
        role: "user",
        parts: [{ type: "text", text: content }],
      });
      msgHistory = [...msgHistory, userMsg];

      // 3. Agent loop — 直到没有 tool_use
      while (true) {
        const result = yield* this.streamAndExecute(sessionId, msgHistory);

        // 没有工具调用 → 结束，返回最终消息
        if (result.finishReason !== "tool_use" || result.toolResults.length === 0) {
          return result.message;
        }

        // 有工具调用 → 追加 assistant 消息 + tool results，继续循环
        msgHistory = [...msgHistory, result.message, result.toolResultsMsg];
      }
    });
  }

  private streamAndExecute(
    sessionId: string,
    history: Array<Message>
  ): Effect<StreamResult, Error> {
    return Effect.gen(function*() {
      // 创建 assistant message 占位
      const assistantMsg = yield* messages.create(sessionId, {
        role: "assistant",
        parts: [],
        model: this.provider.model().id,
      });

      // 消费流式事件，收集 content 和 tool calls
      const response = yield* this.provider.streamResponse(history, this.tools).pipe(
        Stream.fold(
          { content: "", toolCalls: [] as Array<ToolCall>, finishReason: "unknown" as FinishReason },
          (acc, event) => {
            switch (event.type) {
              case "content_delta":
                return { ...acc, content: acc.content + event.content };
              case "tool_use_stop":
                return { ...acc, toolCalls: [...acc.toolCalls, event.toolCall] };
              case "complete":
                return { ...acc, finishReason: event.response.finishReason };
              default:
                return acc;
            }
          }
        )
      );

      // 更新 assistant message
      if (response.content) {
        yield* messages.appendPart(sessionId, assistantMsg.id, {
          type: "text",
          text: response.content,
        });
      }
      for (const tc of response.toolCalls) {
        yield* messages.appendPart(sessionId, assistantMsg.id, {
          type: "tool_call",
          id: tc.id,
          name: tc.name,
          input: tc.input,
          finished: true,
        });
      }

      // 执行所有工具调用（只读并发，写入顺序）
      const toolResults = yield* this.executeTools(response.toolCalls);

      // 创建 tool results message
      const toolResultsMsg = yield* messages.create(sessionId, {
        role: "tool",
        parts: toolResults.map(tr => ({
          type: "tool_result" as const,
          toolCallId: tr.toolCallId,
          content: tr.content,
          isError: tr.isError,
        })),
      });

      return { message: assistantMsg, toolResultsMsg, finishReason: response.finishReason, toolResults };
    });
  }

  private executeTools(calls: Array<ToolCall>): Effect<Array<ToolResult>, never> {
    const readable = calls.filter(tc => {
      const tool = this.tools.find(t => t.info().name === tc.name);
      return tool && (tool.info().parameters?.sideEffect === "read" || !tool.info().parameters?.sideEffect);
    });
    const writable = calls.filter(tc => !readable.includes(tc));

    return Effect.gen(function*() {
      const readResults = yield* Effect.all(
        readable.map(tc => this.executeSingle(tc)),
        { concurrency: "unbounded" }
      );
      const writeResults = yield* Effect.all(
        writable.map(tc => this.executeSingle(tc)),
        { concurrency: 1 }
      );
      return [...readResults, ...writeResults];
    });
  }

  private executeSingle(call: ToolCall): Effect<ToolResult, never> {
    return Effect.gen(function*() {
      const tool = this.tools.find(t => t.info().name === call.name);
      if (!tool) return { toolCallId: call.id, content: `Tool not found: ${call.name}`, isError: true };
      const res = yield* tool.run(call).pipe(
        Effect.catchAll(err => Effect.succeed({ type: "text", content: err.message, isError: true } as ToolResponse))
      );
      return { toolCallId: call.id, content: res.content, isError: res.isError };
    });
  }
}
```

**为什么这样设计**：
- `while(true)` + `finishReason` 判断，简单清晰
- 流式消费用 `Stream.fold` 累积状态，不阻塞
- 工具执行分只读并发/写入顺序（借鉴 Claude Code）
- 错误用 `Effect.catchAll` 兜底，不会让整个 loop 崩溃

**复用度**：100%。核心逻辑原样复用，用 Effect 重写。

---

### C.4 消息模型

**原理**：OpenCode 的消息不是单一文本，而是 `ContentPart[]` 的列表。每个 part 是 discriminated union 的一种类型。

**核心类型**：

```typescript
// message/types.ts
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; thinking: string }
  | { type: "image_url"; url: string; detail?: string }
  | { type: "binary"; mimeType: string; data: Uint8Array }
  | { type: "tool_call"; id: string; name: string; input: string; finished: boolean }
  | { type: "tool_result"; toolCallId: string; content: string; isError: boolean }
  | { type: "finish"; reason: FinishReason };

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool" | "system";
  parts: Array<ContentPart>;
  model?: string;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

// 便捷方法
export function getTextContent(msg: Message): string {
  const part = msg.parts.find(p => p.type === "text");
  return part ? (part as Extract<ContentPart, { type: "text" }>).text : "";
}

export function getToolCalls(msg: Message): Array<Extract<ContentPart, { type: "tool_call" }>> {
  return msg.parts.filter(
    p => p.type === "tool_call"
  ) as Array<Extract<ContentPart, { type: "tool_call" }>>;
}
```

**为什么这样设计**：
- discriminated union 编译期穷尽检查，不会漏处理类型
- 一个消息可以有多个 part（文本 + 推理 + 工具调用并存）
- 持久化时 parts 序列化为 JSON

**复用度**：100%。类型定义原样复用。

---

### C.5 会话管理

**原理**：Session 是轻量级对象，Service 层封装 DB 操作 + PubSub 事件。支持三种创建方式（普通/AI 标题/子任务）。

**核心类型**：

```typescript
// session/types.ts
export interface Session {
  id: string;
  parentSessionId?: string;     // 子会话的父会话 ID
  title: string;
  messageCount: number;
  promptTokens: number;
  completionTokens: number;
  summaryMessageId?: string;    // 上下文压缩的摘要消息 ID
  cost: number;
  createdAt: number;
  updatedAt: number;
}

// session/events.ts
export type SessionEvent =
  | { type: "created"; payload: Session }
  | { type: "updated"; payload: Session }
  | { type: "deleted"; payload: { id: string } }
  | { type: "summarized"; payload: { sessionId: string; summaryMessageId: string } };
```

**复用度**：100%。Session 结构原样复用，PaperFactory 在此基础上加 `branchId`、`projectId` 等科研字段。

---

### C.6 PubSub 事件总线

**原理**：OpenCode 用泛型 Broker 实现发布订阅。PaperFactory 直接用 Effect 内置的 `PubSub`。

```typescript
// 直接用 Effect PubSub，无需自研
import { PubSub } from "effect";

// 创建
const sessionPubSub = yield* PubSub.unbounded<SessionEvent>();

// 发布
yield* sessionPubSub.publish({ type: "created", payload: session });

// 订阅
yield* sessionPubSub.subscribe().pipe(
  Stream.forEach(event => Effect.logInfo(`Session event: ${event.type}`))
);
```

**复用度**：100%。设计模式复用，实现用 Effect 内置。

---

### C.7 MCP 工具包装

**原理**：MCP 工具被包装成 `mcpTool`，实现 `BaseTool` 接口。每次调用时创建 MCP client，执行后关闭。

**核心实现**：

```typescript
// tools/mcp-tool.ts
import { Effect } from "effect";

export class McpTool implements BaseTool {
  constructor(
    private serverName: string,
    private mcpToolDef: McpToolDefinition,
    private config: McpServerConfig
  ) {}

  info(): ToolInfo {
    return {
      name: `${this.serverName}_${this.mcpToolDef.name}`,
      description: this.mcpToolDef.description,
      parameters: this.mcpToolDef.inputSchema?.properties ?? {},
      required: this.mcpToolDef.inputSchema?.required ?? [],
    };
  }

  run(call: ToolCall): Effect<ToolResponse, ToolError> {
    return Effect.gen(function*() {
      // acquireUseRelease 自动管理 client 生命周期
      const client = yield* Effect.acquireRelease(
        Effect.promise(() => createMcpClient(this.config)),
        client => Effect.promise(() => client.close())
      );
      yield* Effect.promise(() => client.initialize());
      const result = yield* Effect.promise(() =>
        client.callTool(this.mcpToolDef.name, JSON.parse(call.input))
      );
      const content = result.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
      return { type: "text", content, isError: false };
    });
  }
}
```

**复用度**：90%。设计模式复用，MCP client 库换为 `@modelcontextprotocol/sdk`。

---

### C.8 上下文压缩

**原理**：独立 summarizer 对全部消息发摘要 prompt，生成 summary message，存 `session.summaryMessageId`。下次请求时从 summary message 之后截取历史。

```typescript
// agent/summarizer.ts
// 在 agent loop 开始前
if (session.summaryMessageId) {
  const summaryIdx = msgHistory.findIndex(m => m.id === session.summaryMessageId);
  if (summaryIdx >= 0) {
    msgHistory = msgHistory.slice(summaryIdx);
    msgHistory[0] = { ...msgHistory[0], role: "user" }; // summary 作为 user 消息注入
  }
}
```

**复用度**：100%。逻辑原样复用。

---

### C.9 不可复用的部分

| OpenCode 设计 | 不复用原因 |
|---|---|
| Go 语言实现 | PaperFactory 用 TS + Effect |
| SQLite 持久化 | PaperFactory 用 PostgreSQL（科研需要多用户/事务/并发） |
| Goose 迁移 + sqlc | PaperFactory 用 Drizzle + drizzle-kit |
| Bubbletea TUI | PaperFactory 用 Next.js Web UI |
| Cobra CLI 框架 | PaperFactory 用 Hono API |

---

### C.10 复用总结

```
可复用（设计模式，100%借鉴）：
  ├── Provider 接口（sendMessages + streamResponse）
  ├── BaseTool 接口（Info + Run）
  ├── Agent Loop（stream → tools → loop）
  ├── ContentPart discriminated union
  ├── Session 模型
  ├── MCP 工具包装模式
  ├── 上下文压缩逻辑
  └── PubSub 事件总线

不可复用（语言/生态差异）：
  ├── Go → TS 重写
  ├── SQLite → PostgreSQL
  ├── Goose/sqlc → Drizzle/drizzle-kit
  └── Bubbletea → Next.js

PaperFactory 自研（OpenCode 没有）：
  ├── Control Plane（状态机/Gate/Policy）
  ├── Cognition Plane（Context/Prompt/Mode）
  ├── ExecutionBlock
  ├── Research Object 模型
  ├── 科研分支管理
  └── Evidence/Claim 溯源
```
