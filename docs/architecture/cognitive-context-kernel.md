# Cognitive Context Kernel

The first phase of the M2 Cognitive Control Plane. It answers **"what should
the cognitive executor see, what must it not see, and why"** — deterministically,
with no LLM, no prompt, and no retrieval backend.

See [control-kernel.md](control-kernel.md), [branch-control.md](branch-control.md),
and [research-policy.md](research-policy.md) for M1; [ADR-002](../adr/ADR-002-research-state-ownership.md)
for state ownership.

## Purpose

Produce an immutable, auditable `ContextBundle` for one cognitive task: a
revision-bound, scope-isolated, blinded, budgeted selection of explicit
context items — with full provenance and exclusion reasons.

## M1 vs M2 Boundary

| | M1 Control Plane | M2 Cognitive Plane |
| --- | --- | --- |
| answers | "what may happen next?" | "what should the executor see & how framed?" |
| mutates state | yes (sole authority) | **no** |
| ranks actions | yes (Policy) | no |
| creates tasks/approvals | yes | **no** |

Cognition reads state **revision** as an opaque int (a domain primitive); it
does **not** import the control plane (architecture boundary enforced by tests).

## CognitiveMode

A closed set of ten modes: `FRAME`, `EXPLORE`, `MAP`, `COMPARE`, `FALSIFY`,
`DIAGNOSE`, `DISCRIMINATE`, `VERIFY`, `SYNTHESIZE`, `DECIDE`. In this step a
mode is a **contract carried on the request/bundle for audit and future
framing only** — it does NOT change selection.

## Context Layers

`ContextLayer`: `GLOBAL` (long-lived system/project rules), `STATE`
(current research state / branch), `TASK` (what the current action needs).
The bundle preserves layer per item; it never pre-concatenates them into one
opaque string.

## Context Scopes

`ContextScope` (enforced invariants):
- `SYSTEM` → `project_id=None`, `branch_id=None`
- `PROJECT` → `project_id` set, `branch_id=None`
- `BRANCH` → both set

Visibility against a request `(P1, B1)`:
| Item scope | Visible? |
| --- | --- |
| SYSTEM | always |
| PROJECT | only if `item.project_id == P1` |
| BRANCH | only if `item.project_id == P1` and `item.branch_id == B1` |

Cross-project / cross-branch leakage is rejected.

## ContextRequest

Immutable, **revision-bound**. `required` / `optional` / `forbidden` id sets
must each be duplicate-free and mutually disjoint. `created_at` must be
timezone-aware.

> **Explicit inclusion rule:** an item is included only if its id is in
> `required` or `optional`. The compiler NEVER auto-includes "relevant" items.

A `ContextRequest` may be constructed directly by a caller, or produced by
converting a `RetrievalResolution` (see [retrieval-policy.md](retrieval-policy.md)).
Either way, `ContextCompiler` behavior is identical.

## Blinding Model

`ContextProtectionTag`: `FUTURE_RESULT`, `TEST_SET`, `CONFIRMATORY_RESULT`,
`REVIEW_OUTCOME`. `BlindingPolicy.hidden_tags` is a `frozenset` (empty = no
blinding). An item is blinded if **any** of its protection tags is hidden.

> **Blinding takes precedence over required inclusion.** A blinded required
> item raises `RequiredContextBlindedError`; it is never let through.

## Required vs Optional Context

- **required** = "the task cannot run legally without it." Missing / wrong-scope /
  blinded / over-budget required items FAIL compilation (no silent skip, no
  downgrade, no budget expansion).
- **optional** may be excluded for scope / blinding / budget; compilation still
  succeeds and every exclusion is recorded.

## Budget Algorithm (deterministic greedy)

1. Validate all required items (completeness, scope, blinding).
2. Sum required tokens; if `> max_tokens` → `ContextBudgetExceededError`.
3. Place all required items.
4. Sort optional deterministically; greedily add each if it fits; a too-large
   item does **not** block a later smaller one. No knapsack/optimizer.

## Deterministic Ordering

Final order key: `layer_order` index (from `ContextPolicy`) → `priority`
descending → `item_id` ascending. Required items precede optional items.
Input order, set iteration, and id-generation order never affect the result.

## ContextBundle

Immutable. Records `bundle_id`, `request_id`, `project_id`, `branch_id`,
`state_revision`, `action_id`, `cognitive_mode`, context/blinding policy ids +
versions, `compiler_version`, `items` (ordered tuple), `excluded_items`,
`total_estimated_tokens` (== sum of item tokens), `budget_max_tokens`,
`source_refs`, `created_at`.

> **Item boundaries are preserved.** The bundle is NOT a flattened prompt —
> `items` is a tuple of `ContextItem`, not a `compiled_prompt: str`.

## Context Provenance

Every `ContextItem` carries a `ContextSourceRef` (`source_type` / `source_id` /
`version`). The bundle exposes `source_refs` directly so provenance is
auditable without re-walking items.

## Context Staleness

`is_request_current(req, revision)` and `is_bundle_current(bundle, revision)`
return `True` only when the recorded revision matches. A stale request is
**rejected** at compile time (`StaleContextRequestError`); a stale bundle is
never auto-refreshed — a higher layer re-compiles explicitly.

## What This Is NOT

- **ContextBundle ≠ Prompt.** No prompt field; the bundle preserves items.
- **Context compilation ≠ Retrieval.** No search/embedding/top-k/vector
  memory. Items are addressed by explicit id only.
- **Context compilation ≠ Research State mutation.** ContextItem is a
  *projection*, never written back to a Research Object.

## Auditability

The bundle itself is the detailed audit artifact (items, exclusions, policy
versions, provenance, totals). This step does NOT add a Domain Event — context
compilation is not a Research State mutation; future observability/runtime
trace can record a compilation span.

## NOT IMPLEMENTED YET

- PromptPolicy
- PromptAssembler
- RetrievalPolicy
- Semantic Retrieval
- Vector Retrieval
- Memory
- LLM
- Output Validator
- Agent Runtime
- Research Domain semantics (ResearchQuestion / Gap / Hypothesis / ...)
