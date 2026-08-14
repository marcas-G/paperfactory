# Agent Runtime Core

STEP-011 establishes the deterministic execution lifecycle model for M3.

## Purpose

Answer: *How is one execution represented, tracked, paused, completed, failed,
cancelled, timed out, and audited?* — without calling any LLM or Provider.

## M1 / M2 / M3 Boundary

| | M1 Control | M2 Cognition | M3 Runtime |
|---|---|---|---|
| answers | what may happen? | what should the executor see? | how is execution tracked? |
| mutates state | yes (sole authority) | no | no |

Runtime uses opaque typed references (`RuntimeInputRef` / `RuntimeOutputRef`)
for input/output artifacts. It does NOT import cognition or control.

## RuntimeSession

Branch-scoped (`project_id`, `branch_id`). OPEN → CLOSED / CANCELLED.
A session with non-terminal runs cannot be closed/cancelled (`SessionBusyError`).

## RuntimeRun

CREATED → READY → RUNNING → (WAITING / SUCCEEDED / FAILED / CANCELLED / TIMED_OUT).
Terminal states are never revived. Attempt is only created on `start_run`.

## ExecutionAttempt

RUNNING → terminal. `attempt_number` is monotonic (1, 2, 3, ...). Only one
RUNNING attempt per Run is allowed. `resume_run` does NOT create a new attempt.

## Pause / Resume

`pause_run` (RUNNING → WAITING) requires an explicit `wait_reason`. The active
attempt stays RUNNING. `resume_run` (WAITING → RUNNING) does not create a new
attempt or emit ATTEMPT_STARTED.

## Cancellation / Timeout

Cancel from READY has no attempt. Cancel from RUNNING/WAITING cancels the active
attempt. Timeout from RUNNING/WAITING creates a `RuntimeFailure(TIMEOUT)`.

## RuntimeFailure

Classification only (`category`, `code`, `message`, `transient`). Does NOT
trigger automatic retry. Transient is only a hint for future retry policy.

> **Runtime failure describes execution failure, not scientific failure.**
> **Output validation INVALID is not automatically a RuntimeFailure.**

## RuntimeInputRef / RuntimeOutputRef

Opaque typed references. Runtime does not interpret what they point to.

## RuntimeEvent

> **RuntimeEvent records execution facts and is distinct from Research Domain Events.**

Placed in `packages.runtime`. Does NOT inherit DomainEvent. 18 event types
cover session, run, and attempt lifecycle.

> **A transient failure is only a retry hint; the Runtime Core does not automatically retry.**

## Store Ports

Session / Run / Attempt stores + EventSink. `save()` rejects duplicates;
`update()` rejects missing IDs.

## Logical Atomicity

`start_run` / `succeed_run` / `fail_run` / `cancel_run` / `timeout_run`
atomically update both the Run and the Attempt (if any) and emit all events.
No half-state is observable.

## What Is Not Implemented Yet

- Provider Execution Adapter (OpenAI/Anthropic SDK)
- Agent Loop / Skill / Tool / Subagent
- Retry Policy / Checkpoint / Temporal / Sandbox / Permission Runtime / Hooks

A Run may be bound to a versioned AgentDefinition in the CREATED state; see
[Agent Definition & Binding](agent-definition.md). Provider execution is
connected via [RuntimeExecutionCoordinator](provider-execution.md).
