# NASA Systems Engineering × V-Model
## 问题驱动的软件开发阶段模板

---

# 0. 总体结构

整套流程固定为：

```text
P0 Problem Definition
        ↓
P1 Stakeholder & Operational Concept
        ↓
P2 System Requirements
        ↓
P3 Logical Decomposition
        ↓
P4 Architecture Design
        ↓
P5 Detailed Design
        ↓
P6 Implementation
        ↓
P7 Verification
        ↓
P8 Validation
```

各阶段只回答一个层次的问题：

| 阶段 | 唯一核心问题 |
|---|---|
| P0 Problem | **现实中为什么需要做这件事？** |
| P1 Stakeholder & ConOps | **谁在什么环境中怎样与系统交互？** |
| P2 Requirements | **系统必须具备什么可验证的能力和性质？** |
| P3 Logical Decomposition | **为了满足需求，逻辑上必须发生什么？** |
| P4 Architecture | **哪些系统元素承担这些逻辑责任？** |
| P5 Detailed Design | **每个元素内部精确怎样工作？** |
| P6 Implementation | **代码是否忠实实现既定设计？** |
| P7 Verification | **是否有证据证明规格被正确实现？** |
| P8 Validation | **最终是否真正解决了最初的问题？** |

贯穿示例统一采用：

> **科研 Agent 在长任务过程中发生进程中断，需要恢复任务。**

---

# P0 — Problem Definition

## 阶段目标

回答：

> **现实世界到底有什么问题？为什么值得解决？**

本阶段描述的是现实问题，而不是软件方案。

---

## P0-Q1：谁在什么情况下遇到了什么阻碍？

### 回答模板

```text
[问题主体] 在 [具体场景] 下，
由于 [现实原因/现状]，
难以/无法 [原本希望完成的行为]。
```

### 正例

```text
研究人员在运行持续数小时甚至数天的科研 Agent 任务时，
由于 Agent 进程可能异常退出，
无法保证已经完成的研究进度能够继续使用。
```

### 反例

```text
我们缺少一个 CheckpointService。
```

### 为什么错误

这已经假设解决方案是 CheckpointService。

### 重要要求

- 必须描述现实世界的困难。
- 不出现模块名、数据库、框架、类名。
- 一个 Problem Statement 尽量只描述一个核心问题。

---

## P0-Q2：这个问题造成什么后果？

### 回答模板

```text
该问题导致 [明确损失/成本/风险]，
主要影响 [对象/过程]。
```

### 正例

```text
任务中断会导致已完成的调研、假设生成和实验准备工作重复执行，
增加模型调用成本和研究时间。
```

### 反例

```text
这个问题非常严重，会严重影响用户体验。
```

### 为什么错误

“严重”“用户体验差”不可分析，也不知道具体损失在哪里。

### 重要要求

后果至少应属于以下一种：

```text
成本
时间
风险
可靠性
错误率
资源浪费
业务损失
```

---

## P0-Q3：现有解决方式为什么不足？

### 回答模板

```text
当前通常通过 [现有方式] 处理，
但在 [条件] 下，
由于 [具体机制]，
仍然无法解决 [问题]。
```

### 正例

```text
当前可以依赖对话历史重新构造部分任务上下文，
但对话记录无法完整恢复结构化阶段状态、实验产物引用和执行位置，
因此无法可靠继续原任务。
```

### 反例

```text
现有方案都比较落后。
```

### 重要要求

必须指出：

```text
现有机制
+
失效条件
+
失效原因
```

---

## P0-Q4：问题被解决以后，现实结果应该发生什么变化？

### 回答模板

```text
当问题得到解决后，
[主体] 应能够 [结果]，
而不再需要 [当前被迫采取的行为]。
```

### 正例

```text
任务异常退出后，
研究人员应能够继续最近一次有效研究状态，
而无需重新执行已经完成的研究阶段。
```

### 反例

```text
系统应该支持 checkpoint。
```

### 重要要求

描述 **Outcome**，不是 Feature。

---

## P0-Q5：本问题明确包括什么、不包括什么？

### 回答模板

