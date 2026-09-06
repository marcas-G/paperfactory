# Agent 思考范式实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PaperFactory 的研究 Agent 具备专业研究员水平的思考能力：ReAct 循环、Reflexion 反思、CoVe 验证、深度 ToT 多路径探索、Self-Consistency 共识、Multi-Agent Debate 辩论。

**Architecture:** 分层思考引擎 — Plan → ToT → ReAct+Reflexion → CoVe → Debate。每个新模块（ToT/Consistency/Debate）作为独立引擎，通过 Provider 接口调用 LLM，集成到 phase-contracts.ts 的阶段执行流程中。

**Tech Stack:** TypeScript 5.x, Effect, OpenAI-compatible provider (qwen3.6-27b local), Vitest

**Spec:** `docs/superpowers/specs/2026-09-06-agent-thinking-paradigm.md`

## Global Constraints

- Node.js 22 runtime (Docker `node:22-alpine`), local Node 8 too old — all compilation via Docker
- Build: `cd /data/students/gaolei/paperfactory && docker-compose -f docker/docker-compose.yml build ts-app`
- Test: `docker exec docker_ts-app_1 sh -c "cd /app && ./node_modules/.bin/vitest run test/PATH -v"`
- Path aliases: `@runtime/`, `@cognition/`, `@domain/`, `@persistence/`, `@api/`, `@control/`, `@capabilities/`, `@observability/`, `@evals/`, `@app/`
- Provider interface: `Provider.sendMessages(messages, options)` returns `Effect.Effect<ProviderResponse, string>`
- ProviderOptions supports `temperature` for sampling diversity
- Cognitive modes in `@cognition/modes.ts` — existing modes: FRAME, EXPLORE, MAP, COMPARE, FALSIFY, DIAGNOSE, DISCRIMINATE, VERIFY, SYNTHESIZE, DECIDE

---

### Task 1: 认知模式扩展 — 添加 PLAN, REFLECT, DEBATE 模式

**Files:**
- Modify: `ts/src/cognition/modes.ts`

**Produces:** `getCognitiveModeByName("PLAN")`, `getCognitiveModeByName("REFLECT")`, `getCognitiveModeByName("DEBATE")` 可用

- [ ] **Step 1: 添加三个新认知模式到 COGNITIVE_MODES 数组**

```typescript
{
  name: "PLAN",
  instructions:
    "在采取行动之前，先生成详细的执行计划。明确：需要哪些信息、使用什么工具、按什么顺序执行、如何验证结果。计划应该具体、可执行、可验证。",
  applicableTo: [
    "ResearchQuestion",
    "Protocol",
    "Experiment",
    "Report",
  ],
},
{
  name: "REFLECT",
  instructions:
    "在行动后反思结果质量。问自己：结果充分吗？有什么不足之处？下次可以改进什么？基于反思调整后续策略。反思要具体，指出明确的问题和改进方向。",
  applicableTo: [
    "KnowledgeItem",
    "Evidence",
    "Result",
    "Hypothesis",
  ],
},
{
  name: "DEBATE",
  instructions:
    "扮演对立角色进行辩论。支持方论证观点的合理性，反对方寻找漏洞和反例，裁判基于证据做出裁决。辩论应该基于证据和逻辑，而非立场。多轮辩论后达成共识。",
  applicableTo: [
    "Hypothesis",
    "Evidence",
    "Report",
    "Submission",
  ],
},
```

- [ ] **Step 2: 构建验证**

```bash
docker-compose -f docker/docker-compose.yml build ts-app
```

- [ ] **Step 3: Commit**

```bash
git add ts/src/cognition/modes.ts
git commit -m "feat(cognition): add PLAN, REFLECT, DEBATE cognitive modes"
```

---

### Task 2: ReAct 强化 + Reflexion — 修改 Agent loop

**Files:**
- Modify: `ts/src/runtime/agent/loop.ts`

**Consumes:** `CognitiveMode` from `@cognition/modes.ts`

