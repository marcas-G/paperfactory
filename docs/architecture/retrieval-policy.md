# Retrieval Policy

The second phase of the M2 Cognitive Control Plane. It answers **"which catalog
items satisfy a declared cognitive need"** — deterministically, metadata-based,
no semantic retrieval.

See [cognitive-context-kernel.md](cognitive-context-kernel.md) for the context
kernel this builds on (ContextCompiler / ContextBundle / BlindingPolicy).

## Purpose

Let an action/cognitive task declare *what kinds of information it needs*
(`RetrievalRequirement`), and resolve those needs against a typed, enumerable
`ContextCatalog` into a `RetrievalResolution` that converts to a STEP-006
`ContextRequest`.

## Three Stages (do not merge)

```
A. Requirement Declaration   (RetrievalRequirement)
B. Retrieval Resolution       (RetrievalResolver -> RetrievalResolution)
C. Context Compilation        (ContextCompiler -> ContextBundle)
```

The resolver does **not** compile bundles; the compiler does **not** retrieve.
Each stage is independently auditable.

## Retrieval Is Not Search Yet

Step-007 "retrieval" = metadata-based deterministic selection in an existing,
typed, enumerable catalog. Explicitly **not**:

- semantic embedding / cosine similarity
- vector DB / vector search
- BM25 / keyword search engine
- LLM query expansion / rewriting
- web search

The only item ranking signal is `ContextItem.priority` (an explicit value
supplied by the item producer).

## ContextItemType

A closed set of generic cognition categories: `INSTRUCTION`, `STATE`,
`EVIDENCE`, `DECISION`, `CONSTRAINT`, `FAILURE`, `ARTIFACT`, `REFERENCE`,
`NOTE`. NOT research-domain objects (Hypothesis/Gap/Experiment/Claim arrive
with the research domain and are expressed via `source_type`).

`ContextItem` (STEP-006) gains `item_type` and immutable `labels: frozenset[str]`
(explicit metadata, no empty strings).

## RetrievalRequirement

Declares one need: `item_types`, `layers`, `scopes` (non-empty sets),
`required_labels` / `any_labels` / `excluded_labels`, `minimum_count` /
`maximum_count` (0 ≤ min ≤ max), `required: bool`, `priority: 0..100`.

## Metadata Matching

An item matches a requirement iff:

```
item.item_type ∈ requirement.item_types
AND item.layer ∈ requirement.layers
AND item.scope ∈ requirement.scopes
AND item is scope-visible against (project, branch)
AND required_labels ⊆ item.labels
AND (any_labels empty OR any_labels ∩ item.labels ≠ ∅)
AND excluded_labels ∩ item.labels = ∅
```

## Label Semantics

Exact string match. No fuzzy matching, no case-folding (`"Novelty"` ≠
`"novelty"`). Labels are explicit metadata from the item producer, not model
inference.

## Scope Matching

Membership in `requirement.scopes` AND request-level visibility:
- SYSTEM items visible to any request
- PROJECT items visible only if same project
- BRANCH items visible only if same project + branch

Cross-project / cross-branch items never match. (The ContextCompiler remains
the final correctness boundary — retrieval filtering ≠ security boundary.)

## Deterministic Ordering

- **Requirements** processed by: `priority` desc, `requirement_id` asc.
- **Items within a requirement** by: `ContextItem.priority` desc, then
  `ContextPolicy.layer_order` index, then `item_id` asc.

Input order, catalog insertion order, dict/set iteration never affect results.

## FIRST_REQUIREMENT_WINS

An item matching multiple requirements is assigned only to the
highest-priority requirement (the only dedup strategy in v1). Later
requirements record it as `ALREADY_SELECTED`.

## Minimum / Maximum Semantics

- `maximum_count`: only that many items selected per requirement; extras
  audited as `REQUIREMENT_LIMIT`.
- `minimum_count`:
  - `required=True` and unmet → whole resolution FAILS
    (`RequiredRetrievalRequirementUnsatisfiedError`, carrying requirement_id /
    minimum / actual).
  - `required=False` and unmet → resolution succeeds, audited as
    `UNSATISFIED_OPTIONAL_REQUIREMENT`.

## Required vs Optional

- `required=True` requirement → its selected items become
  **required context** in the produced `ContextRequest`.
- `required=False` → its selected items become **optional context**.

## Forbidden Semantics

Forbidden item ids are an explicit resolver input (requirements do not declare
them). A selected item that is forbidden is excluded (`FORBIDDEN_ITEM`) and
never enters the ContextRequest. Forbidden can cause a required requirement to
fail its minimum — forbidden is never bypassed.

## RetrievalResolution

Immutable. Records `resolution_id`, project/branch, `state_revision`,
action_id, cognitive_mode, retrieval policy id/version + resolver_version,
per-requirement `RequirementResolution` (matched/selected ids, satisfied flag,
exclusions), and the resulting required/optional/forbidden id sets
(disjoint).

## ContextRequest Conversion

`RetrievalResolution.to_context_request(request_id, context_policy, budget,
forbidden_item_ids=None)` produces a STEP-006 `ContextRequest`. The caller
supplies the request id, context-policy identity, budget, and may
override/extend the forbidden set.

## State Revision Binding

The resolution binds `state_revision`. If state advances after resolution,
the converted `ContextRequest` is naturally rejected by the STEP-006 compiler's
stale check (`StaleContextRequestError`). No auto-refresh.

## Auditability

`RetrievalResolution` (+ per-requirement `RequirementResolution` +
`RetrievalExclusion`) is the detailed audit artifact. Only
resolution-affecting exclusions are recorded (limit / forbidden /
already-selected / unsatisfied-optional) — not every catalog non-match. No
Domain Event is added (retrieval ≠ state mutation); observability trace can
record a span later.

## What Retrieval Does NOT Do

NO:
- Semantic Retrieval
- Embedding
- Vector Search
- BM25
- LLM Query Expansion
- Web Search
- Prompt Assembly
- ContextBundle compilation (that is the compiler's job)
- Blinding / budget (that is the compiler's job)
- Research State mutation