```text
In Scope:
- [...]

Out of Scope:
- [...]
```

### 正例

```text
In Scope:
- Agent 研究阶段状态恢复
- 已完成研究产物引用恢复

Out of Scope:
- GPU 内核执行到指令级的恢复
- 外部第三方服务自身的灾难恢复
```

### 反例

```text
主要解决 Agent 恢复相关问题。
```

### 重要要求

Scope 必须能用于拒绝后续 Scope Creep。

---

## P0 Exit Gate

必须能够明确回答：

```text
谁遇到问题？
问题是什么？
造成什么后果？
为什么现有办法不够？
解决后现实结果是什么？
问题边界在哪里？
```

---

# P1 — Stakeholder & Operational Concept

## 阶段目标

回答：

> **谁会怎样使用系统，系统处于什么外部环境？**

这里开始描述“系统与现实世界的关系”，但仍然不设计系统内部。

---

## P1-Q1：哪些 Stakeholder 会影响系统？

### 回答模板

```text
Stakeholder:
[角色]

Concern:
- [...]
- [...]
```

### 正例

```text
Stakeholder:
Researcher

Concern:
- 能够恢复中断任务
- 已完成实验不得无故重复
- 恢复后的研究状态必须可理解
```

### 反例

```text
Stakeholder:
Frontend
Backend
Database
```

### 为什么错误

这些是系统元素，不是 stakeholder。

### 重要要求

只列：

> 对系统需求、使用、运营、维护或合规有真实影响的人或外部组织。

---

## P1-Q2：系统与哪些外部实体交互？

### 回答模板

```text
External Entity:
[名称]

Relationship:
系统从其获得 [...]
系统向其提供 [...]
```

### 正例

```text
External Entity:
LLM Provider

Relationship:
系统向其发送模型推理请求，
并获得模型输出或错误状态。
```

### 反例

```text
AgentRuntime 调用 ProviderAdapter。
```

### 为什么错误

已经进入内部架构。

### 重要要求

本阶段只识别：

```text
User
External API
External Runtime
External Storage
External Organization
Physical Environment
```

---

## P1-Q3：正常情况下，一次完整使用如何发生？

### 回答模板

```text
Given:
[初始条件]

Actor:
[用户行为]

System:
[外部可观察行为]

Outcome:
[最终结果]
```

### 正例

```text
Given:
研究任务此前因进程退出而中断。

Actor:
研究人员重新启动系统并选择 Resume。

System:
系统识别可恢复任务并继续执行。

Outcome:
任务从最近有效研究状态继续进行。
```

### 反例

```text
RecoveryCoordinator 调用 Repository.load_latest()，
然后 StateMachine.transition()。
```

### 重要要求

Scenario 只描述 **Black-box behavior**。

---

## P1-Q4：主要异常场景是什么？

### 回答模板

```text
When:
[异常事件]

Expected External Behavior:
[用户/外部系统应该观察到什么]
```

### 正例

```text
When:
最近一次保存的任务状态损坏。

Expected External Behavior:
系统不得继续使用损坏状态，
并明确报告无法从该恢复点继续。
```

### 反例

```text
发生错误时 catch exception。
```

### 重要要求

描述异常情况下 **系统应该表现成什么样**，不描述内部错误处理机制。

---

## P1-Q5：系统运行在什么环境中？

### 回答模板

```text
Operational Environment:
- 部署环境：
- 外部依赖：
- 网络条件：
- 使用方式：
- 已知环境限制：
```

### 正例

```text
Operational Environment:
- Linux Server
- Agent 任务可能持续数小时以上
- 依赖外部 LLM Provider
- 进程可能因机器重启或人工终止而中断
```

### 反例

```text
使用 PostgreSQL + Redis。
```

### 重要要求

环境描述的是：

> 系统必须适应什么现实条件。

不是：

> 系统内部准备怎么实现。

---

# P2 — System Requirements

## 阶段目标

回答：

> **系统必须做到什么，以及达到什么标准？**

从这一阶段开始，内容正式成为 Specification。

---

## P2-Q1：系统必须提供哪些功能能力？

### 回答模板