**Produces:** Agent loop 在每轮 tool result 后自动插入 Reflexion 步骤

- [ ] **Step 1: 写测试**

创建 `ts/test/runtime/agent/react-reflexion.test.ts`：

```typescript
import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "@runtime/agent/loop";
import { Provider } from "@runtime/provider";
import { ToolRegistry } from "@runtime/tools/registry";

// Mock Provider that returns predictable responses
function createMockProvider(responses: Array<{ content: string; toolCalls?: Array<{ toolCallId: string; toolName: string; arguments: Record<string, unknown> }> }>): Provider {
  let callIndex = 0;
  return {
    sendMessages: vi.fn().mockImplementation(() => {
      const resp = responses[callIndex % responses.length];
      callIndex++;
      return {
        effectType: "Effect" as any,
        _tag: "Single" as any,
        value: { content: resp.content, toolCalls: resp.toolCalls, stopReason: "stop" }
      };
    }),
    streamResponse: vi.fn(),
  };
}

describe("ReAct + Reflexion in Agent Loop", () => {
  it("emits thinking event before each iteration", async () => {
    const events: any[] = [];
    const provider = createMockProvider([{ content: "Done", toolCalls: [] }]);
    const registry = new ToolRegistry();

    const result = await runAgentLoop(provider, registry, [
      { role: "user", content: "Test" }
    ], { onEvent: (e) => events.push(e) });

    const thinkingEvents = events.filter(e => e.type === "thinking");
    expect(thinkingEvents.length).toBeGreaterThan(0);
  });

  it("emits tool:calling and tool:result events", async () => {
    const events: any[] = [];
    registry.addTool({
      name: "test_tool",
      description: "test",
      execute: () => ({ content: "tool output" }),
    } as any);

    // ... test tool call events
  });
});
```

- [ ] **Step 2: 修改 loop.ts 添加 Reflexion**

在 `tool:result` event 发射后（第 118 行之后），如果有迭代次数剩余，自动插入反思步骤：

```typescript
// 在 messages.push({ role: "tool", content: toolOutput.content || "" }) 之后
// 检查是否还有迭代次数用于反思
if (iteration < maxIterations - 1) {
  const reflectMode = (await import("@cognition/modes")).getCognitiveModeByName("REFLECT");
  const reflectInstruction = reflectMode?.instructions || "";
  
  messages.push({
    role: "user",
    content: `${reflectInstruction}\n\nReflect on the tool result above:\n1. Is the result sufficient?\n2. What can be improved?\n3. What action should you take next?`
  });
  
  realEmit({
    type: "thinking",
    content: "反思工具结果，规划下一步行动",
    iteration,
  });
}
```

- [ ] **Step 3: 构建验证 + 测试**

```bash
docker-compose -f docker/docker-compose.yml build ts-app
docker exec docker_ts-app_1 sh -c "cd /app && ./node_modules/.bin/vitest run test/runtime/agent/react-reflexion.test.ts -v"
```

- [ ] **Step 4: Commit**

```bash
git add ts/src/runtime/agent/loop.ts ts/test/runtime/agent/react-reflexion.test.ts
git commit -m "feat(agent): ReAct reinforcement + Reflexion in agent loop"
```

---

### Task 3: 深度 ToT Engine — Beam Search 多路径探索

**Files:**
- Create: `ts/src/runtime/workflows/tot-engine.ts`
- Create: `ts/test/runtime/workflows/tot-engine.test.ts`

**Consumes:** `Provider` from `@runtime/provider`

**Produces:** `beamSearch(question, provider, beamWidth?, depth?)` 返回最优思考路径

- [ ] **Step 1: 写测试（TDD）**

