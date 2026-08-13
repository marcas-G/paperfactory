# Research Agent 全局开发宪法

本文档定义本项目**贯穿整个开发周期、所有模块、所有 Agent、所有 Skill、所有 Tool、所有 Workflow** 的统一设计原则。

它不是某个模块的实现说明，而是全项目最高级别的工程约束。

后续任何设计、编码、重构、Prompt、状态机、工具接入、数据库结构、Agent 行为，都必须与本文保持一致。

---

## 1. 项目本质

本项目不是一个“论文搜索 + PDF 问答 + AI 写作”工具，也不是若干 LLM Workflow 的拼接。

本项目的目标是构建一个：

> **持续维护科研项目状态、识别当前关键不确定性、选择下一研究动作、组织所需上下文、调用专业能力执行，并依据证据推进科研状态演化的一站式 Research Agent Platform。**

统一运行模型：

[
ResearchState_t
\rightarrow
ResearchAction_t
\rightarrow
Context_t
\rightarrow
Execution_t
\rightarrow
Observation_t
\rightarrow
Evaluation_t
\rightarrow
ResearchState_{t+1}
]

系统最终处理的核心不是“消息”，而是：

```text
Research Project
Research State
Research Object
Research Action
Evidence
Decision
Event
```

Chat 只是系统的一种交互方式。

---

# 2. 总体架构

系统采用七层架构。

```text
┌───────────────────────────────────────────────┐
│ L7  Application / UX                         │
│ Project / Research Map / Tasks / Diff / Chat │
├───────────────────────────────────────────────┤
│ L6  Research Control Plane                   │
│ State / Action / Gate / Policy / DAG / HITL  │
├───────────────────────────────────────────────┤
│ L5  Cognitive Control Plane                  │
│ Mode / Context / Prompt / Memory / Blinding  │
├───────────────────────────────────────────────┤
│ L4  Agent Runtime                            │
│ Run / Session / Agent / Skill / Tool / Hook  │
│ Retry / Checkpoint / Permission / Sandbox    │
├───────────────────────────────────────────────┤
│ L3  Research Capability Layer                │
│ Literature / Code / Experiment / Stats /     │
│ Writing / Review / Citation / Search         │
├───────────────────────────────────────────────┤
│ L2  Data / Knowledge / Audit Plane           │
│ SQL / Research Graph / Vector / Artifacts    │
│ Event Log / Trace / Versioning               │
├───────────────────────────────────────────────┤
│ L1  Platform Infrastructure                  │
│ Compute / Queue / Git / Containers / Auth    │
│ Secrets / Telemetry / Backup                 │
└───────────────────────────────────────────────┘
```

整体依赖原则：

```text
Application
    ↓
Research Control Plane
    ↓
Cognitive Control / Runtime
    ↓
Capabilities
    ↓
Data / Infrastructure
```

上层负责定义“为什么做、什么时候做”，下层负责“怎么执行”。

不得让下层基础设施反向控制领域语义。

---

# 3. L7 — Application / UX

这一层面向用户。

它不是整个系统的控制中心，只负责：

* 展示 Research Project；
* 展示 Research State；
* 展示 Research Graph；
* 展示 Task DAG；
* 展示 Agent Run；
* 展示 Evidence / Claim；
* 展示 Research Branch；
* 发起命令；
* 处理 Human Approval；
* 展示 Diff、Trace、Artifact。

核心界面包括：

```text
Project Workspace
Research Map
Task Board
Agent Console
Approval Queue
Evidence View
Experiment View
Manuscript View
Review / Rebuttal View
```

重要原则：

> **Chat 只是 Interaction Layer，不是 Project State。**

不得把聊天消息作为科研系统事实来源。

---

# 4. L6 — Research Control Plane

这是整个系统的科研流程权威。

负责：

```text
State Manager
Action Registry
Transition Engine
Gate Engine
Research Policy Engine
Task DAG
Branch Manager
Human Decision Manager
```

它回答：

> **当前科研状态是什么？下一步允许做什么？什么时候状态可以改变？**

核心职责：

```text
Observe State
Detect Blockers
List Legal Actions
Evaluate Gates
Prioritize Actions
Create Tasks
Manage Branches
Request Approval
Commit Transition
```

它不负责：

```text
搜索论文
读 PDF
运行代码
做统计
写论文
```

这些由下层 Capability 执行。

Research Controller 必须尽量 deterministic。