```text
ID:
REQ-F-xxx

Statement:
The system shall [externally observable behavior].

Parent:
[P0/P1 来源]
```

### 正例

```text
REQ-F-017

The system shall allow an interrupted research execution
to resume from its latest valid recoverable state.
```

### 反例

```text
系统应该提供 RecoveryManager，
通过 SQLite 保存 checkpoint。
```

### 重要要求

功能需求：

- 描述行为。
- 不描述实现。
- 一条需求只表达一个要求。

---

## P2-Q2：这些能力必须达到什么质量或性能标准？

### 回答模板

```text
ID:
REQ-Q-xxx

Under:
[条件]

Metric:
[指标]

Requirement:
[阈值]
```

### 正例

```text
REQ-Q-008

Under:
存在有效恢复状态。

Metric:
Completed-stage replay count.

Requirement:
恢复后已经成功完成的研究阶段不得被重复执行。
```

### 反例

```text
恢复必须非常可靠。
```

### 重要要求

Quality Requirement 必须可观察或可度量。

---

## P2-Q3：系统必须满足哪些外部接口要求？

### 回答模板

```text
ID:
REQ-I-xxx

External Entity:
[...]

Required Interaction:
[...]

Required Observable Contract:
[...]
```

### 正例

```text
REQ-I-004

External Entity:
Research User

Required Interaction:
用户可以请求恢复某个中断任务。

Required Observable Contract:
若任务不可恢复，系统必须返回明确不可恢复状态。
```

### 反例

```text
RecoveryService 使用 REST POST /resume。
```

### 重要要求

本阶段定义的是 **External Interface Requirement**。

内部组件接口属于 P5。

---

## P2-Q4：系统有哪些不可违反的外部约束？

### 回答模板

```text
ID:
REQ-C-xxx

Constraint:
系统必须 [...]

Source:
[法律/组织/环境/兼容要求]
```

### 正例

```text
REQ-C-003

系统必须能够在进程完全退出并重新启动后恢复任务。

Source:
Operational environment.
```

### 反例

```text
系统必须使用 Redis。
```

除非这是甲方或环境明确规定的硬约束，否则属于设计决策。

---

## P2-Q5：如何判定每条需求满足？

### 回答模板

```text
Acceptance Criterion:

Given:
[...]

When:
[...]

Then:
[...]

Verification Method:
Test / Analysis / Inspection / Demonstration
```

### 正例

```text
Given:
任务已经完成 Investigation 阶段并保存有效状态。

When:
进程被终止并重新启动，用户请求恢复。

Then:
系统从下一合法阶段继续运行，
且 Investigation 不重新执行。

Verification Method:
System Test
```

### 反例

```text
测试恢复功能是否正常。
```

### 重要要求

此阶段只定义 **验证标准和方法**。

真正执行验证在 P7。

---

# P3 — Logical Decomposition

## 阶段目标

回答：

> **为了满足这些 Requirement，逻辑上必须发生哪些行为？**

这是需求和架构之间最重要的桥梁。

---

## P3-Q1：系统逻辑上必须执行哪些功能？

### 回答模板

```text
LF-xxx:
[Verb] + [Object]

Purpose:
满足 REQ-xxx
```

### 正例

```text
LF-01 Capture Execution State
LF-02 Persist Execution State
LF-03 Identify Recoverable State
LF-04 Restore Execution State
LF-05 Resume Execution
```

### 反例

```text
CheckpointService
RecoveryManager
DatabaseRepository
```

### 重要要求

逻辑功能使用：

> **动词 + 对象**

不使用模块名。

---

## P3-Q2：这些逻辑功能之间有什么控制关系？

### 回答模板

```text
LF-A
  ↓ [condition]
LF-B
  ↓
LF-C
```

### 正例

```text
Detect interruption
      ↓ recovery requested
Locate recoverable state
      ↓ state valid
Restore state
      ↓
Resume execution
```

### 反例

```text
RecoveryManager 调用 StateManager。
```

### 重要要求

这里只表达：

```text
顺序
条件
分支
循环
并行
依赖
```

不表达组件调用。

