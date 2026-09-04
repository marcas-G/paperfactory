# 按设计补齐所有测试

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 design doc 中的每条行为要求变成测试断言，确保存根无法通过测试。

**Architecture:** 逐层写测试。每层测试从 design doc 提取行为要求，写成断言。测试先跑，确认失败后，再实现缺失的代码。

**Tech Stack:** TypeScript + vitest + Effect + PostgreSQL

**Spec:** `docs/design/architecture-v3.md`

## Global Constraints

- 测试断言来源必须是 `docs/design/architecture-v3.md`，禁止从已有实现代码推导
- TDD：先看测试失败，再写实现
- 如果一个硬编码返回值的存根能让测试通过，这条测试无效
- 能调真实依赖就不 mock（真实 DB > mock DB，DeterministicProvider > mock Provider）
- 每个测试必须包含"禁止行为"断言（证明不是硬编码）
- `pnpm lint` 0 errors，`pnpm typecheck` 通过
- 覆盖率门槛：Domain ≥95%，Control ≥90%，Cognition ≥80%，Runtime ≥85%，Capability ≥70%（必须有"不是存根"的测试），API ≥80%
- 用 `import * as Schema from "@effect/schema/Schema"`，不用 `import { Schema }`
- 用 `import * as Effect from "effect/Effect"`，不用 `import { Effect }`
- `beforeEach` 从 vitest 导入

---

### Task 1: Domain 层 — 补齐不变量测试

**Files:**
- Modify: `test/domain/objects/hypothesis.test.ts`（补齐 falsificationCondition 不变量）
- Modify: `test/domain/objects/protocol.test.ts`（补齐 FROZEN 不可变不变量）
- Modify: `test/domain/objects/claim.test.ts`（补齐 scope ⊆ evidence 不变量）
- Modify: `test/domain/objects/question.test.ts`（补齐 ACTIVE 必须关联 KnowledgeItem）

**Interfaces:**
- Consumes: Domain object schemas from `src/domain/objects/`
- Produces: Tests that fail when invariants are violated

- [ ] **Step 1: 读 hypothesis.ts，提取 falsificationCondition 非空要求**

设计 §4.3 Hypothesis: "必须包含可证伪条件（falsificationCondition），否则不能作为正式假设"

- [ ] **Step 2: 写测试——hypothesis falsificationCondition 不能为空**