LLM 只允许参与明确声明为 Semantic Gate 或 Semantic Ranking 的部分。

---

# 5. L5 — Cognitive Control Plane

这一层负责：

> **在当前科研状态和当前 Action 下，Agent 应该看到什么，以及应该按照什么认知模式思考。**

包含：

```text
Research Constitution
Cognitive Mode
Context Policy
Context Compiler
Prompt Policy
Retrieval Policy
Memory Selection
Blinding Policy
Output Validator
```

正式 Cognitive Mode 包括：

```text
FRAME
EXPLORE
MAP
COMPARE
FALSIFY
DIAGNOSE
DISCRIMINATE
VERIFY
SYNTHESIZE
DECIDE
```

例如：

```text
Novelty Validation
→ FALSIFY

Experiment Failure
→ DIAGNOSE

Study Design
→ DISCRIMINATE

Result Validation
→ VERIFY

Evidence → Claim
→ SYNTHESIZE
```

核心原则：

> **Prompt 由 State + Action + Context Policy 动态编译，而不是维护一个万能科研 Prompt。**

---

# 6. L4 — Agent Runtime

这一层负责成熟 Agent Harness 的执行能力。

包含：

```text
Session
Run
Agent
Subagent
Skill
Tool
Permission
Sandbox
Checkpoint
Pause / Resume
Retry
Timeout
Hook
Approval Waiting
Model Routing
```

Agent Runtime 不理解科研领域含义。

例如它可以知道：

```text
Run failed
Tool timeout
Permission denied
Waiting for approval
```

但它不应该自己判断：

```text
Hypothesis 是否应被拒绝
Gap 是否仍然成立
Claim 是否足够强
```

这些属于 Research Control / Cognitive Control。

---

# 7. L3 — Research Capability Layer

这一层提供实际科研能力。

主要包括：

```text
Literature Search
Paper Retrieval
PDF Parsing
Paper Reading
Citation Analysis
Knowledge Extraction

Code Reading
Code Editing
Code Execution

Study Design Support
Experiment Execution
Statistics

Writing
Citation
Review
Rebuttal
```

Capability 的规则：

> **Capability 只执行任务，不直接修改 Research State。**

正确路径：

```text
Controller
↓
Research Action
↓
Cognitive Control
↓
Agent Runtime
↓
Capability
↓
Structured Observation
↓
Controller
```

---

# 8. L2 — Data / Knowledge / Audit Plane

这一层负责系统事实、知识、版本和审计。

核心内容：

```text
Research Objects
Research Relations
Research Graph
Domain Events
Task State
Approval State
Prompt Metadata
Context Metadata
Vector Embeddings
Artifacts
Trace
Versions
```

默认：

```text
PostgreSQL = Source of Truth
```

其余：

```text
Vector Index
Graph Projection
Cache
Frontend State
Agent Memory
Temporal Runtime History
```

均不得成为科研状态的唯一权威来源。

---

# 9. L1 — Platform Infrastructure

这一层负责基础设施：

```text
Compute
Queue
Git
Container
Object Storage
Auth
IAM
Secrets
Telemetry
Backup
Network
Deployment
```

它不理解：

```text
Question
Gap
Hypothesis
Evidence
Claim
```

等科研概念。

领域语义不得向基础设施泄漏。

---

# 10. 最高设计原则

必须始终遵循三句话：

> **LLM proposes; the system decides.**

> **Tools execute; the controller governs.**

> **Evidence changes research state; prose does not.**

即：

* LLM 负责认知任务和候选判断；
* Controller 负责流程治理；
* Tool 负责执行；
* Gate 负责判断是否合法；
* Evidence 负责支持科研状态变化；
* Event 负责记录状态变化；
* 用户负责关键不可逆决策。

任何实现不得破坏这一职责边界。

---

# 11. Research State 是系统核心

不得将聊天历史视为科研状态。

不得依赖：

```text
“Agent 应该记得之前讨论过……”
```

系统必须显式维护结构化 Research State。

例如：

```text
当前 Research Question
当前 Gap
当前 Hypotheses
已否定方向
活跃 Experiments
已冻结 Protocol
已有 Evidence
当前 Claims
Open Uncertainties
Blocking Issues
Pending Decisions
Reviewer Concerns
```

Research State 必须：

* 持久化；
* 可版本化；
* 可恢复；
* 可追溯；
* 可重建。

---

# 12. Research Object 优先于自然语言

