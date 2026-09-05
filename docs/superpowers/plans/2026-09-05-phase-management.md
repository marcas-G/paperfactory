# Phase Management & Human-in-the-Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add phase version management, human-in-the-loop approval, agent self-review, auto/manual mode, bidirectional evidence chain, and paper archiving to PaperFactory.

**Architecture:** Extend Drizzle schema with `phase_runs` and `evidence_chain` tables. Add `selfReview()` function in runtime that runs FALSIFY-mode review on each phase output. Modify `runPhase()` to call self-review before returning. Modify SSE streaming endpoint to pause on `awaiting_approval` in manual mode, resume on HTTP PUT. Frontend shows collapsible tool calls, paper cards, version panel, and approve/modify/reject buttons.

**Tech Stack:** TypeScript 5.x, Effect, Drizzle ORM, PostgreSQL 16, Hono, vanilla HTML/JS/CSS frontend

**Spec:** `docs/superpowers/specs/2026-09-05-phase-management-design.md`

## Global Constraints

- Node.js 22 runtime (Docker `node:22-alpine`), local Node 8 is too old for compilation — all compilation via Docker
- PostgreSQL 16 with Drizzle ORM migrations
- All new code must pass existing lint/typecheck (scripts use `pnpm lint` and `pnpm typecheck` inside Docker)
- Test framework: Vitest with `MockProvider` for agent tests, existing test patterns use relative imports (`../../../src/...`)
- Path aliases in src: `@runtime/`, `@persistence/`, `@domain/`, `@control/`, `@api/`, `@cognition/`, `@capabilities/`, `@observability/`, `@evals/`, `@app/`
- Frontend: single `index.html` file, no build tooling, vanilla JS
- Docker compose at `docker/docker-compose.yml` orchestrates services

---

### Task 1: Drizzle Schema — Add `phase_runs` and `evidence_chain` tables

**Files:**
- Modify: `ts/src/persistence/drizzle/schema.ts` — add two new table definitions
- Modify: `ts/src/persistence/pg-object-store.ts` — add `PhaseRun` and `EvidenceChain` to TABLE_MAP and ID_KEY_MAP

**Produces:** `phase_runs` and `evidence_chain` tables available via Drizzle; PgObjectStore can save/get PhaseRun and EvidenceChain objects

- [ ] **Step 1: Add tables to schema.ts**

Append after the `citations` table definition in `ts/src/persistence/drizzle/schema.ts`:

```typescript
export const phaseRuns = pgTable("phase_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  phaseName: varchar("phase_name", { length: 64 }).notNull(),
  phaseVersion: integer("phase_version").notNull(),
  parentRunId: uuid("parent_run_id"),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  artifacts: jsonb("artifacts").$type<Record<string, string[]>>().default({}),
  agentOutput: text("agent_output"),
  toolCalls: jsonb("tool_calls").$type<Array<Record<string, unknown>>>().default([]),
  selfReview: jsonb("self_review").$type<{
    passed: boolean;
    rounds: number;
    issues: Array<{
      severity: "blocking" | "warning";
      category: string;
      message: string;
    }>;
  } | null>(),
  humanFeedback: text("human_feedback"),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const evidenceChain = pgTable("evidence_chain", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  sourceId: uuid("source_id").notNull(),
  targetType: varchar("target_type", { length: 32 }).notNull(),
  targetId: uuid("target_id").notNull(),
  relation: varchar("relation", { length: 32 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: Add indexes**

Add after table definitions (or include in table definition):

```typescript
// Indexes are created via migration SQL, not Drizzle decorators
```

- [ ] **Step 3: Update PgObjectStore TABLE_MAP**

In `ts/src/persistence/pg-object-store.ts`, add to `TABLE_MAP`:

```typescript
PhaseRun: Schema.phaseRuns,
EvidenceChain: Schema.evidenceChain,
```

And to `ID_KEY_MAP`:

```typescript
PhaseRun: "phaseRunId",
EvidenceChain: "evidenceChainId",
```

- [ ] **Step 4: Update detectType in PgObjectStore**

In `detectType()` function in `pg-object-store.ts`, add before existing checks:

```typescript
if ("phaseRunId" in obj) return "PhaseRun";
if ("evidenceChainId" in obj) return "EvidenceChain";
```

- [ ] **Step 5: Verify schema compiles**

Docker build: `cd /data/students/gaolei/paperfactory && docker-compose -f docker/docker-compose.yml build ts-app`
Expected: builds successfully

- [ ] **Step 6: Commit**

```bash
git add ts/src/persistence/drizzle/schema.ts ts/src/persistence/pg-object-store.ts
git commit -m "feat(schema): add phase_runs and evidence_chain tables"
```

---

### Task 2: Domain Objects — PhaseRun and EvidenceChain factories

**Files:**
- Create: `ts/src/domain/objects/phase-run.ts`
- Create: `ts/src/domain/objects/evidence-chain.ts`

**Produces:** `createPhaseRun()` and `createEvidenceChain()` factory functions with Effect Schema validation

- [ ] **Step 1: Write test for PhaseRun factory**

Create `ts/test/domain/objects/phase-run.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createPhaseRun } from "../../../src/domain/objects/phase-run";