```typescript
import { describe, it, expect } from "vitest";
import { beamSearch } from "@runtime/workflows/tot-engine";
import { createDeterministicProvider } from "@runtime/provider-deterministic";

describe("Tree of Thoughts Engine", () => {
  it("generates multiple candidate thoughts and selects best", async () => {
    // Mock provider that returns different thoughts per call
    const provider = createDeterministicProvider({ /* ... */ });
    
    const result = await beamSearch(
      "What hypothesis should we test about transformers?",
      provider,
      { beamWidth: 3, depth: 2 }
    );
    
    expect(result.bestPath).toBeDefined();
    expect(result.exploredCount).toBeGreaterThan(3);
    expect(result.bestScore.relevance).toBeGreaterThan(0);
  });

  it("prunes low-scoring paths", async () => {
    // ... verify beam search pruning
  });

  it("returns empty result when no viable thoughts", async () => {
    // ... verify graceful degradation
  });
});
```

- [ ] **Step 2: 实现 tot-engine.ts**

```typescript
import { Provider, Message } from "@runtime/provider";
import * as Effect from "effect/Effect";

export interface ThoughtNode {
  thought: string;
  score: { feasibility: number; novelty: number; relevance: number };
  children: ThoughtNode[];
  parent?: ThoughtNode;
}

export interface BeamSearchResult {
  bestPath: ThoughtNode[];
  exploredCount: number;
  bestScore: { feasibility: number; novelty: number; relevance: number };
}

export async function beamSearch(
  question: string,
  provider: Provider,
  options: {
    beamWidth?: number;
    depth?: number;
    systemPrompt?: string;
  } = {}
): Promise<BeamSearchResult> {
  const { beamWidth = 3, depth = 3, systemPrompt } = options;
  let exploredCount = 0;
  
  const generatePrompt = (context: string): string => 
    `Generate ${beamWidth} distinct candidate thoughts for: ${context}\nEach thought should be a unique approach.\nSeparate thoughts with "---"\n`;
  
  const evaluatePrompt = (thoughts: string[]): string =>
    `Evaluate each thought on feasibility(1-10), novelty(1-10), relevance(1-10):\n${thoughts.map((t, i) => `${i + 1}: ${t}`).join('\n')}\nReturn JSON: [{"feasibility": N, "novelty": N, "relevance": N}]`;

  let currentNodes: ThoughtNode[] = [{
    thought: question,
    score: { feasibility: 5, novelty: 5, relevance: 5 },
    children: [],
  }];

  for (let d = 0; d < depth; d++) {
    const allChildren: ThoughtNode[] = [];
    
    for (const node of currentNodes) {
      const context = `${node.thought}`;
      const genResponse = await Effect.runPromise(
        provider.sendMessages([
          { role: "system", content: systemPrompt || "You are an expert researcher exploring multiple solution paths." },
          { role: "user", content: generatePrompt(context) }
        ])
      );
      
      const thoughts = genResponse.content.split("---").map(t => t.trim()).filter(Boolean);
      
      if (thoughts.length === 0) continue;
      
      exploredCount += thoughts.length;
      
      const evalResponse = await Effect.runPromise(
        provider.sendMessages([
          { role: "system", content: "You evaluate research approaches objectively." },
          { role: "user", content: evaluatePrompt(thoughts) }
        ])
      );
      
      const scores = parseScores(evalResponse.content, thoughts.length);
      
      for (let i = 0; i < thoughts.length; i++) {
        allChildren.push({
          thought: thoughts[i],
          score: scores[i] || { feasibility: 5, novelty: 5, relevance: 5 },
          children: [],
          parent: node,
        });
      }
    }
    
    // Beam search: keep top beamWidth nodes by average score
    allChildren.sort((a, b) => {
      const scoreA = (a.score.feasibility + a.score.novelty + a.score.relevance) / 3;
      const scoreB = (b.score.feasibility + b.score.novelty + b.score.relevance) / 3;
      return scoreB - scoreA;
    });
    
    currentNodes = allChildren.slice(0, beamWidth);
    
    for (const child of currentNodes) {
      const parentNode = findParent(currentNodes, child);
      if (parentNode) parentNode.children.push(child);
    }
  }
  
  const bestNode = currentNodes[0];
  const bestPath = tracePath(bestNode);
  
  return {
    bestPath,
    exploredCount,
    bestScore: bestNode?.score || { feasibility: 0, novelty: 0, relevance: 0 },
  };
}

function parseScores(jsonStr: string, count: number): Array<{ feasibility: number; novelty: number; relevance: number }> {
  try {
    const match = jsonStr.match(/\[[\s\S]*\]/);
    if (!match) return Array(count).fill({ feasibility: 5, novelty: 5, relevance: 5 });
    return JSON.parse(match[0]).slice(0, count);
  } catch {
    return Array(count).fill({ feasibility: 5, novelty: 5, relevance: 5 });
  }
}

function tracePath(node: ThoughtNode): ThoughtNode[] {
  const path: ThoughtNode[] = [];
  let current: ThoughtNode | undefined = node;
  while (current) {
    path.unshift(current);
    current = current.parent;
  }
  return path;
}

function findParent(nodes: ThoughtNode[], child: ThoughtNode): ThoughtNode | undefined {
  return child.parent;
}
```