科研系统中的重要概念必须尽量建模为 Typed Research Object。

例如：

```text
ResearchQuestion
Observation
KnowledgeItem
Gap
Hypothesis
StudyDesign
Protocol
Experiment
Result
Evidence
Claim
Decision
Failure
ReviewerConcern
```

不得长期依赖自由文本或：

```python
dict[str, Any]
```

表达核心科研状态。

自然语言可以作为：

```text
description
summary
rationale
notes
```

但不能替代正式状态。

---

# 13. 科研过程不是线性 Pipeline

不得将科研过程实现成：

```text
Literature
→ Gap
→ Hypothesis
→ Experiment
→ Paper
→ END
```

真实科研必须支持：

```text
循环
回退
分支
暂停
重新打开
纠正
并行研究路线
```

系统认知上必须至少支持四种科研循环：

```text
Discovery Loop
Confirmation Loop
Engineering Loop
Correction Loop
```

即：

```text
发现
→ 提出解释
→ 验证
→ 发现问题
→ 修正
→ 新发现
```

---

# 14. 探索与确认必须严格分离

必须原生区分：

```text
EXPLORATORY
CONFIRMATORY
```

探索阶段可以：

* 搜索方向；
* 发现 pattern；
* 尝试分析；
* 产生 hypothesis；
* 修改研究问题。

确认阶段则必须保护：

```text
Hypothesis
Protocol
Primary Metric
Dataset Split
Evaluation Rule
Stopping Rule
```

看到结果以后不得静默修改确认性规则。

任何 post-hoc 修改必须显式记录。

---

# 15. 全局科研认知纪律

所有 Agent 和科研判断都必须遵守以下原则。

## 15.1 Problem First

先定义当前问题，再选择方法。

禁止：

```text
先看到某种模型/算法
→ 再强行寻找科研问题
```

## 15.2 Known / Inferred / Assumed / Unknown 分离

重要信息必须区分：

```text
KNOWN
INFERRED
ASSUMED
UNKNOWN
```

不得将推测伪装成事实。

## 15.3 Evidence Grounding

所有重要：

```text
Claim
Decision
Novelty Assessment
Hypothesis Assessment
Scientific Conclusion
```

必须能够追溯 Evidence。

## 15.4 Contradiction First

不得只寻找支持证据。

必须主动寻找：

```text
counterexample
contradictory evidence
nearest prior work
alternative explanation
failure case
```

## 15.5 Competing Explanations

看到现象以后，不得默认单一解释。

应考虑：

[
H_1,H_2,\ldots,H_n
]

并优先寻找能够区分不同解释的 Evidence。

## 15.6 Falsifiability

正式 Hypothesis 必须回答：

> 什么结果意味着这个 Hypothesis 需要被削弱或拒绝？

如果不存在合理反证条件，则不得直接作为正式确认性假设。

## 15.7 Uncertainty Driven

Research Agent 的主要工作不是：

> “继续做更多事情”。

而是：

> **识别并降低当前最关键的不确定性。**

## 15.8 Information Gain

选择下一 Research Action 时应综合：

```text
Expected Information Gain
Blocking Power
Scientific Value
Cost
Risk
Dependency
Deadline
```

优先执行最能改变当前科研判断的动作。

## 15.9 Claim Calibration

必须满足：

[
ClaimScope \subseteq EvidenceScope
]

不得用局部 Evidence 支持过宽结论。

## 15.10 Explicit Stop

所有循环必须存在：

```text
continue condition
stop condition
iteration budget
resource budget
escalation condition
```

禁止无限搜索、无限实验、无限调参和无限 hypothesis revision。

---

# 16. 状态变更必须受控

任何核心对象都不得提供任意：

```text
set_status(...)
```

式接口。

必须采用：

```text
Current State
↓
Action
↓
Transition Proposal
↓
Precondition Check
↓
Invariant Check
↓
Gate Evaluation
↓
Permission Check
↓
Human Approval if required
↓
Commit
↓
Domain Event
```

LLM 只能提出：

```text
StateTransitionProposal
```

不得直接 Commit。

---

# 17. Gate 优先于 Prompt

能用确定性代码判断的问题，不得交给 LLM。

例如：

```text
Protocol 是否存在？
Protocol 是否 FROZEN？
Experiment 是否引用 Protocol？
Result 是否 VALID？
Evidence 引用是否存在？
Permission 是否满足？
```

这些必须代码判断。