```typescript
it("hypothesis 必须有可证伪条件", () => {
  const h = createHypothesis({ falsificationCondition: "" });
  expect(h.falsificationCondition.length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: 跑测试，确认结果（通过=Schema 已在 enforce，失败=需要 enforce）**

```bash
cd /data/students/gaolei/paperfactory/ts && docker run --rm -v $(pwd):/app -w /app node:22-alpine sh -c "corepack enable && pnpm install --prefer-offline 2>/dev/null && pnpm vitest run test/domain/objects/hypothesis.test.ts 2>&1"
```

- [ ] **Step 4: 如果测试通过了（空字符串没被拒绝），修改 hypothesis.ts Schema 加 `Schema.NonEmptyString`**

- [ ] **Step 5: 读 protocol.ts，提取 FROZEN 不可变要求**

设计 §4.3 Protocol: "FROZEN 后不可修改（科研纪律：防止 p-hacking）"

- [ ] **Step 6: 写测试——FROZEN protocol 不能修改字段**

```typescript
it("FROZEN 后不可修改", () => {
  const p = createProtocol({ status: "FROZEN" });
  expect(() => {
    // 尝试修改
    const modified = createProtocol({ ...p, title: "hacked title" });
    // Schema 应该拒绝 FROZEN 状态的修改
  }).toThrow();
});
```

- [ ] **Step 7: 跑测试**

- [ ] **Step 8: 读 claim.ts，提取 scope ⊆ evidence 不变量**

设计 §4.3 Claim: "不变量: Claim 的范围 ⊆ 支持它的 Evidence 的范围"

- [ ] **Step 9: 写测试——claim scope 不能超过 supporting evidence**

```typescript
it("claim scope 不能超过 supporting evidence 的范围", () => {
  // claim scope "X causes Y in all conditions"
  // evidence strength 0.3 (low)
  // 应该拒绝：高范围 claim + 低 strength evidence
});
```

- [ ] **Step 10: 跑测试**

- [ ] **Step 11: 读 question.ts，提取 ACTIVE 必须关联 KnowledgeItem**

设计 §4.3 ResearchQuestion: "不变量: ACTIVE/SCOPED 必须至少关联一个 KnowledgeItem"

- [ ] **Step 12: 写测试——ACTIVE question 必须有 relatedKnowledgeIds**

```typescript
it("ACTIVE 状态的 question 必须至少关联一个 KnowledgeItem", () => {
  const q = createQuestion({ status: "ACTIVE", relatedKnowledgeIds: [] });
  // 应该拒绝：ACTIVE 但 knowledgeIds 为空
});
```

- [ ] **Step 13: 跑所有 domain 测试，确认通过**

```bash
docker run --rm -v /data/students/gaolei/paperfactory/ts:/app -w /app node:22-alpine sh -c "corepack enable && pnpm install --prefer-offline 2>/dev/null && pnpm vitest run test/domain/ 2>&1"
```

- [ ] **Step 14: lint + typecheck**

```bash
docker run --rm -v /data/students/gaolei/paperfactory/ts:/app -w /app node:22-alpine sh -c "corepack enable && pnpm install --prefer-offline 2>/dev/null && pnpm lint && pnpm typecheck"
```

---

### Task 2: Cognition 层 — 从零写测试再实现

**Files:**
- Create: `src/cognition/modes.ts` — 10 种认知模式
- Create: `src/cognition/compiler.ts` — 上下文编译
- Create: `src/cognition/prompt.ts` — Prompt 组装
- Create: `src/cognition/output.ts` — 输出验证
- Create: `src/cognition/policies.ts` — 盲审策略
- Create: `test/cognition/modes.test.ts`
- Create: `test/cognition/compiler.test.ts`
- Create: `test/cognition/prompt.test.ts`
- Create: `test/cognition/output.test.ts`
- Create: `test/cognition/policies.test.ts`

**Interfaces:**
- Consumes: Domain objects (Hypothesis, Evidence, KnowledgeItem)
- Produces: Cognition layer with modes, context compilation, prompt assembly, output validation, blind review policies

- [ ] **Step 1: 读设计 §13 认知管线，提取 modes 定义**

设计: "10 种认知模式: FRAME/EXPLORE/MAP/COMPARE/FALSIFY/DIAGNOSE/DISCRIMINATE/VERIFY/SYNTHESIZE/DECIDE"

- [ ] **Step 2: 写测试——10 种模式存在且各有不同指令（先写，不写实现）**

```typescript
import { describe, it, expect } from "vitest";
import { CognitiveMode } from "@cognition/modes";

describe("认知模式", () => {
  it("10 种模式都存在", () => {
    expect(CognitiveMode.FRAME).toBeDefined();
    expect(CognitiveMode.EXPLORE).toBeDefined();
    expect(CognitiveMode.FALSIFY).toBeDefined();
    // ... 全部 10 种
  });

  it("FALSIFY 模式的指令包含'反例'和'证伪'关键词", () => {
    const instructions = CognitiveMode.FALSIFY.instructions;
    expect(instructions.toLowerCase()).toContain("反例");
    expect(instructions.toLowerCase()).toContain("证伪");
  });

  it("VERIFY 模式的指令包含'一致性'和'验证'关键词", () => {
    const instructions = CognitiveMode.VERIFY.instructions;
    expect(instructions.toLowerCase()).toContain("一致");
  });

  it("不同模式产生不同的指令", () => {
    const modes = Object.values(CognitiveMode);
    const instructions = modes.map(m => m.instructions);
    const unique = new Set(instructions);
    expect(unique.size).toBe(instructions.length); // 每种模式指令不同
  });
});
```

- [ ] **Step 3: 跑测试，确认全部失败（文件不存在）**

```bash
cd /data/students/gaolei/paperfactory/ts && docker run --rm -v $(pwd):/app -w /app node:22-alpine sh -c "corepack enable && pnpm install --prefer-offline 2>/dev/null && pnpm vitest run test/cognition/modes.test.ts 2>&1"
```

确认失败原因：模块不存在

- [ ] **Step 4: 实现 src/cognition/modes.ts**

```typescript
// 10 种认知模式，每种有 name、instructions、适用的对象类型
export interface ModeConfig {
  name: string;
  instructions: string;
  applicableTo: string[];
}