---

## P3-Q3：系统有哪些逻辑状态及状态转换？

### 回答模板

```text
STATE-A
 --[event / guard]-->
STATE-B
```

### 正例

```text
RUNNING
 --process interrupted-->
INTERRUPTED

INTERRUPTED
 --resume requested-->
RECOVERING

RECOVERING
 --valid state restored-->
RUNNING
```

### 反例

```text
数据库字段 status = 3。
```

### 重要要求

状态必须表达领域或系统行为语义，不是存储编码。

---

## P3-Q4：逻辑信息如何流动？

### 回答模板

```text
Information:
[逻辑信息]

Produced By:
[LF]

Consumed By:
[LF]
```

### 正例

```text
Information:
Recoverable Execution State

Produced By:
Persist Execution State

Consumed By:
Restore Execution State
```

### 反例

```text
execution_state 表通过 ORM 查询。
```

### 重要要求

描述 Information，不描述 Storage Schema。

---

## P3-Q5：异常情况下，逻辑行为是什么？

### 回答模板

```text
Failure:
[...]

Required Logical Response:
Detect → Decide → Result
```

### 正例

```text
Failure:
恢复状态损坏。

Required Logical Response:
识别状态无效
→ 排除该恢复状态
→ 搜索更早有效状态
→ 若不存在则声明不可恢复
```

### 反例

```text
捕获 IOError 后 retry 三次。
```

### 为什么错误

三次 retry 已经是详细设计。

---

## P3-Q6：逻辑分解产生了哪些新的派生需求？

### 回答模板

```text
ID:
DER-xxx

Derived From:
REQ-xxx / LF-xxx

Because:
[为什么逻辑上必须有这个约束]

Statement:
The system shall [...]
```

### 正例

```text
DER-004

Derived From:
REQ-F-017 / Restore Execution State

Because:
恢复逻辑必须能够区分完整状态和部分写入状态。

Statement:
Persisted execution states shall expose validity information.
```

### 反例

```text
我们觉得最好增加一个 version 字段。
```

### 重要要求

Derived Requirement 必须有推导依据。

---

# P4 — Architecture Design

## 阶段目标

回答：

> **谁承担前面定义的逻辑责任？**

本阶段正式从 Logic 转向 Structure。

---

## P4-Q1：需要哪些架构元素？

### 回答模板

```text
Element:
[名称]

Exists Because:
需要承担 [逻辑责任]
```

### 正例

```text
Element:
RecoveryCoordinator

Exists Because:
恢复任务需要一个明确的恢复流程控制责任主体。
```

### 反例

```text
增加一个 RecoveryManager，
因为大型项目通常都有 Manager。
```

### 重要要求

架构元素必须由 responsibility 推导出来。

---

## P4-Q2：每项逻辑责任由谁承担？

### 回答模板

```text
Logical Function:
LF-xxx

Primary Owner:
Component-X
```

### 正例

```text
LF-04 Restore Execution State
→ RecoveryCoordinator

LF-02 Persist Execution State
→ CheckpointRepository
```

### 反例

```text
Runtime、StateManager 和 RecoveryService
都会处理一些恢复逻辑。
```

### 重要要求

核心责任必须有一个明确 Primary Owner。

---

## P4-Q3：每个架构元素的责任边界是什么？

### 回答模板

```text
Component:
[...]

Owns:
- [...]

Does Not Own:
- [...]
```

### 正例

```text
RecoveryCoordinator

Owns:
- 恢复流程编排
- 恢复成功/失败决策

Does Not Own:
- checkpoint 持久化
- workflow 状态定义
- LLM 调用
```

### 反例

```text
RecoveryCoordinator 主要负责各种恢复相关工作。
```

### 重要要求

“Does Not Own”与“Owns”同样重要。

---

## P4-Q4：关键状态和数据归谁拥有？

### 回答模板

```text
State/Data:
[...]

Owner:
[...]

Other Components:
Read / Request / Subscribe / No Access
```

### 正例

```text
State:
Current Workflow State

Owner:
WorkflowRuntime

RecoveryCoordinator:
只能通过 WorkflowRuntime 请求恢复状态。
```