只有真正需要语义判断的问题才使用 LLM，例如：

```text
两个方法是否机制等价？
Gap 是否真实存在？
Hypothesis 是否真正可证伪？
Claim 是否存在 overclaim？
```

统一原则：

> **Deterministic where possible, semantic where necessary.**

---

# 18. Prompt 不是系统架构

不得通过不断扩大 system prompt 来解决：

```text
状态管理
权限管理
长期记忆
科研流程
状态机
重试策略
审计
数据一致性
```

Prompt 只负责：

> 在指定 Task、Context 和 Cognitive Mode 下完成一个明确的认知任务。

Prompt 是系统末端实现，不是系统核心。

---

# 19. Context 必须被编译，而不是堆积

禁止：

```text
把所有聊天历史
+ 所有论文
+ 所有实验
+ 所有 memory
```

直接塞进模型。

必须：

```text
Current State
+
Current Action
+
Context Policy
↓
Context Compiler
↓
ContextBundle
```

上下文至少区分：

```text
Global Context
State Context
Task Context
```

Context Compiler 必须决定：

```text
必须看到什么
可以看到什么
不应该看到什么
当前 token budget
```

---

# 20. 必须支持科研 Blinding

Context 管理必须原生支持隐藏信息。

例如：

```text
HIDE_FUTURE_RESULT
HIDE_TEST_SET
HIDE_CONFIRMATORY_RESULT
HIDE_REVIEW_OUTCOME
```

不得依赖一句 Prompt：

> “请假装你没有看到结果。”

科研泄漏必须由程序级 Context Policy 防止。

---

# 21. Cognitive Mode 必须显式

不要所有任务都使用：

> “你是一名严谨的科研专家。”

不同 Research Action 应指定不同思考模式，例如：

```text
FRAME
EXPLORE
MAP
COMPARE
FALSIFY
DIAGNOSE
DISCRIMINATE
VERIFY
SYNTHESIZE
DECIDE
```

---

# 22. Tool、Skill、Agent、Workflow 必须分离

统一定义：

```text
Tool < Skill < Agent < Workflow
```

## Tool

原子执行能力。

## Skill

可复用、受控的小型流程。

## Agent

拥有独立：

```text
Goal
Context
Cognitive Policy
Tools
Permissions
Output Contract
Termination Policy
```

## Workflow

多个 Action / Agent / Skill 的受控组合。

不得把所有逻辑都写成 Agent 对话。

---

# 23. Agent 不得成为“大脑黑箱”

多 Agent 不是默认方案。

优先级应为：

```text
Deterministic Code
↓
Rule
↓
Skill
↓
Single Agent
↓
Subagent
```

只有满足以下条件时才考虑 Subagent：

```text
上下文需要隔离
权限不同
工具不同
任务可以并行
需要独立判断
```

不得为了“Agent 化”而制造大量互相聊天的 Agent。

---

# 24. Research Controller 是唯一流程权威

Controller 负责：

```text
Observe State
Detect Blocker
List Legal Actions
Evaluate Gates
Prioritize Actions
Create Tasks
Manage Branches
Request Approval
Commit Transition
```

Controller 不负责：

```text
查论文
读论文
写代码
跑实验
写论文
```

Controller 必须尽可能 deterministic。

---

# 25. Runtime 与科研语义必须隔离

必须区分：

```text
Research Control Plane
```

和：

```text
Agent Runtime
```

Runtime 负责：

```text
Session
Run
Tool Call
Agent Execution
Retry
Timeout
Pause
Resume
Checkpoint
Sandbox
Approval Waiting
```

Runtime 不得自行解释科研结果。

---

# 26. Runtime Failure 与 Scientific Failure 必须彻底分开

Runtime Failure：

```text
timeout
network
rate limit
OOM
tool crash
dependency failure
```

可以 retry。

Scientific Failure：

```text
null result
hypothesis rejected
novelty failed
effect disappeared
mechanism unsupported
```

不得自动 retry。

必须进入科研分析流程。

---

# 27. 权限和副作用必须显式

建议权限分层：

```text
P0 READ
P1 DERIVE
P2 INTERNAL_MUTATION
P3 COMPUTE_EXECUTION
P4 SCIENTIFIC_COMMIT
P5 EXTERNAL_SIDE_EFFECT
```

高风险动作必须显式审批。

---

# 28. Human-in-the-loop 是正式状态

必须支持：

```text
WAITING_FOR_APPROVAL
```

