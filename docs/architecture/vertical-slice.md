# Vertical Slice (STEP-015)

The first end-to-end chain through all planes, per the constitution §49
(Top-down Skeleton + Vertical Increment):

```
Control task (RUNNING)
  -> RetrievalResolver.resolve          (M2, deterministic)
  -> ContextCompiler.compile            (M2, deterministic)
  -> PromptAssembler.assemble           (M2, deterministic)
  -> OpenAIProjector.project            (M2, deterministic)
  -> Session / Run / Binding / Execute  (M3, deterministic)
  -> OutputValidationEngine.validate    (M2, deterministic)
  -> GateResult (derived, deterministic)
  -> propose + execute transition       (M1 — sole state authority)
  -> DomainEvent on COMMIT
```

## Where the wiring lives

`apps/orchestration` — the M7 composition root. It is the ONLY production
location allowed to see control + cognition + runtime at once; production
packages never cross-import (enforced by `tests/architecture/test_boundaries.py`).

| Contract | Where | Purpose |
| --- | --- | --- |
| `ActionExecutionRequest` | `apps/orchestration/contracts.py` | One action execution: scope, agent pinning, mode, objective, retrieval requirements |
| `ActionExecutionRecord` | `apps/orchestration/contracts.py` | Full audit trail: task, bundle, prompt, run, validation, transition, failure |
| `ActionExecutionFailure` | `apps/orchestration/contracts.py` | Structured failure: `PROVIDER_FAILED` / `OUTPUT_INVALID` / `TRANSITION_REJECTED` |
| `ResearchActionExecutor` | `apps/orchestration/action_executor.py` | Sequences the chain; every engine injected, no business rules |
| `ExecutionBindingSpec` | `apps/orchestration/action_executor.py` | Caller's explicit agent/profile/config pinning (STEP-014 policy) |

## Gate derivation (deterministic)

Provider output conformance maps directly onto the control plane's gate
model — no LLM ever decides a transition:

| Observation | GateStatus | Aggregate decision |
| --- | --- | --- |
| validation VALID | `PASS` | COMMIT |
| validation INVALID | `FAIL` | REJECT |
| provider FAILED | `FAIL` | REJECT (task FAILED; retry is a NEW action) |

## Failure semantics (runtime ≠ scientific, §26)

* Provider exception/HTTP failure → Run FAILED, task FAILED, no transition,
  classified `PROVIDER_FAILED`. Retryable class, but never auto-retried.
* Valid run, INVALID output → Run stays SUCCEEDED, transition REJECTED,
  task FAILED, classified `OUTPUT_INVALID`. Scientific outcome — enters
  analysis, never retry.
* Illegal action (e.g. object already ASSESSED) → `IllegalActionError`
  before any prompt is built. State machine stays authoritative.

## State-consistency guarantees observed

* `state_revision` threads through ContextRequest → Bundle → PromptPackage
  → OutputCandidate unchanged; staleness raises at each boundary.
* COMMIT bumps revision exactly once; a second identical action fails
  `assert_action_legal` (source state no longer DRAFT).
* All events recorded: DomainEvent (state store), ControlEvent (task
  lifecycle, transition), RuntimeEvent (run/attempt/provider).

## Demonstrated action

`ASSESS_KNOWLEDGE_ITEM`: object `KNOWLEDGE_ITEM` `DRAFT → ASSESSED`,
cognitive mode `VERIFY`, output contract `example-assessment`
(judgement/confidence/reason_codes). Deliberately domain-light — it proves
the governance chain, not research semantics.

## Tests

| Test | Proves |
| --- | --- |
| `INT-SLICE-001` | happy path: provider VALID → COMMIT → DomainEvent, revision+1, task SUCCEEDED |
| `INT-SLICE-002` | INVALID output: Run SUCCEEDED, transition REJECTED, task FAILED, revision unchanged, no event |
| `INT-SLICE-003` | provider exception: Run FAILED, task FAILED, no transition |
| `INT-SLICE-004` | re-execution after COMMIT is illegal (source-state guard) |
| DeepSeek smoke (opt-in) | real `deepseek-v4-flash` output traverses the whole chain and COMMITs |

Real-provider smoke is opt-in (`DEEPSEEK_API_KEY` env var), stdlib-only
(urllib), and uses a flash-class model — never pro.
