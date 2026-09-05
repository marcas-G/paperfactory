# PaperFactory Phase Management & Human-in-the-Loop Design

## Overview

PaperFactory 当前的问题是：Agent 跑完一堆东西，用户看不懂、不能参与判断、不能回退修改。

核心设计原则：**人在环中，可读、可判断、可决策。**

每个阶段产出必须经过 Agent 自我审查（质量门槛），然后送到用户面前做决策。用户可以批准、修改（带反馈）或拒绝。每个阶段支持多版本对比。所有内容来源可追溯。

## Design

### 1. Phase Version Management

#### Data Model: `phase_runs` table

Each research phase execution produces a `phase_run` record with versioning:

```sql
CREATE TABLE phase_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id),
  phase_name      VARCHAR(64) NOT NULL,  -- literature_search, gap_identification, ...
  phase_version   INTEGER NOT NULL,       -- v1, v2, v3... increments per phase_name+project_id
  parent_run_id   UUID REFERENCES phase_runs(id),  -- which upstream run this is based on
  status          VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    -- PENDING -> RUNNING -> REVIEWING -> COMPLETED | REJECTED
  artifacts       JSONB NOT NULL DEFAULT '{}',
    -- { knowledgeIds: [], hypothesisIds: [], evidenceIds: [], citationIds: [] }
  agent_output    TEXT,          -- structured JSON output from Agent
  tool_calls      JSONB NOT NULL DEFAULT '[]',
    -- [{ toolName, input, output }] full audit trail
  self_review     JSONB,
    -- { passed: boolean, issues: [], rounds: int }
  human_feedback  TEXT,          -- user's modification/rejection reason
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phase_runs_project_phase ON phase_runs(project_id, phase_name);
CREATE INDEX idx_phase_runs_project_version ON phase_runs(project_id, phase_name, phase_version);
```

#### Version Lifecycle

```
Phase "实验设计" for project P:

  v1: Agent 设计实验 → 自我审查通过 → 用户批准 → 继续下游
  v2: 用户回退到实验设计，给反馈"变量不够" → Agent 重新设计 → 自我审查通过 → 用户批准
      旧下游（基于 v1 的实验执行）标记为 stale，新下游基于 v2 执行
  v3: ...
```

- `phase_version` auto-increments: `MAX(phase_version) + 1` for same `(project_id, phase_name)`
- `parent_run_id` tracks lineage: which upstream phase_runs fed into this run
- Downstream phase_runs reference their upstream via `parent_run_id`
- When a user rejects a phase run, it stays in DB with `status = REJECTED` and `human_feedback`

#### Active Version

Each phase in a project has one **active version** (the one downstream phases build upon):

```sql
ALTER TABLE phase_runs ADD COLUMN active BOOLEAN NOT NULL DEFAULT false;
-- Only one run per (project_id, phase_name) can be active at a time
```

When user approves a run, it becomes active. When user switches to v2, v2 becomes active and v1's downstream is marked stale.

### 2. Self-Review (Agent Quality Gate)

Every phase output goes through self-review before reaching the user. This is **internal to the system** — the user does not see or configure it.

#### Process

```
Agent executes phase → produces raw output
  → Self-review Agent (FALSIFY cognitive mode) evaluates:
    - Are claims backed by citations? (no fabricated papers)
    - Are hypotheses falsifiable? (not vague/unknowable)
    - Is evidence assessment objective? (no confirmation bias)
    - Does experiment design have controls?
    - Are conclusions supported by evidence?
  → If issues found: Agent revises (max 3 rounds)
  → If passes or max rounds reached: output sent to user
```

#### Self-Review Schema

```typescript
interface SelfReviewResult {
  passed: boolean;
  rounds: number;           // how many review-revision cycles
  issues: Array<{
    severity: "blocking" | "warning";
    category: "fabrication" | "unfalsifiable" | "bias" | "missing-controls" | "unsupported-claim";
    message: string;
  }>;
  finalOutput: string;      // reviewed and potentially revised output
}
```