并能够：

```text
Pause
Persist
Resume
Reject
Expire
```

用户关键决策必须成为正式 `Decision` / `Approval` 对象。

---

# 29. 所有重要数据必须可版本化

特别是：

```text
Hypothesis
Protocol
Experiment Config
Result
Evidence
Claim
Prompt
ContextBundle
Agent Definition
Model Policy
Code
```

不得静默覆盖历史版本。

---

# 30. Result、Evidence、Claim 必须分层

不得：

```text
Experiment Result
→ 直接支持 Claim
```

正确关系：

```text
Experiment
↓
Result
↓
Validation
↓
Evidence
↓
Claim
```

Result 是观测。

Evidence 是经过有效性判断后可用于支持或反驳命题的对象。

Claim 是根据 Evidence 形成的科研主张。

三者不得混淆。

---

# 31. Research Failure 必须保存

失败不是垃圾数据。

必须记录：

```text
失败了什么
为什么失败
属于哪种 failure
证据是什么
未来什么情况下值得重新尝试
得到什么 reusable lesson
```

禁止 Agent 在条件未改变时反复提出已经明确失败的路线。

---

# 32. Research Branch 必须是一等概念

科研可以并行存在：

```text
main
├── H1
├── H2
└── H3
```

不同 Branch 可以：

```text
ACTIVE
PAUSED
MERGED
REJECTED
ARCHIVED
```

不得将所有候选方向混在一个全局状态里。

---

# 33. Event 必须贯穿整个系统

所有重要状态变化必须产生不可变 Domain Event。

例如：

```text
QUESTION_ACTIVATED
GAP_VALIDATED
HYPOTHESIS_REJECTED
PROTOCOL_FROZEN
EXPERIMENT_COMPLETED
RESULT_INVALIDATED
EVIDENCE_ADDED
CLAIM_REOPENED
```

必须能够回答：

> 为什么当前状态变成这样？

---

# 34. Runtime Event 与 Domain Event 不得混淆

例如：

```text
MODEL_CALL_RETRIED
TOOL_TIMEOUT
WORKFLOW_RESUMED
```

属于 Runtime Event。

而：

```text
HYPOTHESIS_REJECTED
CLAIM_SUPPORTED
```

属于 Research Domain Event。

两套语义必须独立。

---

# 35. Source of Truth 必须明确

科研状态只能有一个权威来源。

默认：

```text
PostgreSQL = system of record
```

以下都不是 Source of Truth：

```text
Vector Store
Chat History
Prompt
LLM Memory
Graph Cache
Frontend State
Temporal Runtime History
```

---

# 36. Vector Retrieval 不是 Memory 本身

不得把：

```text
embedding top-k
```

等价于科研记忆。

Context Retrieval 应结合：

```text
Typed Object Relation
Graph Relation
Metadata
State
Time
Semantic Similarity
```

优先结构化关系，再使用 embedding 补充。

---

# 37. 模块边界必须保持

整体采用：

```text
M1 Research Control Plane
M2 Cognitive Control Plane
M3 Agent Runtime
M4 Research Domain
M5 Capability Layer
M6 Data / Audit Plane
M7 Application / UX
```

新增代码必须明确属于哪个模块。

如果无法明确归属，应先重新考虑设计，而不是随意放置。

---

# 38. Domain 不得依赖基础设施

Domain 层不得直接依赖：

```text
FastAPI
SQLAlchemy
Temporal
Pydantic AI
OpenAI SDK
Anthropic SDK
GROBID
OpenAlex
```

应通过 Port / Protocol 抽象。

原则：

> **Infrastructure depends on Domain, not the reverse.**

---

# 39. 技术架构总体采用 Modular Monolith

初期不做微服务。

采用：

```text
Modular Monolith
+
Ports & Adapters
+
Durable Workers
+
Event-driven Domain
```

优先保证：

```text
清晰
一致
可测试
可重构
```

而不是提前为未知规模设计复杂分布式系统。

---

# 40. 不得未经论证引入复杂基础设施

默认不要自行引入：

```text
Kafka
Kubernetes
Neo4j
Pinecone
Qdrant
CrewAI
AutoGen
LangGraph as core controller
Microservices
```

如确有必要，必须创建 ADR。

---

# 41. Typed Interface 优先

跨模块接口必须尽量使用明确类型。

优先：

```python
HypothesisAssessment
ContextBundle
ResearchAction
GateResult
StateTransitionProposal
EvidenceAssessment
```