### 反例

```text
几个服务都可以修改 current_state。
```

### 重要要求

关键 mutable state 原则上只有一个 authoritative owner。

---

## P4-Q5：组件之间如何交互，依赖方向是什么？

### 回答模板

```text
Caller:
A

Dependency:
Interface-X

Provider:
B
```

### 正例

```text
RecoveryCoordinator
→ CheckpointRepository interface
→ Persistence Adapter
```

### 反例

```text
RecoveryCoordinator 可以直接访问数据库，
必要时也可以调用 WorkflowRuntime 内部方法。
```

### 重要要求

必须明确：

```text
谁依赖谁
通过什么边界
是否允许反向依赖
```

---

## P4-Q6：谁负责系统级控制和编排？

### 回答模板

```text
Process/Lifecycle:
[...]

Orchestrator:
[...]

Participants:
[...]
```

### 正例

```text
Recovery Lifecycle

Orchestrator:
RecoveryCoordinator

Participants:
CheckpointRepository
WorkflowRuntime
TraceRecorder
```

### 反例

```text
每个组件根据情况自己调用其他组件完成恢复。
```

### 重要要求

复杂流程必须有清晰 control ownership。

---

## P4-Q7：关键架构决策为什么这样选？

### 回答模板

```text
Decision:
[...]

Drivers:
[...]

Alternatives:
A / B / C

Chosen:
[...]

Reason:
[...]

Trade-offs:
[...]
```

### 正例

```text
Decision:
持久化能力通过 Repository abstraction 暴露。

Drivers:
需要替换存储实现，并隔离 Runtime 与持久化技术。

Alternatives:
A. Runtime 直接调用 SQLite
B. Repository abstraction

Chosen:
B

Trade-off:
增加一个抽象层，但减少基础设施耦合。
```

### 反例

```text
使用 Repository Pattern，因为这是最佳实践。
```

### 重要要求

架构决策必须由 driver 支撑，而不是模式崇拜。

---

# P5 — Detailed Design

## 阶段目标

回答：

> **一个架构元素内部到底怎样工作？**

完成以后，开发者应该主要执行实现，而不是重新做设计。

---

## P5-Q1：组件对外精确提供什么接口？

### 回答模板

```text
Interface:
[...]

Operation:
foo(input) -> output

Preconditions:
[...]

Postconditions:
[...]
```

### 正例

```text
Interface:
CheckpointRepository

Operation:
load_latest(execution_id) -> Checkpoint | None

Precondition:
execution_id 合法。

Postcondition:
若返回 Checkpoint，则其属于该 execution。
```

### 反例

```text
Repository 提供一些读取 checkpoint 的函数。
```

### 重要要求

接口必须精确到调用者无需猜测语义。

---

## P5-Q2：内部核心数据模型及不变量是什么？

### 回答模板

```text
Model:
[...]

Fields:
[...]

Invariant:
Always [...]
```

### 正例

```text
Checkpoint

Fields:
checkpoint_id
execution_id
stage
payload
version
validity

Invariant:
同一 checkpoint_id 的已提交内容不可改变。
```

### 反例

```text
Checkpoint 就是一个 dict。
```

### 重要要求

数据模型必须表达领域语义和约束。

---

## P5-Q3：组件内部算法或处理流程是什么？

### 回答模板

```text
Input
↓
Step 1
↓
Step 2
↓
Decision
↓
Output
```

### 正例

```text
Resume Request
↓
读取候选恢复点
↓
按版本倒序检查
↓
选择最近有效状态
↓
恢复 Workflow State
↓
返回 Recovery Result
```

### 反例

```text
调用各种 helper 完成恢复。
```

### 重要要求

算法描述局限于该组件内部。

---

## P5-Q4：错误语义是什么？

### 回答模板

```text
Condition:
[...]

Error:
[...]

Caller Responsibility:
[...]
```

### 正例

```text
Condition:
不存在有效恢复状态。

Error:
NoRecoverableCheckpoint

Caller Responsibility:
终止恢复流程并向上层报告不可恢复。
```

