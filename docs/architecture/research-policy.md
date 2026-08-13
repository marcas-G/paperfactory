# Research Policy

The Research Policy Engine is the last core component of the M1 Research
Control Plane. It performs **deterministic action prioritization**: given a
set of already-registered, already-legal candidate actions and explicit
priority signals, it filters, scores, ranks, and recommends.

See [control-kernel.md](control-kernel.md) and [branch-control.md](branch-control.md)
for the rest of M1.

## Purpose

Decide **which candidate action to do next**, deterministically and auditably,
so the Control Plane can answer "what should happen next?" without an LLM and
without research-semantic inference.

## Policy Boundary

> **Research Policy consumes priority signals; it does not infer them.**
>
> **Research Policy ranks actions; it does not execute them.**

Candidate generation ≠ candidate ranking. The Policy Engine never:

- generates a new action or action_type;
- constructs an unregistered action;
- searches literature / queries an LLM;
- computes information_gain / scientific_value / blocker_resolution itself;
- creates a Task, Approval, or PendingTransition;
- executes a transition or mutates Research State.

## Priority Signals

`ActionPrioritySignals` (immutable) carries six normalized values
(`0.0 <= v <= 1.0`, strictly validated — NaN/inf/out-of-range rejected, no
silent clamp):

| signal | meaning |
| --- | --- |
| `information_gain` | expected reduction in key uncertainty |
| `blocker_resolution` | ability to clear the current blocker |
| `scientific_value` | importance to the research goal |
| `urgency` | deadline / dependency time pressure |
| `cost` | relative resource cost (higher is worse) |
| `risk` | execution risk / uncertain side effects (higher is worse) |

Plus `blocked` (bool) + `block_reason_codes` + `source_refs`.

## Signal Ownership

Signals are **inputs**. Today tests construct them explicitly. In the future,
M4 Domain / M2 Cognition / a scheduler will produce them. M1 only consumes.

## Hard Filtering

Before scoring, each candidate is filtered. A filtered candidate becomes an
`ExcludedPolicyCandidate` with a reason code (never silently dropped):

| Condition | Reason code |
| --- | --- |
| `signals.blocked == True` | `ACTION_BLOCKED` |
| action_type not registered | `UNREGISTERED_ACTION` |
| illegal against current state | `ILLEGAL_ACTION` |
| action.project_id ≠ snapshot | `PROJECT_MISMATCH` |
| action.branch_id ≠ current branch | `BRANCH_MISMATCH` |
| branch not ACTIVE | `BRANCH_NOT_ACTIVE` (all candidates) |

`requires_approval` is **NOT** a policy blocker (Policy decides priority;
Approval controls execution). `SideEffectLevel` is **NOT** hidden policy —
higher risk must be expressed via the explicit `risk`/`cost` signals.

## Scoring Formula (frozen)

```
score = w_ig*information_gain
      + w_br*blocker_resolution
      + w_sv*scientific_value
      + w_ur*urgency
      - w_cost*cost
      - w_risk*risk
```

`PolicyWeights` are non-negative and at least one must be > 0. No hidden
bonuses, no `if action_type == X` hard-coding. `PolicyScoreComponents` records
each term so the total is fully recomputable and auditable.

## Stable Tie Breaking

Equal scores are broken by a fixed key (deterministic, independent of input
order / set / UUID):

1. score descending
2. `action_type` ascending
3. `target_object_id` ascending
4. `action_id` ascending

## Policy Recommendation

`PolicyRecommendation` (immutable) is the full decision record:
`evaluation_id`, `project_id`, `branch_id`, `state_revision`, `policy_id`,
`policy_version`, `status`, `selected_action_id | None`, `ranked_actions`,
`excluded_candidates`, `created_at`.

- ≥1 ranked candidate → `RECOMMENDED`, `selected = ranked[0].action_id`.
- 0 ranked → `NO_ACTION`, `selected = None`, no exception.

## Recommendation Staleness

A recommendation is valid only for the `state_revision` it was produced
against. `is_recommendation_current(recommendation)` returns `False` once the
branch revision advances. There is **no auto-refresh** — a higher layer
re-evaluates explicitly.

> **Recommendation ≠ Authorization.** Even if Policy selected action A1,
> executing A1 still re-passes action legality, branch status, revision
> control, approval, and gates. Policy never bypasses any Control Plane
> constraint.

## Auditability

Every evaluation (RECOMMENDED or NO_ACTION) emits one `POLICY_EVALUATED`
`ControlEvent` with a summary (evaluation_id, policy_id/version, revisions,
counts, selected_action_id). The full signals/weights/score-components/
ranking/exclusions live in the persisted `PolicyRecommendation` (via the
`PolicyRecommendationStore` port). No natural-language reasoning is stored in
events.

## What Policy Does NOT Do

- no LLM ranking / semantic tie-breaker / reasoning model;
- no information-gain inference;
- no candidate generation;
- no task creation / approval creation / state mutation;
- no research domain semantics (ResearchQuestion / Hypothesis / ...).

The Engine stays deterministic; M2 (Cognition) integrates later by producing
explicit signals, not by becoming part of the ranker.
