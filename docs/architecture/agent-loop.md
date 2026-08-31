# Agent Loop (STEP-016)

The first self-driving component. It wires the STEP-015 governed chain into
a loop that **selects, executes, counts, and stops itself** — the operational
expression of constitution §15.7 (Uncertainty Driven) and §15.10 (Explicit
Stop).

```
                    ┌────────────────────────────────────────────┐
                    │              evaluate_stop (§15.10)         │
                    │  overflow? / not actionable? / stop flag?   │
                    └──────┬──────────────────────────────┬───────┘
                           │ no                           │ yes
                           ▼                              ▼
                enumerate legal candidates         LOOP_STOPPED
                (control/candidates.py)        record stop_reason
                           │                        + exit
                           ▼
                rank via ResearchPolicyEngine
                (audit: POLICY_EVALUATED)
                           │
                           ▼ no
                policy RECOMMENDED? ──────────────────────────▶ NO_CANDIDATES
                           │                                    (COMPLETED)
                           ▼ yes
                cognitive plan for action_type? ── no ─▶ UNPLANNED_ACTION
                           │                                    (STOPPED)
                           ▼
                execute via ResearchActionExecutor (STEP-015 chain)
                           │
                           ▼
                update failure counters
                (commit clears consecutive streak)
                           │
                           ▼
                LOOP_ITERATION_COMPLETED
                           │
                           └── back to evaluate_stop
```

## Stop semantics (frozen order)

`evaluate_stop` is a pure function; check order is fixed and tested:

| # | Reason | Meaning | Run status |
|---|---|---|---|
| 1 | `EXTERNAL_STOP` | injected stop flag (user / upstream) returned true | STOPPED |
| 2 | `BRANCH_NOT_ACTIONABLE` | branch not ACTIVE, no legal actions at all | STOPPED |
| 3 | `BUDGET_ITERATIONS` | reached `max_iterations` | STOPPED |
| 4 | `BUDGET_CONSECUTIVE_FAILURES` | reached `max_consecutive_failures` | STOPPED |
| 5 | `BUDGET_TOTAL_FAILURES` | reached `max_total_failures` | STOPPED |
| — | `NO_CANDIDATES` | policy returned NO_ACTION — nothing legal left to do | **COMPLETED** |
| — | `UNPLANNED_ACTION` | selected action_type has no cognitive plan | STOPPED |

The `NO_CANDIDATES` → COMPLETED distinction is deliberate: running out of
(legal) work is a *research outcome*, while budget/branch/external endings
are *watchdog events* — never silently surfaced as a success.

## Why the loop never calls an LLM

Selection uses the deterministic `ResearchPolicyEngine`; the only "model"
content is the provider output inside a single STEP-015 execution. This is
constitution §23: deterministic code first, LLM only as a governed leaf.
The loop re-reads Research State each iteration, so a COMMIT naturally
removes that object from the candidate set (source state changed); an
already-committed object is never re-executed.

## Failure accounting

* A failed iteration (provider failure OR cognitive INVALID OR rejected
  transition) increments both `total_failures` and `consecutive_failures`.
* A committed iteration resets `consecutive_failures` to 0.
* `ActionExecutionFailure.kind` already classifies runtime vs scientific, so
  the loop counts, it does not judge.

## Auditability

Every loop emits `LOOP_STARTED` → `LOOP_ITERATION_COMPLETED`* → `LOOP_STOPPED`.
The `LOOP_STOPPED` payload carries `{reason, detail, iterations, status}`, so
§33's "why did the run end?" is answerable from events alone.

## Where it lives

`apps/orchestration/loop_runner.py` — another composition-root service. It is
not part of `packages.control`; the control plane owns the *contracts*
(`LoopBudget`, `LoopStopReason`, `evaluate_stop`) but not the driving loop,
keeping M1 free of runtime/provider imports. The runner injects the
`ResearchActionExecutor` (015) and a `ProviderExecutionPort`.