### 反例

```text
有异常就抛 Exception。
```

### 重要要求

不同错误必须具有不同语义。

---

## P5-Q5：并发、事务和一致性如何保证？

### 回答模板

```text
Operation:
[...]

Atomicity:
[...]

Concurrency:
[...]

Consistency Rule:
[...]
```

### 正例

```text
Operation:
Commit Checkpoint

Atomicity:
checkpoint 内容和版本元数据必须同时提交。

Concurrency:
同一 execution 的版本提交必须序列化。

Consistency:
任何可见 checkpoint 必须是完整提交状态。
```

### 反例

```text
数据库会处理并发问题。
```

### 重要要求

只要存在：

```text
并发修改
跨步骤写入
共享状态
```

这一问题就必须回答。

---

## P5-Q6：生命周期、超时、重试和幂等规则是什么？

### 回答模板

```text
Lifecycle:
[...]

Timeout:
[...]

Retry:
[...]

Idempotency:
[...]
```

### 正例

```text
Operation:
Persist Checkpoint

Retry:
存储暂时不可用时允许重试。

Idempotency:
相同 checkpoint_id 的重复提交不得生成两个逻辑 checkpoint。
```

### 反例

```text
失败以后再试几次。
```

### 重要要求

这些必须成为 contract，而不是 coder 自行决定。

---

# P6 — Implementation

## 阶段目标

回答：

> **代码是否忠实实现已经批准的设计？**

---

## P6-Q1：每段重要代码对应哪个设计元素？

### 回答模板

```text
Code:
[...]

Implements:
P5-xxx / Component-X
```

### 正例

```text
src/runtime/recovery/coordinator.py

Implements:
RecoveryCoordinator detailed design.
```

### 反例

```text
这是恢复相关代码，所以放在 runtime 目录。
```

### 重要要求

Code 必须能够追溯到 Design。

---

## P6-Q2：实现是否满足已经定义的 Contract 和 Invariant？

### 回答模板

```text
Contract:
[...]

Implementation:
[...]

Conformance:
PASS / FAIL
```

### 正例

```text
Invariant:
Committed checkpoint immutable.

Implementation:
update operation rejects modifications to committed checkpoint.

Conformance:
PASS
```

### 反例

```text
基本实现了设计。
```

---

## P6-Q3：实现是否破坏架构依赖？

### 回答模板

```text
Observed Dependency:
A → B

Allowed By Architecture:
Yes / No
```

### 正例

```text
RecoveryCoordinator
→ CheckpointRepository

Allowed:
Yes
```

### 反例

```text
为了方便，RecoveryCoordinator 直接 import SQLiteStore。
```

### 重要要求

禁止实现阶段偷偷绕过 Port / Interface。

---

## P6-Q4：是否产生了新的设计决策？

### 回答模板

```text
New Decision Required:
Yes / No

If Yes:
Affected Level:
P3 / P4 / P5

Action:
Return to design.
```

### 正例

```text
实现过程中发现两个节点可能同时恢复同一任务，
需要定义 distributed ownership。

Affected Level:
P4 Architecture

Action:
停止局部补丁，返回架构设计。
```

### 反例

```text
先加一个全局 Redis lock，后面再说。
```

### 重要要求

不得把架构决策隐藏在代码里。

---

# P7 — Verification

## 阶段目标

回答：

> **我们有没有证据证明“做对了”？**

Verification 对照的是：

```text
Requirements
Design Contracts
Interfaces
```

---

## P7-Q1：每条 Requirement 是否被验证？

### 回答模板

```text
Requirement:
REQ-xxx

Verification:
TEST-xxx

Criterion:
[...]

Result:
PASS / FAIL
```

### 正例

```text
Requirement:
REQ-F-017

Verification:
TEST-SYS-021

Criterion:
进程重启后从最近有效状态恢复，
已完成阶段不得重复。

Result:
PASS
```

### 反例

```text
测试都通过了。
```

### 重要要求

必须建立 requirement-level traceability。

---

## P7-Q2：Detailed Design 的接口和不变量是否得到验证？

### 回答模板