避免：

```python
dict[str, Any]
```

在系统核心中传播。

---

# 42. Immutable 优先

以下对象原则上应 immutable/versioned：

```text
Protocol
Result
Evidence source snapshot
ContextBundle
PromptRun
Experiment artifact
Domain Event
```

需要修改时创建新版本。

---

# 43. Explicit 优先于 Magic

禁止依赖：

```text
模型自己猜状态
模型自己猜你想做什么
模型自己猜是否允许调用工具
模型自己决定什么时候停止
```

系统必须显式定义：

```text
State
Action
Gate
Permission
Stop Condition
Output Contract
```

---

# 44. 可恢复性是基础能力

Long-running Research Agent 必须考虑：

```text
crash
timeout
restart
pause
approval
dependency unavailable
worker failure
```

所有长期任务都应具备：

```text
checkpoint
resume
retry policy
cancel
```

---

# 45. 可观测性必须从第一天存在

每次 Research Run 至少能够追踪：

```text
谁发起
当时 Research State
选择了什么 Action
为什么选择
使用哪个 ContextBundle
使用哪个 Agent
使用哪个 Model
调用哪些 Tools
得到什么 Output
通过什么 Gate
是否发生 Transition
花费多少
耗时多少
```

---

# 46. Eval 是产品的一部分

不仅测试最终输出，还必须测试：

```text
State Transition correctness
Gate correctness
Action selection
Context retrieval
Evidence grounding
Protocol compliance
Blinding
Long-horizon consistency
Failure recovery
Human override behavior
```

---

# 47. Coding Agent 的默认工作方式

执行任何开发任务时，Coding Agent 应按以下顺序工作：

```text
1. 明确当前目标
2. 确认属于哪个模块
3. 阅读相关接口和约束
4. 检查已有实现
5. 判断是否涉及架构变化
6. 最小化修改范围
7. 保持依赖方向
8. 编写/更新测试
9. 运行验证
10. 报告变更与风险
```

不要：

```text
看到需求
→ 立即写代码
```

---

# 48. Coding Agent 在设计前必须问自己的问题

对于任何新功能，必须能够回答：

```text
它属于哪个模块？

它操作什么 Research Object？

它对应什么 Research Action？

什么时候允许执行？

谁决定执行？

需要什么 Context？

使用什么 Cognitive Mode？

输出什么 Typed Result？

经过什么 Gate？

会产生什么 Event？

需要什么 Permission？

失败后如何处理？

是否需要 Human Approval？

如何恢复？

如何审计？

如何测试？
```

如果这些问题没有答案，不应急于实现。

---

# 49. 开发策略

整个项目采用：

[
\boxed{
Top\text{-}down\ Skeleton
+
Vertical\ Increment
}
]

第一步先建立完整模块边界。

随后每次选择一条最小纵向链路：

```text
State
→ Action
→ Context
→ Execution
→ Observation
→ Gate
→ Transition
→ Event
```

跑通后再增加新的 Research Capability。

---

# 50. 当前阶段总原则

项目早期最重要的不是“智能程度”。

优先级：

```text
1. Correctness
2. State consistency
3. Controllability
4. Auditability
5. Recoverability
6. Testability
7. Extensibility
8. Agent intelligence
```

不要倒过来。

---

# 51. 最终质量标准

一个模块或功能只有满足以下条件才视为成熟：

```text
边界清晰
职责单一
接口明确
类型明确
状态明确
失败语义明确
权限明确
副作用明确
可恢复
可追踪
可测试
可替换
```

项目最终追求的不是：

> **“Agent 能完成任务。”**

而是：

[
\boxed{
Correct
+
Controllable
+
Recoverable
+
Auditable
+
Extensible
+
Testable
}
]

---

# 52. 最终原则

当工程实现和 Agent“聪明程度”发生冲突时，优先保证系统约束。

当自由自主和科研可靠性发生冲突时，优先科研可靠性。

当快速实现和领域一致性发生冲突时，优先领域一致性。

当 Prompt 能解决、代码也能解决时，优先代码。

当确定性规则能解决、LLM 也能解决时，优先确定性规则。

当已有 Evidence 不足时，允许输出 UNKNOWN / UNCERTAIN，而不是强行生成结论。

始终坚持：

> **模型负责认知，Controller 负责治理，Capability 负责执行，Evidence 负责改变科研认知状态，Event 负责记录变化。**