- [ ] **Step 3: 构建验证 + 测试**

```bash
docker-compose -f docker/docker-compose.yml build ts-app
docker exec docker_ts-app_1 sh -c "cd /app && ./node_modules/.bin/vitest run test/runtime/workflows/tot-engine.test.ts -v"
```

- [ ] **Step 4: Commit**

```bash
git add ts/src/runtime/workflows/tot-engine.ts ts/test/runtime/workflows/tot-engine.test.ts
git commit -m "feat(runtime): deep ToT beam search engine"
```

---

### Task 4: Self-Consistency Engine — 多次采样取共识

**Files:**
- Create: `ts/src/runtime/workflows/self-consistency.ts`
- Create: `ts/test/runtime/workflows/self-consistency.test.ts`

**Consumes:** `Provider` from `@runtime/provider`

**Produces:** `sampleConsensus(question, provider, samples?, temperature?)` 返回共识答案和置信度

- [ ] **Step 1: 写测试（TDD）**

```typescript
describe("Self-Consistency Engine", () => {
  it("generates multiple independent paths and returns consensus", async () => {
    const provider = createDeterministicProvider({
      responses: [
        { content: "Supporting" },
        { content: "Supporting" },
        { content: "Supporting" },
        { content: "Contradicting" },
        { content: "Supporting" },
        { content: "Supporting" },
        { content: "Supporting" },
      ]
    });
    
    const result = await sampleConsensus(
      "Does evidence support this hypothesis?",
      provider,
      { samples: 7, temperature: 0.7 }
    );
    
    expect(result.answer).toBe("Supporting");
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.paths.length).toBe(7);
  });

  it("returns low confidence when paths disagree", async () => {
    // ... 3 Supporting, 4 Contradicting → confidence < 0.6
  });
});
```

- [ ] **Step 2: 实现 self-consistency.ts**

```typescript
import { Provider, Message } from "@runtime/provider";
import * as Effect from "effect/Effect";

export interface ConsensusResult {
  answer: string;
  confidence: number;
  paths: string[];
  distribution: Map<string, number>;
}

export async function sampleConsensus(
  question: string,
  provider: Provider,
  options: {
    samples?: number;
    temperature?: number;
    systemPrompt?: string;
    normalizeFn?: (raw: string) => string;
  } = {}
): Promise<ConsensusResult> {
  const { samples = 7, temperature = 0.7, systemPrompt, normalizeFn } = options;
  const paths: string[] = [];
  
  for (let i = 0; i < samples; i++) {
    const response = await Effect.runPromise(
      provider.sendMessages([
        { role: "system", content: systemPrompt || "You are an expert researcher. Provide your independent assessment." },
        { role: "user", content: `${question}\n\nProvide your answer concisely.` }
      ], { temperature })
    );
    
    const normalized = normalizeFn 
      ? normalizeFn(response.content.trim())
      : response.content.trim().toLowerCase().substring(0, 50);
    
    paths.push(normalized);
  }
  
  // Count consensus
  const distribution = new Map<string, number>();
  for (const path of paths) {
    distribution.set(path, (distribution.get(path) || 0) + 1);
  }
  
  let maxCount = 0;
  let consensusAnswer = paths[0] || "";
  for (const [answer, count] of distribution) {
    if (count > maxCount) {
      maxCount = count;
      consensusAnswer = answer;
    }
  }
  
  return {
    answer: consensusAnswer,
    confidence: maxCount / samples,
    paths,
    distribution,
  };
}
```