```text
Contract:
[...]

Test:
[...]

Evidence:
[...]
```

### 正例

```text
Contract:
Committed checkpoint immutable.

Test:
TEST-CHECKPOINT-IMMUTABLE-03

Evidence:
修改操作返回 CheckpointImmutableError。
```

### 反例

```text
Repository 单元测试覆盖率 92%。
```

### 为什么错误

Coverage 不能证明具体 Contract 成立。

---

## P7-Q3：组件集成后的交互是否正确？

### 回答模板

```text
Participants:
A + B + C

Scenario:
[...]

Expected:
[...]

Observed:
[...]
```

### 正例

```text
Participants:
RecoveryCoordinator + Repository + WorkflowRuntime

Scenario:
恢复最近 checkpoint。

Expected:
WorkflowRuntime 接收到恢复状态并继续下一阶段。

Observed:
符合预期。
```

---

## P7-Q4：异常和边界条件是否得到验证？

### 回答模板

```text
Condition:
[...]

Expected:
[...]

Result:
[...]
```

### 正例

```text
Condition:
最近 checkpoint 损坏。

Expected:
忽略该版本并选择更早合法版本。

Result:
PASS
```

### 反例

```text
Happy path 已经测试过，因此异常情况应该也没问题。
```

---

## P7-Q5：是否存在 Verification Gap？

### 回答模板

```text
REQ / Contract:
[...]

Status:
Verified / Unverified / Blocked

Reason:
[...]

Required Action:
[...]
```

### 正例

```text
REQ-Q-012:
跨机器故障恢复。

Status:
Blocked

Reason:
当前测试环境只有单节点。

Required Action:
不得将该 requirement 标记为 PASS。
```

### 重要要求

“没测”必须明确等于：

> **Unverified**

而不是默认 PASS。

---

# P8 — Validation

## 阶段目标

回答：

> **我们是不是做了真正正确的东西？**

Validation 对照的不是详细规格，而是：

```text
Problem
Stakeholder
Operational Scenario
```

---

## P8-Q1：真实 Stakeholder 能否完成原始目标？

### 回答模板

```text
Stakeholder:
[...]

Real Scenario:
[...]

Goal:
[...]

Observed Outcome:
[...]
```

### 正例

```text
Stakeholder:
Researcher

Scenario:
一个 8 小时研究任务在 Experiment 前机器重启。

Goal:
不重新执行已经完成的调研和假设阶段。

Observed Outcome:
系统成功恢复，用户无需人工重新构造任务。
```

### 反例

```text
所有 system tests 都通过，因此 Validation PASS。
```

### 为什么错误

System Test 属于 Verification，不等于 Validation。

---

## P8-Q2：P0 中定义的问题是否实际改善？

### 回答模板

```text
Original Problem:
[...]

Before:
[...]

After:
[...]

Evidence:
[...]
```

### 正例

```text
Original Problem:
长任务中断导致大量阶段重复执行。

Before:
中断后平均需要重新执行全部已完成阶段。

After:
恢复后已完成阶段重复执行数量为 0。

Evidence:
真实任务恢复实验。
```

### 反例

```text
我们增加了完整的 checkpoint 功能。
```

### 重要要求

Validation 看 Outcome，不看 Feature 数量。

---

## P8-Q3：真实运行环境下是否仍然成立？

### 回答模板

```text
Environment:
[...]

Expected:
[...]

Observed:
[...]

Gap:
[...]
```

### 正例

```text
Environment:
真实 Linux 服务器 + 外部 LLM Provider。

Observed:
进程强制退出和服务器重启后均能够恢复。
```

### 反例

```text
本地单元测试没有问题。
```

---

## P8-Q4：是否出现“规格满足但用户目标未满足”的情况？

### 回答模板

```text
Verified Requirement:
[...]

Observed User Problem:
[...]

Mismatch:
[...]
```

### 正例

```text
Verified:
所有 execution events 均被完整保存。

Observed User Problem:
恢复界面无法告诉研究者将从哪个研究阶段继续。

Mismatch:
技术追踪完整，但用户缺乏可理解的恢复状态。
```

