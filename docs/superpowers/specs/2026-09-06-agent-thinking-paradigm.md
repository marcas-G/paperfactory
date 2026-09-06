# PaperFactory Agent 思考范式设计

## 问题

当前 Agent 在每个研究阶段"一步到位"地给出结果：一次 LLM 调用 → 一次工具调用 → 返回结果。缺乏深度思考、自我反思、多路径探索。

**目标：** 让 Agent 在每个阶段有"想清楚再做"的能力，类似人类的思考过程——先规划，再探索多方案，执行中反思改进，输出前验证。

## 推荐架构：分层思考引擎

```
Plan Layer（全局规划）
  └── ToT Layer（关键决策多路径探索）
        └── ReAct Loop（核心执行循环：思考→行动→观察）
              └── Reflexion（每次行动后反思改进）
                    └── CoVe Layer（输出验证：生成→验证→修正）
```

## 各阶段思考范式

| 阶段 | 主要范式 | 具体行为 |
|------|---------|---------|
| 文献搜索 | ToT + ReAct + Reflexion | 多组关键词探索→搜索→反思改进 |
| 假设生成 | ToT | 生成 3-5 候选假设→评估→选择 |
| 实验设计 | Plan + Reflexion | 规划实验流程→执行→反思修正 |
| 证据评估 | CoVe + Self-Consistency | 多次独立评估→验证→取共识 |
| 报告生成 | CoVe + Reflexion | 生成→事实验证→反思修订 |

## 实施优先级 — 全部实现（效果优先，开销不限）

### P0：基础思考循环
- **ReAct 强化** — Agent loop 显式输出 Thought 步骤
- **Plan** — 每个阶段执行前生成计划，按步骤执行

### P1：迭代改进
- **Reflexion** — 每次工具调用后反思改进（仅当前阶段内有效）
- **CoVe** — 输出前事实验证：先搜索补充来源，找不到标注不确定性，可有可无的声明删除

### P2：复杂决策
- **深度 ToT** — beam search，2-3 层，每层 k=3-5 候选评估剪枝
- **Self-Consistency** — 5-10 次独立采样取共识

### P3：对抗增强
- **Multi-Agent Debate** — 假设评估（正反辩论）+ 证据冲突解决 + 报告评审（模拟 peer review），全部使用

## 技术实现

### 1. ReAct 强化（修改 system prompt）

当前 `phase-contracts.ts` 的 system prompt 只告诉 LLM "输出 JSON"。改为：

```
你是研究 Agent。每个步骤遵循 ReAct 模式：

Thought: 分析当前情况，规划下一步行动
Action: 调用工具
Observation: 工具返回结果（系统提供）
Thought: 分析结果质量，决定是否需要更多行动
...
Final Answer: 输出结构化 JSON

重要：
- 在调用工具前先思考"为什么需要这个工具，期望得到什么"
- 收到工具结果后思考"结果质量如何，是否充分，是否需要补充"
- 如果结果不充分，反思原因并调整策略
```

### 2. Reflexion（修改 Agent loop）

在 `loop.ts` 的 tool:result 后，如果还有迭代次数，自动插入反思步骤：

```typescript
// 工具结果返回后，如果有迭代次数剩余
if (iteration < maxIterations - 1) {
  messages.push({
    role: "user",
    content: `Reflect on the tool result above:
1. Is the result sufficient for the task?
2. If not, what specific improvement should you make?
3. What action should you take next?
Think step by step, then take action.`
  });
}
```

### 3. CoVe（修改 phase-contracts.ts 输出阶段）

```
提取输出中的每个事实声明：
- 有足够来源支撑的 → 保留
- 没有来源但重要的 → 用 search 工具尝试补充来源
- 搜索后仍找不到来源但重要的 → 保留但标注"未验证，需谨慎"
- 可有可无且找不到来源的 → 删除
```

### 4. Plan（修改 phase-contracts.ts 输入阶段）

```
Before executing this phase, generate a plan:
1. What information do I need?
2. Which tools should I use and in what order?
3. How will I verify my output is complete and accurate?

Then execute the plan step by step.
```

### 5. 深度 ToT（新建 tot-engine.ts）

```typescript
interface ThoughtNode {
  thought: string;
  score: { feasibility: number; novelty: number; relevance: number };
  children: ThoughtNode[];
}

async function beamSearch(
  question: string,
  generateFn: (context: string) => Promise<string[]>,
  evaluateFn: (thought: string) => Promise<{ feasibility: number; novelty: number; relevance: number }>,
  beamWidth: number = 3,
  depth: number = 3
): Promise<ThoughtNode>
```

### 6. Self-Consistency（新建 self-consistency.ts）

```typescript
async function sampleConsensus(
  question: string,
  provider: Provider,
  samples: number = 7,
  temperature: number = 0.7
): Promise<{ answer: string; confidence: number; paths: string[] }>
```

### 7. Multi-Agent Debate（新建 debate.ts）

```typescript
interface DebateRound {
  pro: string;
  con: string;
  judge: string;
}

async function debate(
  topic: string,
  evidence: string[],
  provider: Provider,
  rounds: number = 3
): Promise<{ conclusion: string; confidence: number; debates: DebateRound[] }>
```

## 开销评估（效果优先）

| 范式 | 单阶段 LLM 调用 | 备注 |
|------|---------------|------|
| ReAct + Reflexion | 5-10 | 基础循环 |
| Plan | +1 | 阶段规划 |
| CoVe | +3-5 | 验证+修正 |
| 深度 ToT | 12-30 | beam search（仅关键阶段） |
| Self-Consistency | 5-10 | 7 次采样（评分/分类） |
| Debate | 6-9 | 3 轮 × 3 角色 |

**完整研究流程总 LLM 调用：~150-300 次（8 阶段，含 ToT/Debate/CoVe）**

## 目标效果

达到专业研究员水平：系统性思考、发现别人忽略的角度、多方案对比选择最优、自我验证减少幻觉。

## 影响范围

- `ts/src/runtime/agent/loop.ts` — ReAct + Reflexion
- `ts/src/runtime/workflows/phase-contracts.ts` — Plan + CoVe 集成
- `ts/src/runtime/workflows/self-review.ts` — CoVe 验证逻辑
- `ts/src/runtime/workflows/tot-engine.ts` — 深度 ToT（新建）
- `ts/src/runtime/workflows/self-consistency.ts` — 多次采样共识（新建）
- `ts/src/runtime/workflows/debate.ts` — 多角色辩论（新建）
- `ts/src/cognition/modes.ts` — 新认知模式（PLAN, REFLECT, VERIFY, DEBATE）