- [ ] **Step 3: 构建验证 + 测试**

```bash
docker-compose -f docker/docker-compose.yml build ts-app
docker exec docker_ts-app_1 sh -c "cd /app && ./node_modules/.bin/vitest run test/runtime/workflows/self-consistency.test.ts -v"
```

- [ ] **Step 4: Commit**

```bash
git add ts/src/runtime/workflows/self-consistency.ts ts/test/runtime/workflows/self-consistency.test.ts
git commit -m "feat(runtime): self-consistency engine with multiple sampling"
```

---

### Task 5: Multi-Agent Debate Engine

**Files:**
- Create: `ts/src/runtime/workflows/debate.ts`
- Create: `ts/test/runtime/workflows/debate.test.ts`

**Consumes:** `Provider` from `@runtime/provider`

**Produces:** `debate(topic, evidence, provider, rounds?)` 返回辩论结论和置信度

- [ ] **Step 1: 写测试（TDD）**

```typescript
describe("Multi-Agent Debate Engine", () => {
  it("conducts multi-round debate between pro and con agents", async () => {
    const provider = createDeterministicProvider({
      responses: [
        { content: "Pro: The evidence strongly supports this hypothesis because..." },
        { content: "Con: However, the sample size is too small to draw conclusions..." },
        { content: "Judge: Based on the debate, the hypothesis is plausible but needs more evidence." },
      ]
    });
    
    const result = await debate(
      "Does caffeine improve memory?",
      ["Study A: 12% improvement", "Study B: no significant effect"],
      provider,
      { rounds: 1 }
    );
    
    expect(result.debates.length).toBe(1);
    expect(result.conclusion).toBeDefined();
  });

  it("conducts multiple rounds of debate", async () => {
    // ... 3 rounds
  });
});
```

- [ ] **Step 2: 实现 debate.ts**

```typescript
import { Provider } from "@runtime/provider";
import * as Effect from "effect/Effect";

export interface DebateRound {
  round: number;
  pro: string;
  con: string;
  judge: string;
}

export interface DebateResult {
  conclusion: string;
  confidence: number;
  debates: DebateRound[];
}

export async function debate(
  topic: string,
  evidence: string[],
  provider: Provider,
  options: { rounds?: number } = {}
): Promise<DebateResult> {
  const { rounds = 3 } = options;
  const debates: DebateRound[] = [];
  
  for (let r = 1; r <= rounds; r++) {
    const context = `Topic: ${topic}\nEvidence: ${evidence.join('; ')}\n${r > 1 ? `\nPrevious debate summary: ${debates.map(d => `${d.pro} | ${d.con} | ${d.judge}`).join('; ')}` : ''}`;
    
    // Pro agent
    const proResponse = await Effect.runPromise(
      provider.sendMessages([
        { role: "system", content: "You are a research advocate. Argue IN FAVOR of the topic based on the evidence. Be thorough and cite specific evidence." },
        { role: "user", content: context }
      ])
    );
    
    // Con agent
    const conResponse = await Effect.runPromise(
      provider.sendMessages([
        { role: "system", content: "You are a research skeptic. Argue AGAINST the topic. Find flaws, gaps, and alternative explanations. Be rigorous." },
        { role: "user", content: `${context}\nPro argument: ${proResponse.content}` }
      ])
    );
    
    // Judge agent
    const judgeResponse = await Effect.runPromise(
      provider.sendMessages([
        { role: "system", content: "You are an impartial research judge. Evaluate both arguments based on evidence quality and logical reasoning. Give a verdict with confidence score (0-1)." },
        { role: "user", content: `${context}\nPro: ${proResponse.content}\nCon: ${conResponse.content}\n\nGive your verdict and confidence score.` }
      ])
    );
    
    debates.push({
      round: r,
      pro: proResponse.content,
      con: conResponse.content,
      judge: judgeResponse.content,
    });
  }
  
  // Extract conclusion from final judge
  const finalJudge = debates[debates.length - 1]?.judge || "";
  const confidenceMatch = finalJudge.match(/(\d+\.?\d*)\s*(?:confidence|%|\/10)/i);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) / (confidenceMatch[0].includes('/') ? 10 : 1) : 0.5;
  
  return {
    conclusion: finalJudge,
    confidence: Math.min(confidence, 1.0),
    debates,
  };
}
```