### 重要要求

这是 Validation 中最重要的一类问题。

---

## P8-Q5：本轮开发产生了什么新的现实问题？

### 回答模板

```text
New Problem:
[...]

Impact:
[...]

Candidate Next Cycle:
P0-xxx
```

### 正例

```text
New Problem:
大量历史 checkpoint 导致任务管理界面难以判断哪个版本值得恢复。

Candidate Next Cycle:
P0-RECOVERY-USABILITY-02
```

### 反例

```text
后面再优化用户体验。
```

---

# 10. 九阶段最严格的边界

这是整个框架最重要的一张表。

| 阶段 | 可以回答 | 不应该回答 |
|---|---|---|
| P0 | 为什么有问题 | 系统怎么做 |
| P1 | 谁、在哪、怎样使用 | 内部组件如何工作 |
| P2 | 系统必须做到什么 | 哪个模块负责 |
| P3 | 逻辑上必须发生什么 | 谁负责这些逻辑 |
| P4 | 谁承担什么责任 | 类内部算法怎么写 |
| P5 | 组件内部精确怎么工作 | 重新定义系统需求 |
| P6 | 如何忠实实现设计 | 偷偷创造新架构 |
| P7 | 是否符合规格 | 用户是否真的满意 |
| P8 | 是否解决现实问题 | 某个函数有没有 bug |

---

# 11. 一条完整的正确推导链

完整工程应该能够做到：

```text
P0 Problem
研究任务中断导致重复工作
        ↓

P1 Scenario
研究人员在机器重启后希望继续任务
        ↓

P2 Requirement
系统必须支持从最近合法状态恢复
        ↓

P3 Logical Function
Capture
Persist
Identify
Restore
Resume
        ↓

P4 Architecture
WorkflowRuntime
RecoveryCoordinator
CheckpointRepository
        ↓

P5 Detailed Design
load_latest()
restore()
resume()
error semantics
consistency rules
        ↓

P6 Code
具体 implementation
        ↓

P7 Verification
中断 → 重启 → 恢复 → 不重复阶段
        ↓

P8 Validation
真实研究任务是否不再因中断造成大量重复工作
```

---

# 12. 五条最高优先级工程纪律

## Rule 1 — No Leap

禁止：

```text
用户需要恢复
↓
Redis
```

必须：

```text
Problem
↓
Requirement
↓
Logical Function
↓
Architecture
↓
Detailed Design
↓
Technology
```

---

## Rule 2 — No Orphan

任何重要：

```text
Requirement
Logical Function
Component
Interface
Test
```

都必须能够回答：

> **我的 Parent 是谁？**

---

## Rule 3 — Single Primary Ownership

每个核心责任必须有唯一主要 Owner。

禁止：

```text
A 也管
B 也管
C 有时也管
```

---

## Rule 4 — No Hidden Design

Coder 一旦需要自行决定：

```text
系统责任
状态 ownership
并发模型
生命周期
依赖方向
事务边界
```

说明 P4/P5 没完成。

---

## Rule 5 — Evidence over Claim

禁止：

```text
应该没问题
基本实现
应该很稳定
覆盖率很高
```

应该是：

```text
REQ
↓
Criterion
↓
Test
↓
Evidence
↓
PASS / FAIL
```

---

# 13. 最终可以记成九句话

```text
P0：
现实中为什么需要它？

P1：
谁在什么环境里怎样使用它？

P2：
系统必须做到什么？

P3：
为了做到这些，逻辑上必须发生什么？

P4：
谁负责让这些事情发生？

P5：
每个负责者精确怎样工作？

P6：
代码有没有忠实实现设计？

P7：
有什么证据证明规格被实现？

P8：
最终真的解决最开始的问题了吗？
```

这九个问题之间没有必要互相替代。

它们分别对应：

```text
WHY
↓
CONTEXT
↓
WHAT
↓
LOGICAL WHAT
↓
STRUCTURAL WHO
↓
DETAILED HOW
↓
BUILD
↓
PROVE CORRECTNESS
↓
PROVE VALUE
```

这就是整套方法最稳定的认知骨架。