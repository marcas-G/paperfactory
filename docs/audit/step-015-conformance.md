# STEP-015 Conformance Audit

> First end-to-end vertical slice: State → Action → Context → Prompt →
> Provider execution → Output validation → Gate → Transition → Domain Event.
> Baseline HEAD: `0d561a0` (STEP-014). This document is the durable proof
> STEP-015 was completed per spec — it does not depend on chat history.

## Baseline

| Item | Value |
|---|---|
| Initial HEAD | `0d561a0` |
| Branch | `main` |
| Worktree (start) | clean |
| Baseline tests | 816 passed |
| Final tests | 822 passed + 1 opt-in skip (+6, +2 architecture) |
| Architecture tests | 28 passed (+2) |
| ruff | PASS |
| Real-provider smoke | PASS (`deepseek-v4-flash`, opt-in via `DEEPSEEK_API_KEY`) |

## Implemented Contracts

`apps/orchestration/contracts.py`:
- `ActionExecutionRequest` (scope + agent pinning + mode + objective + retrieval requirements)
- `ActionExecutionRecord` (full audit trail: task/bundle/prompt/run/validation/transition/failure)
- `ActionExecutionFailure` (closed kinds: PROVIDER_FAILED / OUTPUT_INVALID / TRANSITION_REJECTED)

`apps/orchestration/action_executor.py`:
- `ResearchActionExecutor` — 7-step deterministic chain, all engines/stores/
  id-factories/clocks constructor-injected; no framework imports; no
  `packages.*.testing` imports
- `ExecutionBindingSpec` — explicit caller pinning (STEP-014 policy)

## Gate Derivation (deterministic, §17)

| Observation | GateStatus | Decision |
|---|---|---|
| output validation VALID | PASS | COMMIT |
| output validation INVALID | FAIL | REJECT |
| provider FAILED | FAIL | REJECT (retry = NEW action execution) |

No LLM ever decides a transition. Runtime failure and scientific failure
remain strictly separate (§26): INVALID output leaves the Run SUCCEEDED.

## Demonstrated Action

`ASSESS_KNOWLEDGE_ITEM` on `KNOWLEDGE_ITEM`: `DRAFT → ASSESSED`, cognitive
mode `VERIFY`, output contract `example-assessment`
(judgement ∈ {SUPPORT, CONTRADICT, INCONCLUSIVE}, confidence ∈ [0,1],
reason_codes).

## Tests

| ID | File | Proves |
|---|---|---|
| INT-SLICE-001 | tests/integration/test_vertical_slice.py | happy path COMMIT: DomainEvent, revision+1, task SUCCEEDED, control+domain+runtime events all recorded |
| INT-SLICE-002 | 〃 | INVALID output: Run SUCCEEDED, transition REJECTED, task FAILED, revision unchanged, no domain event |
| INT-SLICE-003 | 〃 | provider exception: Run FAILED, task FAILED, no transition; failure kind PROVIDER_FAILED |
| INT-SLICE-004 | 〃 | second execution after COMMIT is IllegalActionError (source-state guard) |
| ARCH | tests/architecture/test_boundaries.py | packages ↛ apps (reverse dep); apps ↛ packages.*.testing |
| SMOKE | tests/integration/test_deepseek_smoke.py | real deepseek-v4-flash output (never pro; asserted against GET /models) traverses the entire chain and COMMITs |

## Architecture Conformance

- Composition root is the ONLY production module seeing all three planes.
- No new runtime dependencies added (stdlib urllib in a test file only).
- DeepSeek API key only via `DEEPSEEK_API_KEY` env var; never committed.

## Deviations / Notes

- `ResearchActionExecutor` reaches `controller._tasks.mark_running` (private
  attr) because the facade lacks a public mark_running; documented in code.
  Future step: add `ResearchController.mark_task_running`.
- Provider-failure gate maps to FAIL (not UNCERTAIN/WAIT): an unexecuted
  action must not silently park on the state machine; retries are new
  executions with fresh proposals.