- [ ] **Step 3: 构建验证 + 测试**

```bash
docker-compose -f docker/docker-compose.yml build ts-app
docker exec docker_ts-app_1 sh -c "cd /app && ./node_modules/.bin/vitest run test/runtime/workflows/debate.test.ts -v"
```

- [ ] **Step 4: Commit**

```bash
git add ts/src/runtime/workflows/debate.ts ts/test/runtime/workflows/debate.test.ts
git commit -m "feat(runtime): multi-agent debate engine"
```

---

### Task 6: CoVe 验证层 — 集成到 phase-contracts

**Files:**
- Modify: `ts/src/runtime/workflows/phase-contracts.ts`
- Modify: `ts/src/runtime/workflows/self-review.ts`

**Consumes:** ToT, Self-Consistency, Debate engines from Tasks 3-5

**Produces:** Phase execution includes Plan → ReAct+Reflexion → CoVe verification chain

- [ ] **Step 1: 修改 system prompt 加入 ReAct + Plan 模式**

在 `buildSystemPrompt` 函数中，加入 ReAct 格式要求和 Plan 指令：

```typescript
function buildSystemPrompt(contract: PhaseIOContract, question: string, context: string): string {
  const reactInstructions = `You are a research agent following the ReAct pattern:

Thought: Analyze the current situation and plan your next action
Action: Call a tool with specific parameters
Observation: Review tool output (provided by system)
Thought: Analyze result quality, decide if more action is needed
... (repeat)
Final Answer: Output structured JSON

Important:
- Before calling tools, think about WHY you need this tool and WHAT you expect
- After receiving results, think about quality and sufficiency
- If results are insufficient, reflect on why and adjust strategy`;

  const planInstructions = `\n\nBefore starting, generate a plan:
1. What information do I need?
2. Which tools should I use and in what order?
3. How will I verify my output is complete and accurate?
Then execute the plan step by step.`;

  // ... existing system prompt + reactInstructions + planInstructions
}
```

- [ ] **Step 2: 在 runPhase 中添加 CoVe 验证**

在 self-review 之前（第 400 行附近），添加 CoVe 验证步骤：

```typescript
// Step 3c: CoVe verification (before self-review)
if (rawOutput && rawOutput.trim().length > 0) {
  const verificationResult = await chainOfVerification(rawOutput, contract.name, provider, toolRegistry);
  if (verificationResult.revisedOutput) {
    rawOutput = verificationResult.revisedOutput;
  }
  
  onEvent({
    type: "self:review",
    content: `CoVe 验证: ${verificationResult.issues.length} 个问题被发现并修正`,
    phase: contract.name,
    timestamp: new Date().toISOString(),
    passed: verificationResult.issues.length === 0,
    issues: verificationResult.issues,
  });
}
```

- [ ] **Step 3: 实现 chainOfVerification 函数**

在 `phase-contracts.ts` 或新建 `cove.ts` 中：

