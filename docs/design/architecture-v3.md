# PaperFactory 总体设计文档

> 版本: 3.2 | 日期: 2026-09-04 | 状态: Draft
> 核心定位：基于证据的假设验证系统（科研论文是首要应用场景）

---

## 目录

1. [要解决的问题](#1-要解决的问题)
2. [核心概念](#2-核心概念)
3. [架构总览](#3-架构总览)
4. [对象模型](#4-对象模型)
5. [动作定义](#5-动作定义)
6. [工具系统](#6-工具系统)
7. [可复用能力单元](#7-可复用能力单元)
8. [执行编排](#8-执行编排)
9. [子 Agent](#9-子-agent)
10. [工作流编排](#10-工作流编排)
11. [生命周期钩子](#11-生命周期钩子)
12. [状态管理与持久化](#12-状态管理与持久化)
13. [认知管线](#13-认知管线)
14. [验证循环](#14-验证循环)
15. [Agent 循环](#15-agent-循环)
16. [技术栈](#16-技术栈)
17. [测试策略](#17-测试策略)
18. [目录结构](#18-目录结构)
19. [开发路线图](#19-开发路线图)

---

## 1. 要解决的问题

### 1.1 核心能力

构建一个能独立完成**基于证据的假设验证全链路**的系统。核心能力抽象：

```
事实采集 → 模式识别 → 假设生成 → 验证设计 → 执行验证 → 结论形成 → 报告输出
```

人在关键环节做决策，但系统具备独立完成整条链路的能力。

不是线性流程，支持：

```
循环、回退、分支、暂停、纠正、并行探索路线
```

### 1.1.1 适用场景

系统的首要应用场景是**科研论文自动化**，但架构不绑定科研术语，以下场景同样适用：

| 场景 | 事实采集 | 假设 | 验证 | 报告 |
|------|---------|------|------|------|
| **科研** | 文献调研 / 实验数据 | "X 导致 Y" | 对照实验 / 统计检验 | 论文 |
| **医疗诊断** | 症状 / 检查指标 | "患者患有疾病 Z" | 检验 / 影像 / 病理 | 诊断报告 |
| **金融分析** | 市场数据 / 财报 | "策略 A 在行情 B 下盈利" | 回测 / 模拟 | 投资备忘录 |
| **故障排查** | 日志 / 监控指标 | "组件 C 的 bug 导致故障" | 复现实验 / 代码审查 | 事故报告 |
| **法律推理** | 证据 / 判例 | "行为构成罪名 D" | 证据链验证 / 反例搜索 | 法律文书 |

**共同特征**：需要基于已有事实提出假设、设计验证方案、执行验证、形成有证据支撑的结论。PaperFactory 的对象模型和动作定义围绕这些共性构建，科研是默认领域配置。

### 1.2 现有 Agent 为什么不行

以 Claude Code 为代表的对话驱动 Agent，在**基于证据的推理**场景有 6 个根本问题：

| 问题 | 原因 |
|------|------|
| **状态 = 对话历史** | 无结构化状态，compact 后 88% 信息丢失 |
| **不可重现** | LLM 非确定性 + Bash 盲区 + 子 Agent 黑箱 |
| **证据溯源断裂** | 无图结构维护"结论→论据→数据源"引用链 |
| **验证纪律不可执行** | CLAUDE.md 是建议不是约束，Hook 管行为不管推理 |
| **长期记忆有损** | 200 行硬截断，跨会话记忆有限 |
| **多阶段无连贯** | 阶段间文本摘要累积信息损失 |

**根因**：对话模型把推理问题简化为文本生成问题。PaperFactory 用**结构化状态 + 确定性治理**来解决。

### 1.3 三条不可违反的原则

> **LLM proposes; the system decides.**
> LLM 负责推理建议，Controller 负责最终决策。

> **Tools execute; the controller governs.**
> 工具负责执行，Controller 负责判定是否允许执行。

> **Evidence changes state; prose does not.**
> LLM 输出、工具输出都是 Proposal / Observation，只有经过 Gate 验证的 Evidence 才能改变系统状态。

---

## 2. 核心概念

### 2.1 统一运行模型

```
ResearchState_t
  → ResearchAction_t     控制面选择下一步动作
  → Context_t            认知面编译 Agent 应该看到什么
  → Execution_t          运行时执行（LLM + 工具）
  → Observation_t        能力层产出结构化观察结果
  → Evaluation_t         认知面验证输出质量
  → ResearchState_{t+1}  控制面提交状态变更
```

### 2.2 核心术语

| 术语 | 含义 |
|------|------|
| **Research State** | 结构化的推理状态（不是对话历史） |
| **Research Object** | 推理概念的正式建模（Hypothesis/Evidence/Claim 等） |
| **Research Action** | 对对象执行的合法操作 |
| **Gate** | 确定性检查，判断动作是否允许执行 |
| **Cognitive Mode** | Agent 的思考模式（EXPLORE/FALSIFY/VERIFY 等） |
| **Tool** | 原子操作（search/execute_python 等） |
| **Skill** | 给 LLM 看的指令（Markdown + frontmatter） |
| **ExecutionBlock** | 确定性步骤 + LLM 认知点 + 条件分支的组合 |
| **Subagent** | 独立上下文 + 独立工具集 + 独立模型的子任务 |
| **Workflow** | 代码脚本编排多个 Subagent |
| **Hook** | 生命周期事件回调 |

---

## 3. 架构总览

### 3.1 七层架构

```
┌──────────────────────────────────────────────────────────────────┐
│ L7  Application / UX          src/api/  src/app/                │
│     Web UI / CLI / API / WebSocket                               │
├──────────────────────────────────────────────────────────────────┤
│ L6  Research Control Plane    src/control/                       │
│     状态机 / 动作注册 / 门控 / 策略引擎 / 分支管理 / 审批         │
├──────────────────────────────────────────────────────────────────┤
│ L5  Cognitive Control Plane   src/cognition/                     │
│     上下文编译 / Prompt 组装 / 认知模式 / 输出验证 / 盲审策略     │
├──────────────────────────────────────────────────────────────────┤
│ L4  Agent Runtime             src/runtime/                       │
│     Agent 循环 / 工具执行 / 子 Agent / Skill / Hook / 沙箱       │
├──────────────────────────────────────────────────────────────────┤
│ L3  Capability Layer          src/capabilities/                  │
│     信息检索 / 代码 / 实验验证 / 报告生成 / 输出分发              │
│     科研领域: 文献 / 代码 / 实验 / 写作 / 投稿                    │
├──────────────────────────────────────────────────────────────────┤
│ L2  Data / Audit Plane        src/persistence/                   │
│     PostgreSQL / 事件溯源 / 向量存储 / 产物存储                   │
├──────────────────────────────────────────────────────────────────┤
│ L1  Platform Infrastructure   science-service/                   │
│     Python 微服务（scipy/numpy/GROBID/LaTeX/沙箱/领域工具）       │
├──────────────────────────────────────────────────────────────────┤
│ M0  Domain Contracts          src/domain/                        │
│     类型定义 / 枚举 / 事件（最内核层，无外部依赖）                 │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 为什么七层？

通用 Agent 框架（LangGraph/CrewAI）是扁平结构，节点内部黑盒。**基于证据的推理**需要**严格的职责分离**：

| 层 | 回答的问题 | 如果去掉这层会怎样 |
|----|-----------|-------------------|
| L6 Control | "谁决定状态变更？" | 没有唯一权威，状态不一致 |
| L5 Cognition | "Agent 看到什么？怎么思考？" | Prompt 散落在各处，违反"Prompt 不是架构" |
| L4 Runtime | "怎么执行？怎么恢复？" | 没有重试/沙箱/子 Agent 隔离 |
| L3 Capability | "能做什么科研操作？" | 业务逻辑耦合到 Runtime |
| L2 Persistence | "怎么存？怎么追溯？" | 无法审计/回滚 |
| L1 Infra | "怎么跑？怎么隔离？" | 没有沙箱/网络隔离 |
| M0 Domain | "科研概念是什么？" | 类型不安全，dict[str, Any] 满天飞 |

### 3.3 通信模型

```
TypeScript 主服务
    ├── 直接调用 → LLM SDK（@anthropic-ai/sdk, openai）
    ├── 直接调用 → PostgreSQL（@effect/sql-pg）
    ├── 直接调用 → MCP 工具服务器
    ├── HTTP REST → Python 微服务（scipy / GROBID / LaTeX / 沙箱）
    └── 直接调用 → 文件系统 / 子进程
```

---

## 4. 对象模型

### 4.0 领域配置机制

对象模型是通用的，但每个场景有自己的领域配置。领域配置定义了：
- 对象的 `sourceType` 枚举值（科研: paper/experiment; 医疗: examination/imaging）
- 验证 `Gate` 的规则集（科研: 统计显著性; 医疗: 诊断标准）
- `Skill` 的指令集（科研: 文献综述方法; 医疗: 鉴别诊断流程）
- `Tool` 的工具集（科研: search_scholarly; 医疗: query_ehr）

系统默认加载**科研领域配置**，其他领域通过配置文件扩展。

### 4.1 设计原则

- 每个对象用 `@effect/schema` 定义，编译期 + 运行时双重验证
- 所有字段 `readonly`（不可变）
- 对象之间通过 ID 引用，不直接嵌套
- 状态变更通过创建新版本实现，不原地修改

### 4.2 为什么用 @effect/schema 而不是 zod？

**核心差异**：Schema 的三种类型参数 `Schema<Type, Encoded, Requirements>`。

| 能力 | zod | @effect/schema |
|------|-----|----------------|
| 输入/输出类型分离 | ❌ | ✅ `Schema<A, I, R>` |
| 错误在类型中 | ❌ throw | ✅ `Effect<never, ParseError, A>` |
| 双向转换 | ❌ 只有 parse | ✅ decode + encode |
| Schema 需要依赖 | ❌ | ✅ Requirements 参数 |
| JSON Schema 生成 | 第三方库 | 内置 |
| 测试数据生成 | 第三方库 | 内置 |
| 相等比较 | 手动 | 内置 |
| Effect 生态集成 | 不兼容 | 原生集成 |

一个 Schema 定义，同时提供：编译期类型、运行时验证、JSON Schema（给 LLM）、测试数据生成、快照比较、日志输出、API 双向转换。用 zod 需要 3-4 个第三方库才能勉强实现。

### 4.3 对象定义

#### ResearchQuestion（研究问题）

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
  questionId:     Schema.UUID,
  projectId:      Schema.UUID,
  branchId:       Schema.UUID,
  title:          Schema.NonEmptyString,
  statement:      Schema.NonEmptyString,    // 正式问题陈述
  domain:         Schema.NonEmptyString,    // 研究领域标签
  status:         QuestionStatus,
  relatedKnowledgeIds: Schema.Array(Schema.UUID).pipe(
    Schema.default([])
  ),
  parentQuestionId: Schema.NullOr(Schema.UUID).pipe(
    Schema.default(null)
  ),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }).pipe(
    Schema.default({})
  ),
  createdAt:  Schema.Date.pipe(Schema.default(new Date())),
  updatedAt:  Schema.Date.pipe(Schema.default(new Date())),
});

export type ResearchQuestion = Schema.Schema.Type<typeof ResearchQuestion>;
```

| 字段 | 含义 | 为什么需要 |
|------|------|-----------|
| `questionId` | 唯一标识 | 引用 |
| `projectId` | 所属项目 | 多项目管理 |
| `branchId` | 所属研究分支 | 并行探索不同方向 |
| `title` | 标题 | 展示 |
| `statement` | 正式陈述 | 问题的精确描述 |
| `domain` | 领域标签 | 分类/检索 |
| `status` | 状态 | 状态机控制 |
| `relatedKnowledgeIds` | 关联知识项 | 证据溯源 |
| `parentQuestionId` | 父问题 | 问题分解 |

**状态机**: `DRAFT → ACTIVE → SCOPED → ARCHIVED`
**不变量**: ACTIVE/SCOPED 必须至少关联一个 KnowledgeItem

#### KnowledgeItem（知识项）

从任何来源提取的结构化知识单元。`sourceType` 通过领域配置扩展。

```typescript
export const KnowledgeItem = Schema.Struct({
  knowledgeId:   Schema.UUID,
  projectId:     Schema.UUID,
  branchId:      Schema.UUID,
  summary:       Schema.NonEmptyString,     // 知识摘要
  sourceType:    Schema.String,             // 领域配置定义合法值
  sourceIds:     Schema.Array(Schema.UUID).pipe(Schema.default([])),
  status:        Schema.Enums({ DRAFT: "DRAFT", ASSESSED: "ASSESSED", VALIDATED: "VALIDATED", SUPERSEDED: "SUPERSEDED" } as const),
  certaintyLevel: Schema.Number.pipe(Schema.between(0, 1), Schema.default(0.5)),
  questionIds:   Schema.Array(Schema.UUID).pipe(Schema.default([])),
  tags:          Schema.Array(Schema.String).pipe(Schema.default([])),
  metadata:      Schema.Record({ key: Schema.String, value: Schema.Unknown }).pipe(Schema.default({})),
  createdAt:     Schema.Date.pipe(Schema.default(new Date())),
});
```

**状态机**: `DRAFT → ASSESSED → VALIDATED` 或 `DRAFT → SUPERSEDED`

**领域配置示例**：
| 领域 | sourceType 值 |
|------|--------------|
| 科研 | paper, experiment, review, preprint |
| 医疗 | lab_test, imaging, pathology, clinical_note |
| 金融 | report, filing, market_data, news |

#### ResearchGap（研究空白）

```
状态机: IDENTIFIED → VALIDATED → ADDRESSED → CLOSED
关系: N:1 → ResearchQuestion, 1:N → Hypothesis
```

#### Hypothesis（假设）

**关键**：必须包含可证伪条件（falsificationCondition），否则不能作为正式假设。

```
状态机: PROPOSED → ASSESSED → ACTIVE → CONFIRMED / REJECTED
关系: N:1 → ResearchGap, 1:N → Experiment
```

#### Protocol（实验协议）

**关键**：FROZEN 后不可修改（科研纪律：防止 p-hacking）。

```
状态机: DRAFT → REVIEWED → FROZEN → SUPERSEDED
不变量: FROZEN 后任何字段不可变
```

#### Experiment（实验）

```
状态机: PLANNED → RUNNING → COMPLETED / FAILED / CANCELLED
关系: N:1 → Protocol, 1:N → Result
```

#### Result（实验结果）

原始观测数据，不可变。

```
状态机: RAW → VALIDATED / INVALIDATED
```

#### Evidence（证据）

经过有效性验证后可用于支持或反驳命题的对象。

```
状态机: PROPOSED → VALIDATED / INVALIDATED
关系: N:1 → Result, 1:N → Claim
```

#### Claim（主张）

根据 Evidence 形成的科研主张。

```
不变量: Claim 的范围 ⊆ 支持它的 Evidence 的范围
        不能用局部证据支持过宽结论
```

#### ResearchFailure（研究失败）

失败不是垃圾数据，必须保存。

```
字段: failedHypothesisId / failureType / rootCause / evidence / reusableLesson / retryCondition
```

### 4.4 对象关系图

```
ResearchQuestion
  ├── 1:N → ResearchGap
  └── 1:N → KnowledgeItem

ResearchGap
  └── 1:N → Hypothesis

Hypothesis
  └── 1:N → Experiment → 1:N → Result

Result
  └── 1:N → Evidence

Evidence
  └── 1:N → Claim

Hypothesis (REJECTED)
  └── → ResearchFailure
```

---

## 5. 动作定义

### 5.0 领域动作扩展

动作分为**核心动作**（通用）和**领域动作**（可扩展）。核心动作覆盖"事实采集→假设→验证→结论"的完整链路。领域动作通过注册表动态加载，例如医疗领域可增加 `RUN_LAB_TEST`、`QUERY_DIAGNOSTIC_CRITERIA`。

### 5.1 设计原则

- 每个 Action 声明：目标对象类型、允许源状态、目标状态、所需 Gate、副作用级别、是否需要审批、认知模式
- Action 是**系统决定**的（确定性 Policy Engine），不是 LLM 自由选择的
- 非法 Action（如对象已在目标状态）在系统层拦截，不到 LLM

### 5.2 动作类型

#### 事实采集阶段（科研: 文献调研）

| 动作 | 目标对象 | 源状态 | 目标状态 | 认知模式 |
|------|---------|--------|---------|---------|
| `SEARCH_KNOWLEDGE` | KnowledgeItem | DRAFT | ASSESSED | EXPLORE |
| `RETRIEVE_DOCUMENT` | KnowledgeItem | DRAFT | ASSESSED | FRAME |
| `PARSE_DOCUMENT` | KnowledgeItem | ASSESSED | VALIDATED | FRAME |
| `READ_DOCUMENT` | KnowledgeItem | ASSESSED | VALIDATED | VERIFY |
| `ANALYZE_RELATIONS` | KnowledgeItem | VALIDATED | VALIDATED | MAP |
| `SYNTHESIZE` | ResearchQuestion | ACTIVE | SCOPED | SYNTHESIZE |

#### 假设生成阶段

| 动作 | 目标对象 | 源状态 | 目标状态 | 认知模式 |
|------|---------|--------|---------|---------|
| `IDENTIFY_GAP` | ResearchQuestion | SCOPED | SCOPED | DISCRIMINATE |
| `VALIDATE_GAP` | ResearchGap | IDENTIFIED | VALIDATED | FALSIFY |
| `PROPOSE_HYPOTHESIS` | Hypothesis | PROPOSED | ASSESSED | FRAME |
| `ASSESS_HYPOTHESIS` | Hypothesis | ASSESSED | ACTIVE | VERIFY |
| `ANALYZE_COMPETING` | Hypothesis | ACTIVE | ACTIVE | DISCRIMINATE |

#### 验证设计阶段

| 动作 | 目标对象 | 源状态 | 目标状态 | 认知模式 |
|------|---------|--------|---------|---------|
| `DESIGN_STUDY` | Experiment | PLANNED | PLANNED | FRAME |
| `CREATE_PROTOCOL` | Protocol | DRAFT | REVIEWED | FRAME |
| `FREEZE_PROTOCOL` | Protocol | REVIEWED | FROZEN | FRAME |
| `REVIEW_PROTOCOL` | Protocol | DRAFT | REVIEWED | VERIFY |

#### 验证执行阶段

| 动作 | 目标对象 | 源状态 | 目标状态 | 认知模式 |
|------|---------|--------|---------|---------|
| `GENERATE_CODE` | Experiment | PLANNED | RUNNING | FRAME |
| `EXECUTE_CODE` | Experiment | RUNNING | RUNNING | VERIFY |
| `RUN_EXPERIMENT` | Experiment | RUNNING | COMPLETED | VERIFY |
| `COLLECT_RESULT` | Result | RAW | VALIDATED | VERIFY |
| `ANALYZE_STATISTICS` | Result | VALIDATED | VALIDATED | VERIFY |
| `DIAGNOSE_RESULT` | Result | INVALIDATED | INVALIDATED | DIAGNOSE |

#### 报告生成阶段（科研: 论文写作）

| 动作 | 目标对象 | 源状态 | 目标状态 | 认知模式 |
|------|---------|--------|---------|---------|
| `CREATE_OUTLINE` | Report | DRAFT | OUTLINED | FRAME |
| `DRAFT_SECTION` | Report | OUTLINED | DRAFTED | SYNTHESIZE |
| `SELF_REVIEW` | Report | DRAFTED | REVIEWED | FALSIFY |
| `REVISE_REPORT` | Report | REVIEWED | DRAFTED | DIAGNOSE |

#### 输出分发阶段（科研: 投稿）

| 动作 | 目标对象 | 源状态 | 目标状态 | 认知模式 |
|------|---------|--------|---------|---------|
| `MATCH_VENUE` | Submission | READY | MATCHED | COMPARE |
| `ASSESS_FIT` | Submission | MATCHED | FITTED | DECIDE |
| `PREPARE_REBUTTAL` | Submission | UNDER_REVIEW | REBUTTAL_READY | FALSIFY |

---

## 6. 工具系统

### 6.1 设计原则

- 工具是**原子操作**，不直接修改科研状态
- 工具返回结构化结果，不是自由文本
- 只读工具并发执行，有副作用工具顺序执行
- 支持 MCP 协议接入外部工具

### 6.2 工具接口

```typescript
// 工具的元信息（给 LLM 做 function calling）
export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, any>;   // JSON Schema
  required: string[];
}

// LLM 发出的工具调用请求
export interface ToolCall {
  id: string;
  name: string;
  input: string;    // JSON 字符串参数
}

// 工具执行结果
export interface ToolResponse {
  type: "text" | "image";
  content: string;
  metadata?: string;
  isError: boolean;
}

// 工具接口
export interface BaseTool {
  info(): ToolInfo;                                        // 工具描述
  run(call: ToolCall): Effect<ToolResponse, ToolError>;   // 工具执行
}
```

### 6.3 只读并发 / 写入顺序

```typescript
// 只读工具：并发执行
const readResults = yield* Effect.all(
  readTools.map(tc => executeSingle(tc)),
  { concurrency: "unbounded" }    // 完全并发
);

// 写入工具：顺序执行
const writeResults = yield* Effect.all(
  writeTools.map(tc => executeSingle(tc)),
  { concurrency: 1 }              // 避免竞态
);
```

### 6.4 工具分类

| 类别 | 工具 | 副作用 | 沙箱 |
|------|------|--------|------|
| 信息获取 | search_scholarly, get_paper_meta, get_paper_pdf, parse_pdf, web_search | READ | 否 |
| 文件系统 | read_file, write_file, list_directory, search_files, diff_files | INTERNAL_WRITE | 是 |
| 代码执行 | execute_python, execute_bash, install_package, run_notebook | COMPUTE | 是 |
| LaTeX | write_latex, compile_latex, check_latex | INTERNAL_WRITE | 是 |
| 数据处理 | read_csv, query_data, plot_data, stat_test, fit_model | COMPUTE | 是 |
| 网络 | fetch_url, git_operations | EXTERNAL_WRITE | 是 |

### 6.5 MCP 协议集成

支持 stdio/SSE/HTTP 三种传输。社区已有 500+ MCP Server，开箱即用。

---

## 7. 可复用能力单元

### 7.1 Skill（技能）

**定义**：给 LLM 看的指令（不是代码）。

为什么用 Markdown 而不是代码：
- LLM 理解自然语言，代码格式浪费 token
- 文件变更自动热加载，不用重启
- 支持动态上下文注入（`!`git diff`` 运行时替换）
- 作用域：项目级 / 个人级 / 全局级

```yaml
# .paperfactory/skills/lit-review/SKILL.md
---
name: lit-review
description: 系统性文献综述
context: fork
allowed-tools: search_scholarly get_paper_pdf parse_pdf
cognitive-mode: EXPLORE
max-iterations: 20
---

## 步骤
1. 根据 ResearchQuestion 确定搜索关键词
2. 搜索相关文献
3. 获取论文元数据
4. 解析 PDF
5. 提取知识单元
6. 综合文献发现
7. 生成综述报告

## 动态上下文
!`git diff HEAD`
```

### 7.2 Capability（业务能力）

**定义**：一组 Skill 的编排，代表一个完整的业务能力。

```
Literature Capability = compose(
  Skill("search_and_summarize"),
  Skill("read_and_extract"),
  Skill("synthesize"),
)

Writing Capability = compose(
  Skill("search_and_summarize"),    // 复用！写论文也需要查文献
  Skill("draft_section"),
  Skill("compile_latex_and_fix"),
)
```

---

## 8. 执行编排

### 8.1 ExecutionBlock（执行块）

**定义**：确定性步骤 + LLM 认知点 + 条件分支的组合。

为什么需要 ExecutionBlock 而不是让 LLM 编排：LLM 维护循环不可靠——会遗忘步骤、会无限循环、会跳过关键验证。代码编排是确定性的、可审计的、中间结果不进 LLM 上下文（省 token）。

```typescript
// 步骤类型
export const BlockStepType = Schema.Enums({
  TOOL_CALL:      "TOOL_CALL",      // 确定性工具调用
  COGNITIVE_CALL: "COGNITIVE_CALL", // LLM 认知任务
  CONDITION:      "CONDITION",      // 条件分支
  TRANSFORM:      "TRANSFORM",      // 数据转换
  AGGREGATE:      "AGGREGATE",      // 结果聚合
  VALIDATE:       "VALIDATE",       // 验证步骤
} as const);

// 执行块定义
export const ExecutionBlock = Schema.Struct({
  blockId:           Schema.NonEmptyString,
  name:              Schema.NonEmptyString,
  description:       Schema.String,
  steps:             Schema.Array(BlockStep),
  entryStep:         Schema.NonEmptyString,
  successConditions: Schema.Array(Schema.String),
  failureHandler:    Schema.NullOr(Schema.String).pipe(Schema.default(null)),
  maxIterations:     Schema.Number.pipe(Schema.int(), Schema.atLeast(1), Schema.default(1)),
});
```

### 8.2 验证-修复循环

借鉴 Aider 的 lint-修复循环：执行 → 验证 → 失败则反馈错误给 LLM → LLM 修复 → 再验证，直到通过或达到最大迭代次数。

```typescript
// 示例：Hypothesis 必须包含可证伪条件
ExecutionBlock("assess_hypothesis"):
  Step 1: [COGNITIVE]  LLM 评估假设 (mode=VERIFY)
  Step 2: [VALIDATE]   检查 falsificationCondition 是否存在
  Step 3: [CONDITION]  验证通过?
                 yes → 输出 Hypothesis
                 no  → 错误反馈给 LLM → 回到 Step 1
  maxIterations: 3
```

---

## 9. 子 Agent

### 9.1 设计原则

- 独立上下文窗口（不继承父对话历史）
- 独立工具集
- 独立模型选择（可用更便宜的模型）
- 工作空间隔离（worktree / sandbox）
- 只返回摘要，不暴露完整推理过程

### 9.2 为什么要独立上下文？

| 场景 | 共享上下文 | 独立上下文 |
|------|----------|-----------|
| 文献调研 | 主上下文被 50 篇论文填满 | 子 Agent 独立窗口，只返回摘要 |
| 并行实验 | 3 个实验互相干扰 | 3 个独立工作目录 |
| Token 消耗 | 每次调用带完整历史 | 只带必要信息 |
| 模型选择 | 只能用主模型 | 可用 Haiku 等便宜模型 |

### 9.3 内置子 Agent

| 子 Agent | 工具集 | 用途 |
|----------|--------|------|
| lit-reviewer | 只读工具 | 文献探索 |
| coder | 代码工具 | 代码生成和执行 |
| analyst | 统计工具 | 统计分析和诊断 |
| writer | 写作工具 | 论文写作 |
| reviewer | 只读 + LaTeX | 审稿视角验证 |

---

## 10. 工作流编排

### 10.1 设计原则

- 编排逻辑是**代码**，不是 LLM 在上下文中维护
- 中间结果在脚本变量中，不进 LLM 上下文
- 每个 phase 后可暂停征求用户意见（人在环中）
- 支持循环 / 分支 / 并行

### 10.2 示例

```typescript
import { Effect } from "effect";

export class PaperGenerationWorkflow {
  run(ctx: WorkflowContext) {
    return Effect.gen(function*() {
      // Phase 1: 文献调研
      const litReview = yield* phase("literature-review", () =>
        this.literaturePhase(ctx)
      );
      // ↑ 暂停 → 用户确认调研方向

      // Phase 2: Gap 识别
      const gaps = yield* phase("gap-identification", () =>
        this.gapPhase(ctx, litReview)
      );
      // ↑ 暂停 → 用户选择探索哪些假设

      // Phase 3: 并行假设探索
      const hypothesisResults = yield* Effect.all(
        gaps.map(gap => () => this.exploreHypothesis(ctx, gap)),
        { concurrency: 4 }
      );
      // ↑ 暂停 → 用户审批 Protocol

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

---

## 11. 生命周期钩子

### 11.1 设计原则

- 可配置，不写死在代码里
- 匹配链：事件 → matcher → condition → handler
- Handler 类型：command / http / mcp / prompt / agent

### 11.2 事件类型

```typescript
export const HookEventType = Schema.Enums({
  PRE_EXECUTE:     "PRE_EXECUTE",     // Block 执行前
  POST_EXECUTE:    "POST_EXECUTE",    // Block 执行后
  PRE_TOOL_USE:    "PRE_TOOL_USE",    // 工具调用前
  POST_TOOL_USE:   "POST_TOOL_USE",   // 工具调用后
  PRE_COGNITIVE:   "PRE_COGNITIVE",   // 认知调用前
  POST_COGNITIVE:  "POST_COGNITIVE",  // 认知调用后
  PRE_VALIDATION:  "PRE_VALIDATION",  // 验证前
  POST_VALIDATION: "POST_VALIDATION", // 验证后
} as const);
```

### 11.3 示例

```typescript
// 实验前检查 Protocol 是否冻结
{
  eventType: "PRE_TOOL_USE",
  matcher: "execute_python",
  condition: "status == 'CONFIRMATORY' && !protocol.frozen",
  handler: { type: "command", config: { /* 阻断 */ } }
}

// 代码执行后自动 lint
{
  eventType: "POST_TOOL_USE",
  matcher: "execute_python",
  handler: { type: "command", config: { command: "ruff check generated_code/" } }
}

// 论文章节写完后自动编译 LaTeX
{
  eventType: "POST_TOOL_USE",
  matcher: "write_latex",
  handler: { type: "command", config: { command: "pdflatex paper.tex" } }
}
```

---

## 12. 状态管理与持久化

### 12.1 为什么状态必须不可变？

科研需要版本化和事件溯源。不可变状态带来三个能力：

1. **Time-travel**：精确回答 "Day 3 的研究状态是什么"
2. **Diff**：精确回答 "从 Day 3 到 Day 5 改了什么"
3. **Replay**：从初始状态 + 事件日志重建任意时刻

对比 Claude Code：compact 后 88% 信息丢失，无法追溯决策依据。

### 12.2 为什么用 @effect/sql-pg？

| 维度 | Drizzle (async/await) | @effect/sql-pg |
|------|----------------------|----------------|
| 错误处理 | try/catch | `Effect<E, A>` 类型安全 |
| 依赖注入 | 构造函数传连接 | `Effect.Service` 自动注入 |
| 事务 | 手动管理 | `Effect.scoped` 自动管理 |
| 测试 | mock 困难 | `TestServices` 注入 mock |

### 12.3 消息模型

消息由多个 ContentPart 组成（discriminated union）：

```typescript
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; thinking: string }
  | { type: "image_url"; url: string }
  | { type: "tool_call"; id: string; name: string; input: string; finished: boolean }
  | { type: "tool_result"; toolCallId: string; content: string; isError: boolean }
  | { type: "finish"; reason: FinishReason };
```

### 12.4 上下文压缩

独立 summarizer 对全部消息发摘要 prompt，生成 summary message，存 `session.summaryMessageId`。下次请求从 summary 之后截取历史。

---

## 13. 认知管线

### 13.1 管线流程

```
ContextCompiler.compile
  → PromptAssembler.assemble
  → ProviderProjector.project
  → OutputValidator.validate
```

### 13.2 10 种认知模式

| 模式 | 用途 | 场景 |
|------|------|------|
| FRAME | 框架定义 | 设计研究问题/Protocol |
| EXPLORE | 探索发现 | 文献调研 |
| MAP | 映射关系 | 引用网络分析 |
| COMPARE | 对比分析 | 方法对比/venue 匹配 |
| FALSIFY | 证伪检验 | Gap 验证/Self Review |
| DIAGNOSE | 诊断问题 | 实验失败分析 |
| DISCRIMINATE | 区分解释 | 竞争假设分析 |
| VERIFY | 验证确认 | 结果验证 |
| SYNTHESIZE | 综合归纳 | 文献综述/论文写作 |
| DECIDE | 决策判断 | 投稿决策 |

### 13.3 盲审策略

程序级信息隐藏（不是 Prompt 级）：

```
HIDE_FUTURE_RESULT     隐藏未来结果
HIDE_TEST_SET          隐藏测试集
HIDE_CONFIRMATORY_RESULT  隐藏确认性结果
HIDE_REVIEW_OUTCOME    隐藏审稿结果
```

---

## 14. 验证循环

### 14.1 四种循环

#### Discovery Loop（发现循环）

```
观察现象 → 提出解释 → 搜索反例 → 发现新现象 → 修正解释
```

用于事实采集和假设生成阶段。

#### Confirmation Loop（确认循环）

```
假设 → 冻结验证方案 → 执行验证 → 分析结果 → 确认/否定假设
```

Protocol 必须 FROZEN，不得 post-hoc 修改。这是防止 p-hacking / 过拟合 / 确认偏误的关键机制。

#### Engineering Loop（工程循环）

```
设计 → 实现 → 验证 → 调优 → 再验证
```

用于代码生成和验证执行。

#### Correction Loop（纠正循环）

```
发现问题 → 分析根因 → 修正 → 重新发现
```

用于验证失败后的回退和修正。

### 14.2 回退机制

```
事实采集 → 假设生成 → 验证执行 → 失败
                                       → ResearchFailure(SCIENTIFIC)
                                       → 回退到假设 → 调整假设 → 新验证
                                       → 回退到采集 → 补充事实
```

通过分支机制实现：创建新 Branch，fork 自失败前的状态快照。

---

## 15. Agent 循环

### 15.1 流程

```
while (true) {
  1. 流式消费 Provider 事件 → 收集 content 和 tool calls
  2. 执行工具调用（只读并发 + 写入顺序）
  3. 创建 assistant message + tool results message
  4. 如果 finishReason == "tool_use" → 追加到历史，继续循环
  5. 否则 → 返回最终消息
}
```

### 15.2 Provider 接口

```typescript
export interface Provider {
  sendMessages(messages: Message[], tools: BaseTool[]): Effect<ProviderResponse, ProviderError>;
  streamResponse(messages: Message[], tools: BaseTool[]): Stream<ProviderEvent, ProviderError>;
  model(): Model;
}

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
```

Provider 抽象借鉴 OpenCode 的设计（统一接口 + 流式事件），实现用 Effect 重写。

---

## 16. 技术栈

### 16.1 TypeScript 主服务

```
TypeScript 5.x + Node.js 22+

核心:     @effect/effect, @effect/schema, @effect/platform
数据库:   @effect/sql-pg, drizzle-kit
测试:     vitest, eslint
构建:     tsup, pnpm
前端:     Next.js
可观测:   @opentelemetry/api
```

### 16.2 Python 微服务

```
paperfactory-science/
  scipy          统计检验
  numpy/pandas   数据处理
  GROBID         PDF 解析
  subprocess     LaTeX 编译 / 沙箱

通信: HTTP REST
```

为什么科学计算保留 Python：TS 生态在科学计算领域几乎为零（scipy/numpy/GROBID 无等效库）。

---

## 17. 目录结构

```
paperfactory/
├── package.json / tsconfig.json / tsup.config.ts / vitest.config.ts / eslint.config.ts
├── .paperfactory/skills/          # 项目级 Skills（SKILL.md 文件）
├── src/
│   ├── domain/                    # M0: 类型定义 / 枚举 / 事件
│   │   ├── ids.ts / enums.ts / events.ts / snapshot.ts
│   │   └── objects/               # Research Object Schema 定义
│   │       ├── question.ts / knowledge.ts / gap.ts / hypothesis.ts
│   │       ├── protocol.ts / experiment.ts / result.ts / evidence.ts
│   │       ├── claim.ts / failure.ts / manuscript.ts / submission.ts
│   ├── control/                   # L6: 控制面
│   │   ├── controller.ts / engine.ts / gates.ts / policy.ts
│   │   ├── actions.ts / registry.ts / candidates.ts / loop.ts
│   │   ├── branches.ts / merges.ts / tasks.ts / approvals.ts
│   ├── cognition/                 # L5: 认知面
│   │   ├── modes.ts / context.ts / compiler.ts / prompt.ts
│   │   ├── provider.ts / output.ts / retrieval.ts / policies.ts
│   ├── runtime/                   # L4: 运行时
│   │   ├── agent/                 # Agent 循环
│   │   │   ├── loop.ts / summarizer.ts
│   │   ├── tools/                 # 工具系统
│   │   │   ├── registry.ts / contracts.ts / executor.ts
│   │   │   ├── mcp/               # MCP 集成
│   │   │   └── builtins/          # 内置工具
│   │   │       ├── scholarly.ts / filesystem.ts / code.ts
│   │   │       ├── latex.ts / data.ts / network.ts
│   │   ├── skills/                # Skill 系统
│   │   ├── subagent/              # 子 Agent
│   │   ├── hooks/                 # Hook 系统
│   │   ├── blocks/                # ExecutionBlock
│   │   ├── workflows/             # Workflow 编排
│   │   └── sandbox/               # 沙箱（调用 Python 微服务）
│   ├── capabilities/              # L3: 业务能力
│   │   ├── research/              # 科研领域默认配置
│   │   │   ├── literature/ / code/ / experiment/ / writing/ / submission/
│   │   ├── generic/               # 通用能力基类
│   ├── persistence/               # L2: 持久化
│   │   ├── postgres/ / vector/ / event-store.ts / object-store.ts
│   ├── api/                       # L7: API 服务
│   │   ├── server.ts / routes/ / ws/
│   ├── app/                       # L7: 应用入口
│   │   ├── orchestration/ / cli.ts
│   ├── observability/             # 可观测性
│   └── evals/                     # 评估
├── science-service/               # L1: Python 微服务
│   ├── pyproject.toml / main.py
│   └── modules/
│       ├── statistics.py / pdf-parsing.py / latex.py / sandbox.py
├── workflows/                     # Workflow 脚本
├── domain-configs/                # 领域配置
│   ├── research.yaml              # 科研（默认）
│   ├── medical.yaml               # 医疗（示例）
│   └── finance.yaml               # 金融（示例）
├── test/                          # vitest 测试
│   ├── unit/                      # 单元测试（Domain/Control 层）
│   ├── integration/               # 集成测试（Persistence/API）
│   ├── e2e/                       # 端到端测试（完整验证循环）
│   ├── fixtures/                  # 测试数据
│   └── mocks/                     # Provider/Tool 模拟
└── docs/
    ├── adr/ / architecture/
    └── design/architecture-v3.md  # 本文档
```

---

## 17. 测试策略

一个要求"严谨验证"的系统，自身必须有完善的测试体系。测试不仅是质量保障，也是设计的验证——如果某个组件难以测试，说明设计有问题。

### 17.1 测试分层

```
              慢 ←─────────────────→ 快
              少 ←─────────────────→ 多

         ┌──────────────────────────────────────┐
         │  E2E 测试                              │
         │  完整验证循环: 假设→验证→结论            │
         │  ~5% 覆盖率                            │
         ├──────────────────────────────────────┤
         │  集成测试                              │
         │  Persistence + API + Workflow          │
         │  ~25% 覆盖率                           │
         ├──────────────────────────────────────┤
         │  控制面测试                             │
         │  Gate / Policy / State Machine          │
         │  ~30% 覆盖率                           │
         ├──────────────────────────────────────┤
         │  单元测试                               │
         │  Domain Schema / Tool / Cognition       │
         │  ~40% 覆盖率                            │
         └──────────────────────────────────────┘
```

### 17.2 Domain 层测试

Domain 层是无依赖的纯 Schema 定义，测试重点是**不变量**和**状态机转换**。

```typescript
import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";

describe("Hypothesis 不变量", () => {
  it("必须有可证伪条件", () => {
    const result = Schema.decodeUnknownSync(Hypothesis)({
      hypothesisId: "001",
      statement: "X 导致 Y",
      falsificationCondition: "",  // 空字符串 → 应拒绝
    });
    expect(result).toThrow();
  });

  it("可证伪条件非空时通过", () => {
    const result = Schema.decodeUnknownSync(Hypothesis)({
      hypothesisId: "001",
      statement: "X 导致 Y",
      falsificationCondition: "如果 Z 条件下 Y 不发生，则假设被否定",
    });
    expect(result.hypothesisId).toBe("001");
  });
});
```

### 17.3 控制面测试

Control 层是确定性逻辑，测试覆盖所有状态转换的合法/非法路径。

```typescript
describe("状态机转换", () => {
  it("Protocol FROZEN 后不可修改", () => {
    const protocol = createProtocol({ status: "FROZEN" });
    const result = transitionEngine.apply(protocol, "MODIFY_PROTOCOL");
    expect(result).toBeLeft(new GateError("FROZEN protocol cannot be modified"));
  });

  it("Experiment 只能在 RUNNING 时执行代码", () => {
    const experiment = createExperiment({ status: "PLANNED" });
    const result = transitionEngine.apply(experiment, "EXECUTE_CODE");
    expect(result).toBeLeft(new GateError("Experiment not RUNNING"));
  });

  it("Result 只能从 RAW 转到 VALIDATED 或 INVALIDATED", () => {
    const result = createResult({ status: "RAW" });
    expect(transitionEngine.apply(result, "COLLECT_RESULT")).toBeRight();
    expect(transitionEngine.apply(result, "DIAGNOSE_RESULT")).toBeLeft();
  });
});
```

### 17.4 工具测试

每个 Tool 用 mock 输入验证输出格式和错误处理。

```typescript
describe("execute_python Tool", () => {
  it("正常执行返回结构化结果", async () => {
    const tool = new ExecutePythonTool();
    const response = await tool.run({
      id: "call-1",
      name: "execute_python",
      input: JSON.stringify({ code: "print(2+2)" }),
    });
    expect(response.content).toContain("4");
    expect(response.isError).toBe(false);
  });

  it("超时返回明确的错误", async () => {
    const tool = new ExecutePythonTool({ timeout: 1000 });
    const response = await tool.run({
      id: "call-2",
      name: "execute_python",
      input: JSON.stringify({ code: "while True: pass" }),
    });
    expect(response.isError).toBe(true);
    expect(response.content).toContain("timeout");
  });

  it("无限递归被沙箱阻止", async () => {
    // 验证沙箱隔离
  });
});
```

### 17.5 ExecutionBlock 测试

验证-修复循环的完整性。

```typescript
describe("验证-修复循环", () => {
  it("第一次通过验证", async () => {
    const block = createAssessHypothesisBlock();
    const mockLLM = createMockLLM({
      responses: [validHypothesisWithFalsification()],
    });
    const result = await BlockExecutor.execute(block, { llm: mockLLM });
    expect(result.status).toBe("success");
    expect(mockLLM.callCount).toBe(1);  // 只调用了一次
  });

  it("失败后重试直到通过", async () => {
    const block = createAssessHypothesisBlock();
    const mockLLM = createMockLLM({
      responses: [
        invalidHypothesisNoFalsification(),  // 第1次: 缺少可证伪条件
        validHypothesisWithFalsification(),  // 第2次: 修正后通过
      ],
    });
    const result = await BlockExecutor.execute(block, { llm: mockLLM });
    expect(result.status).toBe("success");
    expect(mockLLM.callCount).toBe(2);  // 调用了两次
  });

  it("超过最大迭代次数返回失败", async () => {
    const block = createAssessHypothesisBlock({ maxIterations: 3 });
    const mockLLM = createMockLLM({
      responses: [
        invalidHypothesis(), invalidHypothesis(), invalidHypothesis(),
      ],
    });
    const result = await BlockExecutor.execute(block, { llm: mockLLM });
    expect(result.status).toBe("failed");
    expect(result.failureReason).toBe("max_iterations_exceeded");
    expect(mockLLM.callCount).toBe(3);  // 不超过 maxIterations
  });
});
```

### 17.6 认知管线测试

验证 Prompt 组装和输出验证。

```typescript
describe("认知模式 Prompt 组装", () => {
  it("FALSIFY 模式注入证伪指令", () => {
    const prompt = PromptAssembler.assemble({ mode: "FALSIFY", context: ctx });
    expect(prompt).toContain("寻找反例");
    expect(prompt).toContain("挑战假设");
  });

  it("VERIFY 模式注入验证指令", () => {
    const prompt = PromptAssembler.assemble({ mode: "VERIFY", context: ctx });
    expect(prompt).toContain("验证一致性");
  });
});

describe("盲审策略", () => {
  it("HIDE_TEST_SET 隐藏测试集信息", () => {
    const ctx = ContextCompiler.compile({
      state: fullState,
      policy: "HIDE_TEST_SET",
    });
    expect(ctx.knowledgeItems).not.toContain(testSetKnowledge);
  });
});
```

### 17.7 端到端测试

模拟完整的验证循环，使用 mock Provider 和工具。

```typescript
describe("E2E: 假设验证完整链路", () => {
  it("假设→验证→确认", async () => {
    const ctx = createTestContext({
      provider: createDeterministicProvider(scenarioA),
      tools: mockTools,
    });

    const result = await WorkflowEngine.run(HypothesisVerificationWorkflow, ctx);

    expect(result.manifest.hypotheses[0].status).toBe("CONFIRMED");
    expect(result.manifest.evidence).toHaveLength(3);
    expect(result.manifest.evidence.every(e => e.status === "VALIDATED")).toBe(true);
  });

  it("假设→验证→否定→新假设→验证→确认", async () => {
    // 测试回退和修正循环
  });
});
```

### 17.8 测试数据工厂

使用 `@effect/schema` 内置的 arbiter 生成符合 Schema 的测试数据。

```typescript
import { Arbitrary } from "@effect/schema/Arbitrary";

// 自动生成符合 Schema 的随机测试数据
const genHypothesis = Arbitrary.arbitrary(Hypothesis);
const hypothesis = genHypothesis();  // 每个字段都符合类型约束
```

### 17.9 测试覆盖率要求

| 层级 | 最低覆盖率 | 理由 |
|------|-----------|------|
| Domain | 95% | 不变量是系统根基 |
| Control | 90% | 状态机错误会导致数据损坏 |
| Cognition | 80% | Prompt 组装逻辑影响推理质量 |
| Runtime | 85% | 工具执行和沙箱安全 |
| Capability | 70% | 依赖外部服务，侧重集成测试 |
| API | 80% | 用户接口稳定性 |

### 17.10 CI 门禁

```
PR 提交 → 单元测试 → 类型检查 → lint → 集成测试 → E2E 样本
         5s         3s         2s     30s         60s
```

任何层级覆盖率低于阈值，CI 不通过。

### Phase 0：TS 项目脚手架 + 领域模型 + 测试基础

- pnpm + tsup + vitest + eslint + Effect 项目初始化
- `src/domain/objects/` 所有 Research Object Schema 定义
- Domain 层不变量测试 + 状态机转换测试（覆盖率 ≥95%）
- 测试数据工厂 + CI 门禁配置

### Phase 1：持久化层

- `@effect/sql-pg` + PostgreSQL + drizzle-kit 迁移
- ResearchObjectStore + EventStore 持久化

### Phase 2：核心控制面

- Controller / ActionRegistry / TransitionEngine / GateEngine
- TaskManager / BranchManager / ApprovalManager / PolicyEngine
- 覆盖现有 Python 所有功能
- 状态机合法/非法转换的完整测试（覆盖率 ≥90%）

### Phase 3：Provider + Tool + Agent Loop

- Provider 抽象层（Anthropic / OpenAI）+ mock Provider 测试工具
- ToolRegistry + 内置工具（scholarly / filesystem / code）
- Agent Loop（stream → tools → loop）
- Python 微服务（scipy / GROBID / LaTeX）
- Skill 系统（Markdown + 热加载）
- 每个 Tool 的单元测试 + 沙箱隔离验证

### Phase 4：科研能力层（第一批）

- Literature Capability（search → retrieve → parse → read → synthesize）
- 能跑通 SEARCH_KNOWLEDGE → READ_DOCUMENT 完整链路
- 首个 E2E 测试：事实采集 → 知识提取

### Phase 5：Subagent + ExecutionBlock + Hook

- SubagentExecutor（独立上下文 + 隔离）
- BlockExecutor + 验证-修复循环
- Hook 系统
- 验证-修复循环的 3 种场景测试（一次通过/重试通过/超限失败）

### Phase 6：科研能力层（第二批）

- Experiment Capability（design → execute → analyze）
- Writing Capability（outline → draft → review）

### Phase 7：Workflow + API

- WorkflowEngine（parallel / pipeline / phase）
- Hono API + WebSocket
- E2E 测试：完整的假设验证循环（假设→验证→结论→报告）

### Phase 8：可观测性 + 评估

- OpenTelemetry tracing/metrics
- 评估框架

### Phase 9：前端

- Next.js Web UI
- Project Workspace / Research Map / Task Board / Approval Queue