- `blocking` issues trigger automatic revision
- `warning` issues are noted but don't block
- After 3 rounds with blocking issues still present, the phase completes with warnings attached
- Self-review result stored in `phase_runs.self_review`

### 3. Human-in-the-Loop Decision

After self-review passes, the phase result reaches the user with three options:

| Action | Meaning | System Behavior |
|--------|---------|----------------|
| **Approve** | Accept this phase result | Mark as active, proceed to next phase (auto-mode) or wait (manual-mode) |
| **Modify** | Direction is right but needs work | User provides feedback → Agent reruns phase (new version) with feedback as context |
| **Reject** | Not acceptable, explain why | User provides reason → Agent re-analyzes and reruns phase (new version) |

#### Mode Selection

```typescript
interface RunMode {
  mode: "manual" | "auto";
  // manual: each phase waits for user approval after self-review
  // auto: each phase auto-approves after self-review passes
}
```

- Set per research run (not global)
- Default: `manual`
- Auto mode does NOT skip self-review; it skips human approval
- User can still interrupt auto-run at any point

### 4. Evidence Chain (Bidirectional Graph)

Every research object traces its provenance:

```sql
CREATE TABLE evidence_chain (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id),
  source_type VARCHAR(32) NOT NULL,  -- Hypothesis, Evidence, Claim, KnowledgeItem, Conclusion
  source_id   UUID NOT NULL,
  target_type VARCHAR(32) NOT NULL,  -- Citation, Evidence, Result, Hypothesis, ResearchGap
  target_id   UUID NOT NULL,
  relation    VARCHAR(32) NOT NULL,
    -- supports, contradicts, derives-from, cites, addresses, identified-from
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ec_source ON evidence_chain(source_type, source_id);
CREATE INDEX idx_ec_target ON evidence_chain(target_type, target_id);
CREATE INDEX idx_ec_project ON evidence_chain(project_id);
```

#### Chain Examples

```
Conclusion "咖啡因改善工作记忆"
  --[derives-from]--> Evidence "实验组回忆正确率提高 12%" [SUPPORTING]
    --[derives-from]--> Result "N-back: 实验组 78% vs 对照组 66%"
      --[from]--> Experiment "双盲安慰剂对照"
        --[based-on]--> Hypothesis "咖啡因拮抗腺苷受体改善记忆"
          --[addresses]--> ResearchGap "咖啡因对不同类型记忆的影响未系统研究"
            --[identified-from]--> Citation "Caffeine enhances memory consolidation" (Yassa et al., 2009)
```

Bidirectional: clicking a citation shows all hypotheses/evidence/conclusions that cite it.

### 5. Frontend Design

#### Tool Call Display

- Tool calls shown as **collapsible blocks** (default collapsed)
- Header: `⚡ search(query="caffeine memory")` with expand arrow
- Expanded: shows input JSON and output (truncated to 2000 chars)
- Paper results extracted from search tool output and shown as **paper cards** below the tool call

#### Paper Cards

```
┌─────────────────────────────────────────────┐
│ 📄 "Caffeine enhances memory consolidation" │
│ Yassa et al., 2009 | 312 citations          │
│ Abstract: Caffeine (240mg) administered...  │
│ [View Full] [Local PDF]                      │
└─────────────────────────────────────────────┘
```

- Papers stored in `citations` table with `local_pdf_path` for offline access
- Abstract shown inline, full paper download via open access URL

#### Phase Version Panel

Each phase in the sidebar shows version count:

```
③ 实验设计 (v2 active)  [切换版本 ▾]
   ▼ v1 (2026-09-05) — 用户批准
   ▼ v2 (2026-09-06) — active ✓
```

Click to compare versions side by side (diff of agent_output, comparison of artifacts).

#### Evidence Chain View

Clicking any object (hypothesis, evidence, conclusion) opens a **provenance panel** showing the chain:

```
Hypothesis: "咖啡因拮抗腺苷受体改善记忆"
  │
  ├─ addresses → ResearchGap: "咖啡因对不同类型记忆的影响..."
  │               └─ identified-from → Citation: Yassa et al., 2009
  │
  └─ supported-by → Evidence: "实验组回忆正确率提高 12%"
                     └─ derives-from → Result: "N-back: 78% vs 66%"
                       └─ from → Experiment: "双盲安慰剂对照"
```

### 6. API Design

#### Phase Management

```
GET  /api/projects/:id/phases              -- list all phase_runs for project
GET  /api/projects/:id/phases/:phaseName   -- list versions of a specific phase
POST /api/projects/:id/phases/:phaseName/run  -- run/re-run a phase
PUT  /api/projects/:id/phases/:runId/approve  -- approve phase run
PUT  /api/projects/:id/phases/:runId/modify   -- modify with feedback
PUT  /api/projects/:id/phases/:runId/reject   -- reject with reason
PUT  /api/projects/:id/phases/:runId/activate -- set as active version
```

#### Evidence Chain

```
GET  /api/projects/:id/chain/:objectType/:objectId  -- get provenance chain
GET  /api/projects/:id/chain/:objectType/:objectId/upstream   -- upstream sources
GET  /api/projects/:id/chain/:objectType/:objectId/downstream -- downstream consumers
```

#### Run Mode

```
POST /api/research/stream
  Body: { question, mode: "manual"|"auto" }
```

SSE events extended:
```
event: phase:awaiting_approval
data: { runId, phaseName, phaseVersion, summary, toolCalls, paperCards }

event: phase:approved
data: { runId, phaseName }

event: phase:rejected
data: { runId, phaseName, feedback }
```

### 7. Phase Run Flow (SSE)

```
User sends: POST /api/research/stream { question: "...", mode: "manual" }

1. run:start → { runId, projectId }
2. phase:start → { phaseName: "literature_search", phaseVersion: 1 }
3. thinking → Agent reasoning
4. tool:calling → { toolName: "search", input: { query: "..." } }
5. tool:result → { toolName: "search", output: { papers: [...] } }
6. message → Agent synthesized output
7. self:review → { issues: [], passed: true, rounds: 1 }
8. phase:complete → { phaseName, phaseVersion }
9. phase:awaiting_approval → { summary, paperCards, actionButtons }
   -- IN MANUAL MODE: stream PAUSES here, waits for user action
   -- IN AUTO MODE: auto-approves, continues to next phase
10. (User approves/modifies/rejects)
11. phase:approved / phase:modified / phase:rejected
12. → repeat from step 2 for next phase (or same phase new version)
13. run:complete → { projectId, summary }
```

### 8. Paper Local Archiving

When search tool returns papers:
1. Extract paper metadata → save to `citations` table
2. If `openAccessPdf` URL exists → download PDF to `data/papers/<project_id>/<citation_id>.pdf`
3. Store `local_pdf_path` in citation record
4. Frontend shows [Local PDF] button for offline access

## Architecture Impact

| Layer | Change |
|-------|--------|
| **Domain** | Add `PhaseRun`, `EvidenceChain` objects |
| **Persistence** | Add `phase_runs`, `evidence_chain` tables + Drizzle schema |
| **Runtime** | `runPhase` returns `PhaseRun`; add `selfReview` function; add `evidenceChain.build()` |
| **API** | Phase management endpoints, evidence chain endpoints |
| **Frontend** | Collapsible tool calls, paper cards, version panel, evidence chain view, approve/modify/reject buttons |

## Testing Strategy

1. Phase versioning: run same phase 3x, verify v1/v2/v3 exist with correct parent links
2. Self-review: inject known-bad output (fabricated citation), verify self-review catches it
3. Evidence chain: create full chain (citation→gap→hypothesis→evidence→conclusion), verify bidirectional traversal
4. Mode switching: run in auto mode, verify no `awaiting_approval` events; run in manual, verify pause
5. Paper archiving: search returns paper with openAccessPdf, verify PDF downloaded and citation saved