```typescript
async function chainOfVerification(
  output: string,
  phaseName: string,
  provider: Provider,
  toolRegistry?: ToolRegistry
): Promise<{ revisedOutput: string | null; issues: Array<{ claim: string; status: string }> }> {
  // Step 1: Extract claims
  const extractResponse = await Effect.runPromise(
    provider.sendMessages([
      { role: "system", content: "Extract every factual claim from this research output. Return as JSON array of strings." },
      { role: "user", content: output }
    ])
  );
  
  const claims = parseClaims(extractResponse.content);
  const issues: Array<{ claim: string; status: string }> = [];
  let revised = output;
  
  // Step 2: Verify each claim
  for (const claim of claims) {
    const verifyResponse = await Effect.runPromise(
      provider.sendMessages([
        { role: "system", content: "Verify this claim. Is it supported by the available evidence? Return JSON: { status: 'VERIFIED'|'NOT_VERIFIED'|'CONTRADICTED', reason: '...', important: true/false }" },
        { role: "user", content: `Claim: ${claim}\n\nAvailable context from ${phaseName} phase.` }
      ])
    );
    
    const verification = parseVerification(verifyResponse.content);
    
    if (verification.status === 'CONTRADICTED') {
      issues.push({ claim, status: 'CONTRADICTED' });
      revised = revised.replace(claim, `[CONTRADICTED: ${claim}]`);
    } else if (verification.status === 'NOT_VERIFIED' && verification.important) {
      // Try to search for verification
      if (toolRegistry && toolRegistry.has('search')) {
        const searchResult = await searchVerify(claim, toolRegistry, provider);
        if (searchResult.verified) {
          issues.push({ claim, status: 'VERIFIED_BY_SEARCH' });
        } else {
          issues.push({ claim, status: 'UNVERIFIED_IMPORTANT' });
          revised = revised.replace(claim, `${claim} [未验证，需谨慎]`);
        }
      } else {
        issues.push({ claim, status: 'UNVERIFIED_IMPORTANT' });
        revised = revised.replace(claim, `${claim} [未验证，需谨慎]`);
      }
    } else if (verification.status === 'NOT_VERIFIED' && !verification.important) {
      // Remove unimportant unverifiable claims
      issues.push({ claim, status: 'REMOVED_UNIMPORTANT' });
      revised = revised.replace(claim, '');
    }
  }
  
  return {
    revisedOutput: revised !== output ? revised : null,
    issues,
  };
}
```

- [ ] **Step 4: 构建验证**

```bash
docker-compose -f docker/docker-compose.yml build ts-app
```

- [ ] **Step 5: Commit**

```bash
git add ts/src/runtime/workflows/phase-contracts.ts ts/src/runtime/workflows/self-review.ts
git commit -m "feat(phase-contracts): CoVe verification layer + ReAct+Plan system prompt"
```

---

### Task 7: 集成思考范式到各研究阶段

**Files:**
- Modify: `ts/src/runtime/workflows/phase-contracts.ts`
- Modify: `ts/src/runtime/workflows/agent-research.ts`

**Consumes:** ToT (Task 3), Self-Consistency (Task 4), Debate (Task 5), CoVe (Task 6)

**Produces:** 各研究阶段使用对应的思考范式

- [ ] **Step 1: 文献搜索阶段 — ToT 关键词探索**

在 `buildPhaseContext` 的 literature_search 分支中，先用 ToT 探索关键词策略：

```typescript
if (contract.name === "literature_search") {
  const totResult = await beamSearch(
    `Generate search keyword strategies for: ${question}`,
    provider,
    { beamWidth: 3, depth: 2 }
  );
  
  context += `\n\nRecommended search strategies from ToT exploration:\n${totResult.bestPath.map(n => n.thought).join('\n')}`;
}
```

- [ ] **Step 2: 假设生成阶段 — ToT + Debate**

在 `parseAgentOutput` 的 hypothesis_generation 分支中：