export const CognitiveMode: Record<string, ModeConfig> = {
  FRAME: { name: "FRAME", instructions: "界定问题边界，明确研究范围。识别已知和未知的分界线。", applicableTo: ["ResearchQuestion"] },
  EXPLORE: { name: "EXPLORE", instructions: "广泛收集信息，探索可能的方向。不要过早收敛。", applicableTo: ["ResearchQuestion", "KnowledgeItem"] },
  // ... 全部 10 种
};
```

- [ ] **Step 5: 跑测试，确认通过**

- [ ] **Step 6: 写 ContextCompiler 测试**

设计: "ContextCompiler.compile → 编译 Agent 应该看到什么"
设计: "不是返回全部状态，而是按认知模式过滤相关对象"

```typescript
describe("ContextCompiler", () => {
  it("编译上下文只包含当前认知模式相关的对象", () => {
    const ctx = ContextCompiler.compile({
      state: { /* 包含 hypothesis, evidence, knowledge */ },
      mode: "FALSIFY",
    });
    expect(ctx.hypotheses.length).toBeGreaterThan(0);
    expect(ctx.knowledgeItems.some(k => k.relevance > 0)).toBe(true);
  });

  it("不包含无关对象", () => {
    const ctx = ContextCompiler.compile({
      state: { /* 包含 hypothesis, experiments, submissions */ },
      mode: "FALSIFY",
    });
    expect(ctx.submissions.length).toBe(0); // FALSIFY 不需要 submissions
  });
});
```

- [ ] **Step 7: 跑测试，确认失败**

- [ ] **Step 8: 实现 src/cognition/compiler.ts**

- [ ] **Step 9: 跑测试，确认通过**

- [ ] **Step 10: 写 PromptAssembler 测试**

设计: "PromptAssembler.assemble — 组装 Prompt，注入认知模式指令"

```typescript
describe("PromptAssembler", () => {
  it("FALSIFY 模式的 prompt 包含证伪指令", () => {
    const prompt = PromptAssembler.assemble({
      context: { /* compiled context */ },
      mode: "FALSIFY",
    });
    expect(prompt).toContain("反例");
    expect(prompt).toContain("证伪");
  });

  it("不同模式产生不同的 prompt", () => {
    const prompt1 = PromptAssembler.assemble({ context: ctx, mode: "FALSIFY" });
    const prompt2 = PromptAssembler.assemble({ context: ctx, mode: "VERIFY" });
    expect(prompt1).not.toBe(prompt2);
  });
});
```

- [ ] **Step 11: 跑测试，确认失败 → 实现 src/cognition/prompt.ts → 确认通过**

- [ ] **Step 12: 写 OutputValidator 测试**

设计: "OutputValidator.validate — 验证输出质量"

```typescript
describe("OutputValidator", () => {
  it("拒绝不符合 schema 的 LLM 输出", () => {
    const result = OutputValidator.validate({
      action: "propose_hypothesis",
      output: { statement: "X causes Y" /* 缺少 falsificationCondition */ },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("接受符合 schema 的 LLM 输出", () => {
    const result = OutputValidator.validate({
      action: "propose_hypothesis",
      output: {
        statement: "X causes Y under conditions Z",
        falsificationCondition: "If p > 0.05, hypothesis is falsified",
      },
    });
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 13: 跑测试，确认失败 → 实现 src/cognition/output.ts → 确认通过**

- [ ] **Step 14: 写盲审策略测试**

设计: "HIDE_FUTURE_RESULT / HIDE_TEST_SET / HIDE_CONFIRMATORY_RESULT / HIDE_REVIEW_OUTCOME"

```typescript
describe("Blind Review Policies", () => {
  it("HIDE_TEST_SET 隐藏测试集信息", () => {
    const ctx = ContextCompiler.compile({
      state: fullState,
      policy: "HIDE_TEST_SET",
    });
    expect(ctx.knowledgeItems).not.toContain(testSetKnowledge);
  });

  it("HIDE_FUTURE_RESULT 隐藏未发布结果", () => {
    const ctx = ContextCompiler.compile({
      state: fullState,
      policy: "HIDE_FUTURE_RESULT",
    });
    expect(ctx.results.every(r => r.status !== "RAW")).toBe(true);
  });
});
```

- [ ] **Step 15: 跑测试，确认失败 → 实现 src/cognition/policies.ts → 确认通过**

- [ ] **Step 16: 跑所有 cognition 测试，确认通过**

- [ ] **Step 17: lint + typecheck**

---

### Task 3: Capability 层 — 写"不是存根"的测试

**Files:**
- Modify: `test/capabilities/literature.test.ts` — 加"不是存根"断言
- Modify: `test/capabilities/experiment.test.ts` — 加"不是存根"断言
- Modify: `test/capabilities/writing.test.ts` — 加"不是存根"断言

**Interfaces:**
- Consumes: Existing capability stubs, Provider interface
- Produces: Tests that fail when capabilities return hardcoded data

- [ ] **Step 1: 读设计 §7 能力单元，提取 literature 能力要求**

设计: "Literature Capability = search → retrieve → parse → synthesize"

- [ ] **Step 2: 写测试——literature 搜索必须调外部 API，不能硬编码**

```typescript
describe("Literature Capability — 不是存根", () => {
  it("search 必须发起 HTTP 请求，不能返回硬编码数据", async () => {
    const { searchPapers } = require("@capabilities/literature");
    // 用 spy 拦截 HTTP 请求
    const httpSpy = jest.spyOn(globalThis, "fetch");
    const results = await searchPapers("quantum computing");
    
    // 禁止行为：必须有 HTTP 调用
    expect(httpSpy).toHaveBeenCalled();
    expect(httpSpy.mock.calls[0][0]).toContain("api"); // URL 包含 API 端点
    
    // 应该行为：结果包含真实字段
    expect(results[0].title).not.toBe("Paper A"); // 不是硬编码
    expect(results[0].abstract).toBeDefined();
  });
});
```

- [ ] **Step 3: 跑测试，确认失败（因为当前是硬编码）**

- [ ] **Step 4: 实现——literature search 调真实 Semantic Scholar API**

```typescript
// src/capabilities/literature.ts
export async function searchPapers(query: string): Promise<PaperResult[]> {
  const resp = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=10`
  );
  const data = await resp.json();
  return data.data.map(/* map to PaperResult */);
}
```

- [ ] **Step 5: 跑测试，确认通过**

- [ ] **Step 6: 写测试——experiment 必须调 Python 微服务**

```typescript
describe("Experiment Capability — 不是存根", () => {
  it("analyze 必须调 Python 微服务的 statistics 端点", async () => {
    const httpCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((...args: any[]) => {
      httpCalls.push(args[0]);
      return originalFetch(...args);
    }) as any;

    const result = await analyzeExperiment(/* data */);
    
    // 禁止行为：必须调了微服务
    expect(httpCalls.some(u => u.includes("/api/statistics/"))).toBe(true);
    expect(result.significance).not.toBe(0.85); // 不是硬编码值
  });
});
```

- [ ] **Step 7: 跑测试，确认失败**

- [ ] **Step 8: 实现——experiment analyze 调 Python 微服务**

- [ ] **Step 9: 跑测试，确认通过**

- [ ] **Step 10: 写测试——writing 必须调 LLM**

```typescript
describe("Writing Capability — 不是存根", () => {
  it("draft 必须调 Provider（不是返回模板字符串）", async () => {
    const provider = new DeterministicProvider({
      name: "writing-test",
      responses: [{ content: "Real LLM-generated draft", stopReason: "stop" }],
    });

    const result = await draftSection({
      outline: "Section 1: Introduction",
      provider,
    });

    // 禁止行为：必须调了 Provider
    expect(provider.getCallCount()).toBeGreaterThan(0);
    expect(result.draft).toBe("Real LLM-generated draft");
    expect(result.draft).not.toContain("Full draft of the document with"); // 不是模板
  });
});
```

- [ ] **Step 11: 跑测试，确认失败**

- [ ] **Step 12: 实现——writing draft 调 Provider**

- [ ] **Step 13: 跑测试，确认通过**

- [ ] **Step 14: lint + typecheck**

---

### Task 4: API 层 — 端点必须连接运行时

**Files:**
- Modify: `src/api/routes.ts` — 端点连接 Controller/Agent Loop
- Create: `test/api/api-integration.test.ts` — API 端到端测试

**Interfaces:**
- Consumes: Controller, ObjectStore, Agent Loop
- Produces: API endpoints that actually process requests

- [ ] **Step 1: 读设计 §7 Phase 7，提取 API 要求**

设计: API 应该提供 HTTP 端点操作研究对象，连接 Controller 进行状态管理

- [ ] **Step 2: 写测试——POST /api/projects 必须调 Controller**

```typescript
describe("API Integration", () => {
  it("POST /api/projects 必须创建真实项目并保存到 store", async () => {
    const app = createApp({ databaseUrl: undefined });
    const res = await app.honoApp.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).not.toBe("00000000-0000-4000-a000-000000000000"); // 不是硬编码
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/); // 合法 UUID
  });

  it("POST /api/agent/run 必须调 Agent Loop 和 Provider", async () => {
    const provider = new DeterministicProvider({
      name: "agent-test",
      responses: [{ content: "Research complete", stopReason: "stop" }],
    });
    const app = createApp({ provider });

    const res = await app.honoApp.request("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Research X" }),
    });

    expect(res.status).toBe(200);
    expect(provider.getCallCount()).toBeGreaterThan(0); // 调了 LLM
  });
});
```

- [ ] **Step 3: 跑测试，确认失败（因为端点返回硬编码 UUID，不调 LLM）**

- [ ] **Step 4: 实现——routes.ts 连接 Controller/Agent Loop**

- [ ] **Step 5: 跑测试，确认通过**

- [ ] **Step 6: lint + typecheck**

---

### Task 5: CLI — 命令必须产生真实结果

**Files:**
- Modify: `src/app/cli.ts` — 添加研究命令
- Create: `test/app/cli-e2e.test.ts` — CLI 行为测试

**Interfaces:**
- Consumes: App bootstrap, Controller
- Produces: CLI commands that create projects, run research

- [ ] **Step 1: 写测试——`init` 必须创建项目对象**

```typescript
describe("CLI Commands", () => {
  it("init 命令必须创建项目并保存到 store", async () => {
    const app = createApp();
    // 模拟 CLI init 命令
    await cliInit("Test Project");
    
    // 验证：store 中有项目相关对象
    const questions = await Effect.runPromise(app.objectStore.list("ResearchQuestion"));
    expect(questions.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

- [ ] **Step 3: 实现——CLI init 创建项目**

- [ ] **Step 4: 跑测试，确认通过**

- [ ] **Step 5: lint + typecheck**

---

### Task 6: 搜索工具 — 必须接真实 API

**Files:**
- Modify: `src/runtime/tools/builtins/search.ts` — 接 Semantic Scholar
- Modify: `test/runtime/tools/builtins/search.test.ts` — 加"不是存根"断言

- [ ] **Step 1: 写测试——search 默认 endpoint 是 Semantic Scholar**

```typescript
it("search 默认调 Semantic Scholar API", async () => {
  const httpCalls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((...args: any[]) => {
    httpCalls.push(args[0]);
    return Promise.resolve(new Response(JSON.stringify({ data: [] })));
  }) as any;

  const tool = createSearchTool();
  const result = await tool.run({ query: "quantum" });

  expect(httpCalls[0]).toContain("semanticscholar.org");
  expect(httpCalls[0]).toContain("quantum");
});
```

- [ ] **Step 2: 跑测试，确认失败**

- [ ] **Step 3: 实现——search 默认 endpoint = Semantic Scholar**

- [ ] **Step 4: 跑测试，确认通过**

- [ ] **Step 5: lint + typecheck**

---

### Task 7: 最终全量验证

- [ ] **Step 1: 跑所有测试**

```bash
docker run --rm -v /data/students/gaolei/paperfactory/ts:/app -w /app node:22-alpine sh -c "corepack enable && pnpm install --prefer-offline 2>/dev/null && pnpm test:coverage 2>&1"
```

- [ ] **Step 2: lint + typecheck**

```bash
docker run --rm -v /data/students/gaolei/paperfactory/ts:/app -w /app node:22-alpine sh -c "corepack enable && pnpm install --prefer-offline 2>/dev/null && pnpm lint && pnpm typecheck"
```

- [ ] **Step 3: 集成测试**

```bash
# 启动 PostgreSQL
docker run -d --name pf-test-pg -e POSTGRES_DB=paperfactory -e POSTGRES_USER=paperfactory -e POSTGRES_PASSWORD=paperfactory_dev -p 5433:5432 postgres:16-alpine

# 跑集成测试
docker run --rm --network host -v /data/students/gaolei/paperfactory/ts:/app -w /app -e DATABASE_URL="postgresql://paperfactory:paperfactory_dev@172.17.0.1:5433/paperfactory" node:22-alpine sh -c "corepack enable && pnpm install --prefer-offline 2>/dev/null && npx tsx src/persistence/migrate.ts && pnpm vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 4: Docker 构建**

```bash
docker build -f /data/students/gaolei/paperfactory/ts/Dockerfile --target test -t pf-ts-test /data/students/gaolei/paperfactory/ts/
```

- [ ] **Step 5: 存根替换检验**

把 capabilities 的实现替换为硬编码返回，跑测试——至少一条必须失败。如果不失败，重写测试。
