# STEP-016 Conformance Audit

> Agent Loop: candidate generation + policy ranking + budget/stop semantics
> (constitution §15.10 Explicit Stop). The system's first component that
> selects, executes, counts, and stops itself.
> Baseline HEAD: `5698552` (STEP-015). Durable proof; not chat-dependent.

## Baseline

| Item | Value |
|---|---|
| Initial HEAD | `5698552` |
| Branch | `main` |
| Worktree (start) | clean |
| Baseline tests | 822 passed |
| Final tests | 852 passed + 1 opt-in skip (+30) |
| Architecture tests | 28 passed |
| ruff | PASS |
| pyright | 107 errors (baseline 111 − 3 fixed in STEP-015 tests; no new debt) |

## Implemented Contracts

`packages/control/candidates.py` (STEP-016):
- `SignalProvider` Protocol — produces signals for one candidate; keeps the
  "signals are upstream inputs" boundary of STEP-005 intact
- `ActionCandidateEnumerator` — deterministic candidate production from
  snapshot × registry (object id asc × registration order; fresh ActionId;
  no object-type filter — known limitation, typed objects arrive in 017)
- `is_branch_actionable`

`packages/control/loop.py` (STEP-016):
- `LoopBudget` (max_iterations / max_consecutive_failures / max_total_failures, all >= 1)
- `LoopStopReason` (closed enum: NO_CANDIDATES, BUDGET_ITERATIONS,
  BUDGET_CONSECUTIVE_FAILURES, BUDGET_TOTAL_FAILURES, BRANCH_NOT_ACTIONABLE,
  UNPLANNED_ACTION, EXTERNAL_STOP)
- `LoopStopDecision` + `evaluate_stop` (pure, frozen check order)
- `LoopRunStatus` (RUNNING / COMPLETED / STOPPED) + `status_for_stop_reason`
- `LoopIterationRecord` / `LoopRunRecord` (immutable audit trail)

`packages/domain/events.py`:
- `ControlEventType` += LOOP_STARTED / LOOP_ITERATION_COMPLETED / LOOP_STOPPED

`packages/control/controller.py`:
- `mark_task_running` public facade (closes the STEP-015 private access)

`packages/cognition/retrieval_engine.py`:
- `RetrievalResolver.catalog` property (closes the STEP-015 `_catalog` access)

`apps/orchestration/loop_runner.py`:
- `LoopActionSpec` (cognitive plan for one action_type)
- `ResearchLoopRunner` — drives N STEP-015 executions; injects executor,
  enumerator, provider, and stop-flag callback; emits LOOP_* events

## Tests

| ID | File | Proves |
|---|---|---|
| CAND-001..008 | tests/control/test_candidates.py | enumeration determinism, source-state filter, non-ACTIVE empty, fresh ActionId, injected SignalProvider |
| LOOP-001..015 | tests/control/test_loop.py | budget validation, full stop-reason matrix, frozen order, status mapping, record invariants |
| LOOP-INT-001..005 | tests/integration/test_agent_loop.py | drain-and-complete, iteration budget, consecutive-failure budget, unplanned-action stop, failure→success streak reset |

## Scope Decisions

- `NO_CANDIDATES` → COMPLETED (a research outcome), budget/branch/external →
  STOPPED (watchdog events). Never conflated.
- Provider-failure gate maps to FAIL (as STEP-015), so a failed loop
  iteration is counted, not parked on the state machine.
- `ResearchLoopRunner` lives in `apps/orchestration`, NOT `packages.control`:
  the control plane owns contracts, the composition root drives the runtime.
- The loop never calls an LLM; only the STEP-015 leaf does.