```typescript
if (contract.name === "hypothesis_generation") {
  // ToT to generate candidate hypotheses
  const totResult = await beamSearch(
    `Generate candidate hypotheses from literature findings for: ${question}`,
    provider,
    { beamWidth: 5, depth: 2 }
  );
  
  // Debate to evaluate hypotheses
  const hypotheses = extractHypotheses(totResult.bestPath.map(n => n.thought));
  for (const hypothesis of hypotheses.slice(0, 3)) {
    const debateResult = await debate(
      hypothesis,
      context,
      provider,
      { rounds: 3 }
    );
    // Use debate conclusion to select best hypothesis
  }
}
```

- [ ] **Step 3: 证据评估阶段 — Self-Consistency**

```typescript
if (contract.name === "evidence_assessment") {
  // Self-consistency for evidence scoring
  const evidenceItems = extractEvidence(output);
  for (const evidence of evidenceItems) {
    const consensus = await sampleConsensus(
      `Rate this evidence on relevance, reliability, and impact (1-10 each):\n${evidence.summary}`,
      provider,
      { samples: 7, temperature: 0.7 }
    );
    // Use consensus scores
  }
}
```

- [ ] **Step 4: 报告生成阶段 — Debate (peer review simulation)**

```typescript
if (contract.name === "report_generation") {
  const debateResult = await debate(
    `Peer review of research report on: ${question}`,
    [rawOutput],
    provider,
    { rounds: 3 }
  );
  // Incorporate peer review feedback into report
}
```

- [ ] **Step 5: 构建验证**

```bash
docker-compose -f docker/docker-compose.yml build ts-app
```

- [ ] **Step 6: Commit**

```bash
git add ts/src/runtime/workflows/phase-contracts.ts ts/src/runtime/workflows/agent-research.ts
git commit -m "feat(workflows): integrate thinking paradigms into research phases"
```

---

### Task 8: 构建验证 + 端到端测试

**Files:**
- Create: `ts/test/e2e/thinking-paradigms.test.ts`

- [ ] **Step 1: 写端到端测试**

```typescript
describe("E2E: Thinking Paradigms Integration", () => {
  it("ReAct loop produces thinking events", async () => {
    // Verify agent loop emits thinking events
  });

  it("ToT explores multiple paths in hypothesis generation", async () => {
    // Verify ToT engine is called during hypothesis phase
  });

  it("Self-Consistency used for evidence scoring", async () => {
    // Verify multiple samples for evidence assessment
  });

  it("Debate conducted for hypothesis evaluation", async () => {
    // Verify debate engine called
  });

  it("CoVe verification catches unsupported claims", async () => {
    // Inject output with fake claim, verify CoVe catches it
  });
});
```

- [ ] **Step 2: Docker 构建**

```bash
docker-compose -f docker/docker-compose.yml build ts-app
```

- [ ] **Step 3: 全量测试**

```bash
docker exec docker_ts-app_1 sh -c "cd /app && ./node_modules/.bin/vitest run -v"
```

- [ ] **Step 4: Commit**

```bash
git add ts/test/e2e/thinking-paradigms.test.ts
git commit -m "test(e2e): thinking paradigms integration tests"
```

---

## Spec Coverage Check

| Spec Section | Task(s) |
|-------------|---------|
| ReAct 强化 | Task 2 |
| Reflexion | Task 2 |
| Plan | Task 6 |
| CoVe | Task 6 |
| 深度 ToT | Task 3 |
| Self-Consistency | Task 4 |
| Multi-Agent Debate | Task 5 |
| 阶段集成（文献搜索→ToT, 假设→Debate, 证据→SelfCons, 报告→Debate） | Task 7 |
| 认知模式扩展（PLAN/REFLECT/DEBATE） | Task 1 |
| 端到端验证 | Task 8 |

## Type Consistency Check

- `ThoughtNode` — defined in tot-engine.ts, consumed by Task 7
- `ConsensusResult` — defined in self-consistency.ts, consumed by Task 7
- `DebateResult` — defined in debate.ts, consumed by Task 7
- `CognitiveMode` — defined in modes.ts, extended by Task 1, consumed by Task 2
- `Provider.sendMessages` — used by all engines (Tasks 2-7), existing interface
- All new engines use existing `Provider` interface, no new dependencies