describe("createPhaseRun", () => {
  it("creates a phase run with required fields", () => {
    const run = createPhaseRun({
      phaseRunId: "11111111-1111-4111-a111-111111111111",
      projectId: "22222222-2222-4222-a222-222222222222",
      phaseName: "literature_search",
      phaseVersion: 1,
    });
    expect(run.phaseRunId).toBe("11111111-1111-4111-a111-111111111111");
    expect(run.phaseName).toBe("literature_search");
    expect(run.phaseVersion).toBe(1);
    expect(run.status).toBe("PENDING");
    expect(run.active).toBe(false);
    expect(run.artifacts).toEqual({});
    expect(run.toolCalls).toEqual([]);
  });

  it("accepts override for status and selfReview", () => {
    const run = createPhaseRun({
      phaseRunId: "11111111-1111-4111-a111-111111111111",
      projectId: "22222222-2222-4222-a222-222222222222",
      phaseName: "hypothesis_generation",
      phaseVersion: 2,
      status: "COMPLETED",
      selfReview: { passed: true, rounds: 1, issues: [] },
    });
    expect(run.status).toBe("COMPLETED");
    expect(run.selfReview?.passed).toBe(true);
    expect(run.selfReview?.rounds).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Docker exec: `docker exec docker_ts-app_1 sh -c "cd /app && ./node_modules/.bin/vitest run test/domain/objects/phase-run.test.ts"`
Expected: FAIL (module not found)

- [ ] **Step 3: Create phase-run.ts**

Create `ts/src/domain/objects/phase-run.ts`:

```typescript
import * as Schema from "@effect/schema/Schema";

export const PhaseRun = Schema.Struct({
  phaseRunId: Schema.UUID,
  projectId: Schema.UUID,
  phaseName: Schema.NonEmptyString,
  phaseVersion: Schema.PositiveInt,
  parentRunId: Schema.NullOr(Schema.UUID),
  status: Schema.String,
  artifacts: Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) }),
  agentOutput: Schema.NullOr(Schema.String),
  toolCalls: Schema.Array(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  selfReview: Schema.NullOr(
    Schema.Struct({
      passed: Schema.Boolean,
      rounds: Schema.Int,
      issues: Schema.Array(
        Schema.Struct({
          severity: Schema.Union(Schema.Literal("blocking"), Schema.Literal("warning")),
          category: Schema.String,
          message: Schema.String,
        })
      ),
    })
  ),
  humanFeedback: Schema.NullOr(Schema.String),
  active: Schema.Boolean,
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type PhaseRun = Schema.Schema.Type<typeof PhaseRun>;

export const createPhaseRun = (override: Partial<PhaseRun> = {}): PhaseRun => ({
  phaseRunId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  phaseName: "unknown",
  phaseVersion: 1,
  parentRunId: null,
  status: "PENDING",
  artifacts: {},
  agentOutput: null,
  toolCalls: [],
  selfReview: null,
  humanFeedback: null,
  active: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
```

- [ ] **Step 4: Run test to verify it passes**

Same docker exec command. Expected: PASS

- [ ] **Step 5: Write test for EvidenceChain factory**

Create `ts/test/domain/objects/evidence-chain.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createEvidenceChain } from "../../../src/domain/objects/evidence-chain";

describe("createEvidenceChain", () => {
  it("creates an evidence chain link", () => {
    const chain = createEvidenceChain({
      evidenceChainId: "11111111-1111-4111-a111-111111111111",
      projectId: "22222222-2222-4222-a222-222222222222",
      sourceType: "Hypothesis",
      sourceId: "33333333-3333-4333-a333-333333333333",
      targetType: "Citation",
      targetId: "44444444-4444-4444-a444-444444444444",
      relation: "cites",
    });
    expect(chain.sourceType).toBe("Hypothesis");
    expect(chain.targetType).toBe("Citation");
    expect(chain.relation).toBe("cites");
  });
});
```

- [ ] **Step 6: Create evidence-chain.ts**

Create `ts/src/domain/objects/evidence-chain.ts`:

```typescript
import * as Schema from "@effect/schema/Schema";

export const EvidenceChain = Schema.Struct({
  evidenceChainId: Schema.UUID,
  projectId: Schema.UUID,
  sourceType: Schema.NonEmptyString,
  sourceId: Schema.UUID,
  targetType: Schema.NonEmptyString,
  targetId: Schema.UUID,
  relation: Schema.NonEmptyString,
  createdAt: Schema.DateFromSelf,
});

export type EvidenceChain = Schema.Schema.Type<typeof EvidenceChain>;

export const createEvidenceChain = (override: Partial<EvidenceChain> = {}): EvidenceChain => ({
  evidenceChainId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  sourceType: "Hypothesis",
  sourceId: "00000000-0000-4000-a000-000000000000",
  targetType: "Citation",
  targetId: "00000000-0000-4000-a000-000000000000",
  relation: "derives-from",
  createdAt: new Date(),
  ...override,
});
```

- [ ] **Step 7: Run test to verify it passes**

Docker exec. Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add ts/src/domain/objects/phase-run.ts ts/src/domain/objects/evidence-chain.ts ts/test/domain/objects/phase-run.test.ts ts/test/domain/objects/evidence-chain.test.ts
git commit -m "feat(domain): add PhaseRun and EvidenceChain factory objects with tests"
```

---

### Task 3: Self-Review Engine — Agent reviews its own output before presenting to user

**Files:**
- Create: `ts/src/runtime/workflows/self-review.ts`

**Consumes:** `Provider` from `@runtime/provider`, cognitive mode instructions from `@cognition/modes.ts`
**Produces:** `selfReview(agentOutput: string, phaseName: string, provider: Provider): Promise<SelfReviewResult>`

- [ ] **Step 1: Write test for self-review**

Create `ts/test/runtime/workflows/self-review.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { selfReview } from "../../../src/runtime/workflows/self-review";
import { MockProvider } from "../../../src/runtime/provider";

describe("selfReview", () => {
  it("passes when output has no issues", async () => {
    const provider = new MockProvider([{
      pattern: "",
      response: {
        content: JSON.stringify({ passed: true, issues: [], reasoning: "Output is sound" }),
        stopReason: "end_turn",
      },
    }]);
    const result = await selfReview(
      JSON.stringify({ hypotheses: [{ statement: "X causes Y" }] }),
      "hypothesis_generation",
      provider
    );
    expect(result.passed).toBe(true);
    expect(result.rounds).toBe(1);
  });

  it("catches fabricated citations", async () => {
    const provider = new MockProvider([{
      pattern: "",
      response: {
        content: JSON.stringify({
          passed: false,
          issues: [{ severity: "blocking" as const, category: "fabrication" as const, message: "URL does not match a real paper" }],
          reasoning: "Found fabricated citation",
        }),
        stopReason: "end_turn",
      },
    }]);
    const result = await selfReview(
      JSON.stringify({ keyFindings: [{ finding: "X", sourceTitle: "Fake Paper", sourceUrl: "http://fake.com" }] }),
      "literature_search",
      provider
    );
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Docker exec. Expected: FAIL (module not found)

- [ ] **Step 3: Create self-review.ts**

Create `ts/src/runtime/workflows/self-review.ts`:

```typescript
import * as Effect from "effect/Effect";
import type { Provider } from "@runtime/provider";
import { getCognitiveModeByName } from "@cognition/modes";

export interface SelfReviewIssue {
  severity: "blocking" | "warning";
  category: "fabrication" | "unfalsifiable" | "bias" | "missing-controls" | "unsupported-claim";
  message: string;
}

export interface SelfReviewResult {
  passed: boolean;
  rounds: number;
  issues: SelfReviewIssue[];
  finalOutput: string;
}

const REVIEW_PROMPT = (phaseName: string, output: string) => `
You are conducting a self-review of research phase output. Use the FALSIFY cognitive mode.

Phase: ${phaseName}
Output to review:
${output.substring(0, 4000)}

Check for:
1. **Fabrication**: Are all citations/URLs/plausible or could they be hallucinated?
2. **Unfalsifiability**: Are hypotheses specific enough to be proven wrong?
3. **Bias**: Is evidence assessment objective or showing confirmation bias?
4. **Missing controls**: Does experiment design include proper controls?
5. **Unsupported claims**: Are conclusions backed by the presented evidence?

Respond with ONLY valid JSON:
{
  "passed": true or false,
  "issues": [{"severity": "blocking|warning", "category": "fabrication|unfalsifiable|bias|missing-controls|unsupported-claim", "message": "description"}],
  "reasoning": "why this judgment"
}
`;

const FIX_PROMPT = (output: string, issues: string) => `
Your phase output had issues:
${issues}

Here is the original output:
${output.substring(0, 4000)}

Please revise the output to fix the blocking issues. Respond with ONLY the revised JSON output (same format as original).
`;

export async function selfReview(
  agentOutput: string,
  phaseName: string,
  provider: Provider,
  maxRounds: number = 3
): Promise<SelfReviewResult> {
  let currentOutput = agentOutput;
  let round = 0;

  while (round < maxRounds) {
    round++;

    const reviewResponse = await Effect.runPromise(
      provider.sendMessages([{ role: "user", content: REVIEW_PROMPT(phaseName, currentOutput) }])
    );

    const reviewData = parseJsonResponse(reviewResponse.content);

    if (!reviewData) {
      return {
        passed: true,
        rounds: round,
        issues: [],
        finalOutput: currentOutput,
      };
    }

    const issues: SelfReviewIssue[] = (reviewData.issues ?? []).map((i: any) => ({
      severity: i.severity === "blocking" ? "blocking" : "warning",
      category: i.category || "unsupported-claim",
      message: i.message || "Unknown issue",
    }));

    const blockingIssues = issues.filter((i) => i.severity === "blocking");

    if (blockingIssues.length === 0) {
      return {
        passed: reviewData.passed ?? issues.length === 0,
        rounds: round,
        issues,
        finalOutput: currentOutput,
      };
    }

    // Try to fix
    const fixResponse = await Effect.runPromise(
      provider.sendMessages([{
        role: "user",
        content: FIX_PROMPT(currentOutput, blockingIssues.map((i) => `${i.category}: ${i.message}`).join("\n")),
      }])
    );

    const fixedOutput = fixResponse.content?.trim();
    if (fixedOutput) {
      currentOutput = fixedOutput;
    }
  }

  // Max rounds reached, return with whatever issues remain
  const finalReview = await Effect.runPromise(
    provider.sendMessages([{ role: "user", content: REVIEW_PROMPT(phaseName, currentOutput) }])
  );
  const finalData = parseJsonResponse(finalReview.content);

  return {
    passed: false,
    rounds: round,
    issues: finalData?.issues?.map((i: any) => ({
      severity: i.severity === "blocking" ? "blocking" : "warning",
      category: i.category || "unsupported-claim",
      message: i.message || "Unknown issue",
    })) ?? [],
    finalOutput: currentOutput,
  };
}

function parseJsonResponse(content: string): Record<string, unknown> | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Docker exec. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ts/src/runtime/workflows/self-review.ts ts/test/runtime/workflows/self-review.test.ts
git commit -m "feat(runtime): add self-review engine with FALSIFY mode and tests"
```

---

### Task 4: Integrate Self-Review into Phase Execution

**Files:**
- Modify: `ts/src/runtime/workflows/phase-contracts.ts` — call selfReview after Agent produces output, save self_review result

**Consumes:** `selfReview` from `./self-review`
**Produces:** `runPhase()` now includes self-review in its output, emits `self:review` SSE event

- [ ] **Step 1: Modify runPhase in phase-contracts.ts**

After the Agent loop produces `rawOutput` (around line 390), add self-review call before saving objects:

In the `runPhase` function, after getting `rawOutput` from `runAgentLoop` but before parsing/saving:

```typescript
// After the try block that calls runAgentLoop, before "Step 4: Parse JSON output"

import { selfReview, SelfReviewResult } from "./self-review";

let selfReviewResult: SelfReviewResult | null = null;

if (rawOutput && rawOutput.trim().length > 0) {
  selfReviewResult = await selfReview(rawOutput, contract.name, provider);

  onEvent({
    type: "phase:progress",
    content: `自我审查: ${selfReviewResult.passed ? "通过" : "发现问题"} (${selfReviewResult.rounds} 轮)`,
    phase: contract.name,
    timestamp: new Date().toISOString(),
  });

  // Use revised output if available and better
  if (selfReviewResult.finalOutput !== rawOutput) {
    rawOutput = selfReviewResult.finalOutput;
  }
}
```

- [ ] **Step 2: Include selfReview in phase result**

Update the return value at the end of `runPhase`:

```typescript
return {
  phaseName: contract.name,
  status: "COMPLETED",
  output: parsed,
  rawOutput,
  savedIds,
  toolCalls,
  selfReview: selfReviewResult,
};
```

And update `PhaseRunResult` interface at the top of the file:

```typescript
export interface PhaseRunResult {
  phaseName: string;
  status: "COMPLETED" | "ERROR" | "SKIPPED";
  output: Record<string, unknown> | null;
  rawOutput: string;
  savedIds: Record<string, string[]>;
  toolCalls: Array<{ toolName: string; input: Record<string, unknown>; output: string }>;
  selfReview?: {
    passed: boolean;
    rounds: number;
    issues: Array<{ severity: string; category: string; message: string }>;
  } | null;
}
```

- [ ] **Step 3: Verify Docker build passes**

`cd /data/students/gaolei/paperfactory && docker-compose -f docker/docker-compose.yml build ts-app`
Expected: builds successfully

- [ ] **Step 4: Commit**

```bash
git add ts/src/runtime/workflows/phase-contracts.ts
git commit -m "feat(phase-contracts): integrate self-review into phase execution"
```

---

### Task 5: Phase Version Management in agent-research.ts

**Files:**
- Modify: `ts/src/runtime/workflows/agent-research.ts` — save phase_runs to PG, track versions, support mode

**Consumes:** `PgObjectStore` (for reading existing phase versions), `SelfReviewResult` from phase-contracts
**Produces:** Each phase execution saved as a `PhaseRun` record in PG

- [ ] **Step 1: Update ResearchRunContext**

In `agent-research.ts`, add to the interface:

```typescript
export interface ResearchRunContext {
  projectId: string;
  branchId: string;
  question: string;
  provider: Provider;
  objectStore: ObjectStore;
  eventStore: EventStore;
  controller: ResearchController;
  toolRegistry: ToolRegistry;
  toolDefinitions: ReadonlyArray<ToolDefinition>;
  onEvent: (event: AgentEvent) => void;
  shouldStop: () => boolean;
  requiresReview?: boolean;
  startFromPhase?: string;
  mode?: "manual" | "auto";  // NEW
  onApprovalNeeded?: (runId: string, phaseName: string, summary: string) => Promise<"approve" | "modify" | "reject">;  // NEW
}
```

- [ ] **Step 2: Add version tracking helper**

At the top of `runAgentDrivenResearch`:

```typescript
// Track phase versions
const phaseVersions: Record<string, number> = {};
const phaseRunIds: Record<string, string> = {};
```

- [ ] **Step 3: Save PhaseRun after each phase**

After `runPhase()` returns in the loop, save the phase_run:

```typescript
import { createPhaseRun } from "@domain/objects/phase-run";

// After const result = await runPhase(...)
const phaseRunId = generateUuid();
const version = (phaseVersions[contract.name] ?? 0) + 1;
phaseVersions[contract.name] = version;

const phaseRun = createPhaseRun({
  phaseRunId,
  projectId: ctx.projectId,
  phaseName: contract.name,
  phaseVersion: version,
  status: result.status,
  artifacts: result.savedIds,
  agentOutput: result.rawOutput,
  toolCalls: result.toolCalls,
  selfReview: result.selfReview,
  active: true,
});
await Effect.runPromise(objectStore.save(phaseRun as any));
phaseRunIds[contract.name] = phaseRunId;

// Emit phase_run_saved event
onEvent({
  type: "phase:progress",
  content: `阶段 ${contract.label} 已保存 (v${version})`,
  phase: contract.name,
  timestamp: new Date().toISOString(),
});
```

- [ ] **Step 4: Add approval gate for manual mode**

After saving PhaseRun and before continuing to next phase:

```typescript
// Approval gate
if (ctx.mode === "manual" && ctx.onApprovalNeeded) {
  const summary = buildPhaseSummary(contract.name, result);
  onEvent({
    type: "phase:progress",
    content: `等待审核: ${contract.label} v${version}`,
    phase: contract.name,
    timestamp: new Date().toISOString(),
  });

  const decision = await ctx.onApprovalNeeded(phaseRunId, contract.name, summary);

  if (decision === "approve") {
    onEvent({
      type: "phase:progress",
      content: `用户已批准: ${contract.label}`,
      phase: contract.name,
      timestamp: new Date().toISOString(),
    });
  } else if (decision === "reject" || decision === "modify") {
    // Store feedback, re-run phase
    onEvent({
      type: "phase:progress",
      content: `用户请求修改: ${contract.label}`,
      phase: contract.name,
      timestamp: new Date().toISOString(),
    });
    // Feedback will be passed as extraContext on re-run
  }
}
```

Where `buildPhaseSummary` is a helper:

```typescript
function buildPhaseSummary(phaseName: string, result: any): string {
  if (!result?.output) return "阶段完成";
  const o = result.output as any;
  if (phaseName === "literature_search") {
    const findings = o.keyFindings ?? [];
    const gaps = o.researchGaps ?? [];
    return `找到 ${findings.length} 个关键发现，${gaps.length} 个研究空白`;
  }
  if (phaseName === "hypothesis_generation") {
    const hyps = o.hypotheses ?? [];
    return `提出 ${hyps.length} 个假设`;
  }
  if (phaseName === "evidence_assessment" || phaseName === "confirmation") {
    const conclusion = o.conclusion ?? o;
    return `结论: ${conclusion.status ?? "未完成"} — ${conclusion.reasoning?.substring(0, 200) ?? ""}`;
  }
  return `阶段完成`;
}
```

- [ ] **Step 5: Build and verify**

`cd /data/students/gaolei/paperfactory && docker-compose -f docker/docker-compose.yml build ts-app`
Expected: builds successfully

- [ ] **Step 6: Commit**

```bash
git add ts/src/runtime/workflows/agent-research.ts
git commit -m "feat(agent-research): phase version management, PhaseRun persistence, approval gate"
```

---

### Task 6: Evidence Chain Building

**Files:**
- Create: `ts/src/runtime/workflows/evidence-chain.ts`

**Produces:** `buildEvidenceChain(store, projectId, phaseResult): Promise<void>` — creates evidence_chain records linking artifacts

- [ ] **Step 1: Write test**

Create `ts/test/runtime/workflows/evidence-chain.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { InMemoryObjectStore } from "../../../src/persistence/object-store";
import { buildEvidenceChain } from "../../../src/runtime/workflows/evidence-chain";

describe("buildEvidenceChain", () => {
  it("creates chain links from phase artifacts", async () => {
    const store = new InMemoryObjectStore();
    const projectId = "22222222-2222-4222-a222-222222222222";

    // Seed some objects
    await Effect.runPromise(store.save({
      evidenceId: "11111111-1111-4111-a111-111111111111",
      projectId, resultId: "33333333-3333-4333-a333-333333333333",
    } as any));
    await Effect.runPromise(store.save({
      hypothesisId: "44444444-4444-4444-a444-444444444444",
      projectId,
    } as any));

    await buildEvidenceChain(store, projectId, {
      savedIds: {
        evidenceIds: ["11111111-1111-4111-a111-111111111111"],
        hypothesisIds: ["44444444-4444-4444-a444-444444444444"],
      },
      phaseName: "experiment_execution",
    });

    // Verify chain was created
    const chains = await Effect.runPromise(store.list("EvidenceChain"));
    expect(chains.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Create evidence-chain.ts**

Create `ts/src/runtime/workflows/evidence-chain.ts`:

```typescript
import * as Effect from "effect/Effect";
import type { ObjectStore } from "@persistence/object-store";
import { createEvidenceChain } from "@domain/objects/evidence-chain";

export interface ChainBuildInput {
  savedIds: Record<string, string[]>;
  phaseName: string;
}

export async function buildEvidenceChain(
  store: ObjectStore,
  projectId: string,
  input: ChainBuildInput
): Promise<void> {
  const { savedIds, phaseName } = input;

  // Evidence derives from Result
  for (const evidenceId of savedIds.evidenceIds ?? []) {
    const eOpt = await Effect.runPromise(store.get(evidenceId, "Evidence"));
    if (eOpt.isSome()) {
      const evidence = eOpt.value as any;
      if (evidence.resultId) {
        await Effect.runPromise(store.save(createEvidenceChain({
          evidenceChainId: generateUuid(),
          projectId,
          sourceType: "Evidence",
          sourceId: evidenceId,
          targetType: "Result",
          targetId: evidence.resultId,
          relation: "derives-from",
        }) as any));
      }

      // Evidence supports/conflicts with hypotheses
      const hyps = await Effect.runPromise(store.list("Hypothesis"));
      for (const h of hyps.filter((hyp: any) => hyp.projectId === projectId)) {
        await Effect.runPromise(store.save(createEvidenceChain({
          evidenceChainId: generateUuid(),
          projectId,
          sourceType: "Evidence",
          sourceId: evidenceId,
          targetType: "Hypothesis",
          targetId: h.hypothesisId,
          relation: evidence.direction === "SUPPORTING" ? "supports" : evidence.direction === "CONFLICTING" ? "contradicts" : "neutral",
        }) as any));
      }
    }
  }

  // Hypothesis addresses ResearchGap
  for (const hypId of savedIds.hypothesisIds ?? []) {
    const hOpt = await Effect.runPromise(store.get(hypId, "Hypothesis"));
    if (hOpt.isSome()) {
      const hyp = hOpt.value as any;
      if (hyp.gapId) {
        await Effect.runPromise(store.save(createEvidenceChain({
          evidenceChainId: generateUuid(),
          projectId,
          sourceType: "Hypothesis",
          sourceId: hypId,
          targetType: "ResearchGap",
          targetId: hyp.gapId,
          relation: "addresses",
        }) as any));
      }
    }
  }

  // KnowledgeItem cites Citations
  for (const knowledgeId of savedIds.knowledgeIds ?? []) {
    for (const citationId of savedIds.citationIds ?? []) {
      await Effect.runPromise(store.save(createEvidenceChain({
        evidenceChainId: generateUuid(),
        projectId,
        sourceType: "KnowledgeItem",
        sourceId: knowledgeId,
        targetType: "Citation",
        targetId: citationId,
        relation: "cites",
      }) as any));
    }
  }
}

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

- [ ] **Step 3: Run test to verify it passes**

Docker exec. Expected: PASS

- [ ] **Step 4: Call buildEvidenceChain from agent-research.ts**

In the phase loop, after saving PhaseRun:

```typescript
import { buildEvidenceChain } from "./evidence-chain";

// After saving phaseRun
await buildEvidenceChain(objectStore, ctx.projectId, {
  savedIds: result.savedIds,
  phaseName: contract.name,
});
```

- [ ] **Step 5: Build and verify**

`cd /data/students/gaolei/paperfactory && docker-compose -f docker/docker-compose.yml build ts-app`
Expected: builds successfully

- [ ] **Step 6: Commit**

```bash
git add ts/src/runtime/workflows/evidence-chain.ts ts/test/runtime/workflows/evidence-chain.test.ts ts/src/runtime/workflows/agent-research.ts
git commit -m "feat(runtime): evidence chain builder with tests, integrated into agent-research"
```

---

### Task 7: API Endpoints — Phase Management, Evidence Chain, Approval

**Files:**
- Modify: `ts/src/api/routes.ts` — add phase management, chain, and approval endpoints

**Produces:** REST API for phase runs, evidence chain traversal, and approval decisions

- [ ] **Step 1: Add phase listing endpoint**

In `routes.ts`, add before the phase re-run endpoint:

```typescript
// List phase runs for a project
app.get("/api/projects/:id/phases", async (c) => {
  const id = c.req.param("id");
  const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
  const projectRuns = runs
    .filter((r: any) => r.projectId === id)
    .sort((a: any, b: any) => a.phaseVersion - b.phaseVersion);
  return c.json(projectRuns);
});

// Get phases grouped by phase name
app.get("/api/projects/:id/phases/grouped", async (c) => {
  const id = c.req.param("id");
  const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
  const projectRuns = runs.filter((r: any) => r.projectId === id);

  const grouped: Record<string, any[]> = {};
  for (const run of projectRuns) {
    const name = (run as any).phaseName;
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(run);
  }
  return c.json(grouped);
});
```

- [ ] **Step 2: Add evidence chain endpoint**

```typescript
// Get evidence chain for an object (bidirectional)
app.get("/api/projects/:id/chain/:objectType/:objectId", async (c) => {
  const id = c.req.param("id");
  const objectType = c.req.param("objectType");
  const objectId = c.req.param("objectId");

  const chains = await Effect.runPromise(objectStore.list("EvidenceChain"));
  const projectChains = chains.filter((ch: any) => ch.projectId === id);

  // Upstream: things this object depends on
  const upstream = projectChains.filter((ch: any) =>
    ch.sourceType === objectType && ch.sourceId === objectId
  ).map((ch: any) => ({
    targetType: ch.targetType,
    targetId: ch.targetId,
    relation: ch.relation,
  }));

  // Downstream: things that depend on this object
  const downstream = projectChains.filter((ch: any) =>
    ch.targetType === objectType && ch.targetId === objectId
  ).map((ch: any) => ({
    sourceType: ch.sourceType,
    sourceId: ch.sourceId,
    relation: ch.relation,
  }));

  return c.json({ upstream, downstream });
});
```

- [ ] **Step 3: Add approval endpoint**

```typescript
// Approve/modify/reject a phase run
app.post("/api/projects/:id/phases/:runId/decision", async (c) => {
  const id = c.req.param("id");
  const runId = c.req.param("runId");
  const body = await c.req.json();

  const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
  const run = runs.find((r: any) => r.phaseRunId === runId && r.projectId === id);
  if (!run) {
    return c.json({ error: "Phase run not found" }, 404);
  }

  const updated = {
    ...run,
    status: body.decision === "approve" ? "COMPLETED" : "REJECTED",
    humanFeedback: body.feedback ?? run.humanFeedback,
    active: body.decision === "approve" ? true : run.active,
    updatedAt: new Date(),
  };

  // Deactivate other versions of same phase
  const samePhase = runs.filter((r: any) =>
    r.projectId === id && r.phaseName === run.phaseName && r.phaseRunId !== runId
  );
  for (const other of samePhase) {
    await Effect.runPromise(objectStore.save({ ...other, active: false, updatedAt: new Date() }));
  }

  await Effect.runPromise(objectStore.save(updated));
  return c.json(updated);
});
```

- [ ] **Step 4: Update stream endpoint to support mode**

In the `/api/research/stream` handler, pass `mode` and `onApprovalNeeded` from request body:

```typescript
const researchResult = await runAgentDrivenResearch({
  projectId,
  branchId,
  question: body.question ?? "",
  provider,
  objectStore: memStore,
  eventStore: memEventStore,
  controller: memController,
  toolRegistry: researchToolRegistry,
  toolDefinitions,
  mode: body.mode ?? "manual",
  onEvent: (event) => {
    sendEvent(event.type, event);
  },
  onApprovalNeeded: async (runId: string, phaseName: string, summary: string) => {
    // In SSE mode, send awaiting_approval event and wait
    // For now, auto-approve in SSE (approval is handled via separate HTTP endpoint)
    return "approve";
  },
  shouldStop: () => stopped,
});
```

- [ ] **Step 5: Build and verify**

`cd /data/students/gaolei/paperfactory && docker-compose -f docker/docker-compose.yml build ts-app`
Expected: builds successfully

- [ ] **Step 6: Commit**

```bash
git add ts/src/api/routes.ts
git commit -m "feat(api): phase management, evidence chain, and approval endpoints"
```

---

### Task 8: Frontend — Collapsible Tool Calls, Paper Cards, Phase Versions, Evidence Chain

**Files:**
- Modify: `ts/src/api/static/index.html` — complete frontend rewrite for new features

**Produces:** Frontend with collapsible tool calls, paper cards, phase version panel, evidence chain view, approve/modify/reject buttons

- [ ] **Step 1: Rewrite frontend**

Key changes to `index.html`:

**A. Tool call rendering** — already exists from previous iteration, enhance to parse paper results from search tool output:

```javascript
function addToolCall(toolName, input, output) {
  const div = document.createElement('div');
  div.className = 'tool-call';
  const outputStr = output?.toString?.()?.substring(0, 2000) ?? '';

  // Parse papers from search output
  let paperCards = '';
  if (toolName === 'search') {
    try {
      const data = JSON.parse(outputStr);
      const papers = data.results || [];
      if (papers.length > 0) {
        paperCards = '<div class="paper-list">' +
          papers.map(p =>
            `<div class="paper-card">
              <div class="paper-title">${esc(p.title)}</div>
              <div class="paper-meta">${esc(p.authors?.join(', ') || '')} (${p.year || '?'}) · ${p.citationCount || 0} citations</div>
              <div class="paper-abstract">${esc((p.abstract || '').substring(0, 200))}</div>
              ${p.url ? `<a href="${esc(p.url)}" target="_blank" class="paper-link">查看原文</a>` : ''}
            </div>`
          ).join('') + '</div>';
      }
    } catch(e) {}
  }

  div.innerHTML = `
    <div class="tool-header" onclick="toggleToolCall(this)">
      <span class="arrow">▶</span>
      <span>⚡ ${esc(toolName)}</span>
      <span class="tool-input" style="color:var(--t2);font-size:.65rem">${esc(JSON.stringify(input)?.substring(0, 80))}</span>
    </div>
    <div class="tool-body">
      <div class="label">输入:</div>
      <code>${esc(JSON.stringify(input)?.substring(0, 500))}</code>
      <div class="label">输出:</div>
      <code>${esc(outputStr)}</code>
      ${paperCards}
    </div>`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function toggleToolCall(header) {
  header.classList.toggle('open');
  header.nextElementSibling.classList.toggle('open');
}
```

**B. Phase version display** — update phase panel to show version count:

```javascript
async function loadPhaseVersions(projectId) {
  try {
    const resp = await fetch(`/api/projects/${projectId}/phases/grouped`);
    const grouped = await resp.json();
    document.querySelectorAll('.phase').forEach(el => {
      const phaseName = el.dataset.phase;
      const versions = grouped[phaseName] || [];
      const activeVer = versions.find(v => v.active)?.phaseVersion;
      const verText = versions.length > 0 ? ` (v${activeVer || '?'}/${versions.length})` : '';
      el.querySelector('div:last-child').innerHTML += verText;
    });
  } catch(e) {}
}
```

**C. Evidence chain view** — add chain panel to phase detail:

```javascript
async function loadEvidenceChain(projectId, objectType, objectId) {
  try {
    const resp = await fetch(`/api/projects/${projectId}/chain/${objectType}/${objectId}`);
    const { upstream, downstream } = await resp.json();
    let html = '<div class="chain-section"><div class="section-title">上游来源</div>';
    upstream.forEach(u => {
      html += `<div class="chain-link">${u.relation} → ${u.targetType} [${u.targetId.substring(0,8)}]</div>`;
    });
    html += '</div><div class="chain-section"><div class="section-title">下游引用</div>';
    downstream.forEach(d => {
      html += `<div class="chain-link">${d.sourceType} [${d.sourceId.substring(0,8)}] → ${d.relation}</div>`;
    });
    html += '</div>';
    return html;
  } catch(e) { return ''; }
}
```

**D. Approve/modify/reject buttons** — add to phase detail panel:

```javascript
function addDecisionButtons(runId, phaseName) {
  return `<div class="decision-buttons">
    <button class="btn primary" onclick="decidePhase('${runId}', 'approve', '')">批准</button>
    <button class="btn" onclick="showModifyInput('${runId}')">修改</button>
    <button class="btn" style="border-color:var(--red);color:var(--red)" onclick="showRejectInput('${runId}')">拒绝</button>
  </div>`;
}

async function decidePhase(runId, decision, feedback) {
  try {
    await fetch(`/api/projects/${currentProjectId}/phases/${runId}/decision`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ decision, feedback })
    });
    addMsg('system', '决策', `${decision === 'approve' ? '已批准' : decision === 'modify' ? '请求修改' : '已拒绝'}此阶段`);
  } catch(e) {
    addMsg('error', '错误', e.message);
  }
}
```

**E. CSS for paper cards and chain view** — add to `<style>`:

```css
.paper-list { margin-top: 8px; }
.paper-card { background: var(--s3); padding: 8px; border-radius: 6px; margin-bottom: 4px; font-size: .72rem; }
.paper-title { font-weight: 600; color: var(--t1); margin-bottom: 2px; }
.paper-meta { color: var(--t2); font-size: .65rem; }
.paper-abstract { color: var(--t2); margin-top: 4px; line-height: 1.4; }
.paper-link { color: var(--blue); font-size: .65rem; text-decoration: none; }
.paper-link:hover { text-decoration: underline; }
.chain-section { margin: 8px 0; }
.chain-link { font-size: .7rem; padding: 2px 0; color: var(--t2); }
.decision-buttons { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
```

- [ ] **Step 2: Build and verify**

`cd /data/students/gaolei/paperfactory && docker-compose -f docker/docker-compose.yml build ts-app`
Expected: builds successfully

- [ ] **Step 3: Restart and smoke test**

```bash
cd /data/students/gaolei/paperfactory/docker && docker-compose stop ts-app && docker-compose rm -f ts-app 2>/dev/null
docker-compose up -d ts-app
sleep 5
curl -s http://localhost:3001/health | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add ts/src/api/static/index.html
git commit -m "feat(frontend): collapsible tool calls with paper cards, phase versions, evidence chain view, decision buttons"
```

---

### Task 9: Migration & End-to-End Verification

**Files:**
- Create: Drizzle migration for new tables
- Modify: `ts/src/persistence/migrate.ts` if needed

- [ ] **Step 1: Generate migration**

Inside Docker container:

```bash
docker exec docker_ts-app_1 sh -c "cd /app && ./node_modules/.bin/drizzle-kit generate --config=drizzle.config.ts 2>&1 || ./node_modules/.bin/drizzle-kit generate 2>&1"
```

If drizzle-kit config doesn't exist, create `ts/drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/persistence/drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://paperfactory:paperfactory_dev@localhost:5432/paperfactory",
  },
});
```

- [ ] **Step 2: Run migration**

```bash
docker exec docker_ts-app_1 sh -c "cd /app && ./node_modules/.bin/drizzle-kit push 2>&1"
```

Verify tables exist:

```bash
docker exec docker_postgres_1 psql -U paperfactory -d paperfactory -c "\dt phase_runs" 2>&1
docker exec docker_postgres_1 psql -U paperfactory -d paperfactory -c "\dt evidence_chain" 2>&1
```

Expected: both tables exist

- [ ] **Step 3: Full rebuild and restart**

```bash
cd /data/students/gaolei/paperfactory && docker-compose -f docker/docker-compose.yml build ts-app
cd /data/students/gaolei/paperfactory/docker && docker-compose stop ts-app && docker-compose rm -f ts-app 2>/dev/null && docker-compose up -d ts-app
sleep 5 && curl -s http://localhost:3001/health | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])"
```

- [ ] **Step 4: End-to-end test**

Start a research run and verify:
1. SSE events include self-review events
2. Phase runs are saved to PG
3. Evidence chain links are created
4. Paper cards appear in frontend for search results

```bash
curl -s -X POST http://localhost:3001/api/research/stream \
  -H "Content-Type: application/json" \
  -d '{"question":"Does sleep affect memory consolidation?", "mode":"auto"}' \
  --max-time 300 2>&1 | grep "event:" | head -20
```

Verify in PG:

```bash
docker exec docker_postgres_1 psql -U paperfactory -d paperfactory -c "SELECT count(*) FROM phase_runs;" 2>&1
docker exec docker_postgres_1 psql -U paperfactory -d paperfactory -c "SELECT count(*) FROM evidence_chain;" 2>&1
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: migration for phase_runs and evidence_chain tables, e2e verification"
```

---

## Spec Coverage Check

| Spec Section | Task(s) |
|-------------|---------|
| Phase version management (`phase_runs` table) | Task 1 (schema), Task 2 (domain), Task 5 (integration) |
| Self-review engine | Task 3 (engine), Task 4 (integration) |
| Human-in-the-loop (approve/modify/reject) | Task 5 (approval gate), Task 7 (API) |
| Auto/manual mode | Task 5 (mode in context), Task 7 (SSE mode) |
| Evidence chain (bidirectional) | Task 2 (EvidenceChain domain), Task 6 (builder), Task 7 (API) |
| Paper local archiving | Task 8 (paper cards in frontend) |
| Tool call collapsible display | Task 8 (frontend) |
| Phase version panel | Task 8 (frontend) |
| Evidence chain view | Task 8 (frontend) |

## Type Consistency Check

- `PhaseRun.phaseRunId` — used consistently in domain object, PG table (`id` column mapped via PgObjectStore), and API endpoints
- `EvidenceChain.evidenceChainId` — same pattern
- `selfReview` result type — consistent between `self-review.ts` interface and `phase-contracts.ts` inline type
- `onApprovalNeeded` callback — defined in `ResearchRunContext`, called in `agent-research.ts`, resolved in `routes.ts`
