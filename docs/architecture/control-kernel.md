# Control Kernel

The Control Kernel is the first real software in the platform: a
domain-agnostic, deterministic, LLM-free, database-free transition kernel
that lives in `packages/control` over `packages/domain` primitives. It is
the operational expression of ADR-002 (Research State Ownership).

## Purpose

Make the system able to express, end to end and with no external services:

```
Current State -> Research Action -> Transition Proposal ->
Gate Result -> Commit / Reject -> Domain Event -> New State
```

Everything above is **typed** and **deterministic**. The kernel does not yet
know what a Hypothesis or a Gap is — it only knows how to govern an object
moving from one state label to another under a set of gates.

## Core Contracts

| Contract | Where | Immutable | Purpose |
| --- | --- | :---: | --- |
| `ProjectId` / `ObjectId` / `ActionId` / `EventId` / `TaskId` / `BranchId` / `RunId` | `domain.ids` | n/a (NewType) | Stop bare `str` identity propagation |
| `GateStatus` `PASS/FAIL/UNCERTAIN/BLOCKED` | `domain.enums` | yes | Single-gate outcome |
| `TransitionDecision` `COMMIT/REJECT/WAIT` | `domain.enums` | yes | Aggregated decision |
| `ActorType`, `SideEffectLevel` | `domain.enums` | yes | Who acts / reserved permission ladder |
| `ResearchStateSnapshot` | `domain.models` | yes | Immutable state view (revision + object states) |
| `DomainEvent` | `domain.events` | yes | Immutable fact record of a committed transition |
| `ResearchActionDefinition` / `ResearchAction` | `control.actions` | yes | Registered action type vs concrete instance |
| `GateResult` | `control.gates` | yes | One gate's outcome (status + reason codes) |
| `StateTransitionProposal` | `control.proposals` | yes | A not-yet-committed transition (carries `expected_revision`) |
| `StateStore` (Protocol) | `control.store` | n/a | Persistence port (Ports & Adapters) |
| `TransitionEngine` | `control.engine` | n/a | Validate -> decide -> commit -> emit event |
| `ActionRegistry` | `control.registry` | n/a | Catalog of registered action definitions |
| `ResearchController` | `control.controller` | n/a | Thin facade: state / legal actions / propose / commit |
| `InMemoryStateStore` | `control.testing` | n/a | Test/dev adapter (NOT a public control API) |

## Transition Lifecycle

1. **Read** the current `ResearchStateSnapshot` for `(project, branch)`.
2. **List legal actions**: for a target object, definitions whose
   `allowed_source_states` contain the object's current state.
3. **Propose**: build a `StateTransitionProposal` carrying the current
   `expected_revision` and `from_state`, plus the gate results.
4. **Decide**: `aggregate_gates(proposal.gate_results)` -> a
   `TransitionDecision`.
5. **Commit**: on `COMMIT`, the engine verifies `from_state`, builds a
   `DomainEvent`, and atomically applies it through the `StateStore`:
   verify `expected_revision`, verify `from_state`, set new state,
   `revision += 1`, record the event, return a new immutable snapshot.
6. On `REJECT` or `WAIT` the engine raises `TransitionRejectedError`; no
   state changes, no event.

## Gate Aggregation Rule

Deterministic, no LLM (precedence top-down):

| Gate combination | Decision |
| --- | --- |
| all `PASS` | `COMMIT` |
| any `FAIL` | `REJECT` |
| `BLOCKED` without `FAIL` | `WAIT` |
| `UNCERTAIN` without `FAIL`/`BLOCKED` | `WAIT` |
| zero gates | `COMMIT` |

The Controller decides on `GateStatus`, never on `GateResult.message`.

## State Ownership

Per ADR-002, the Control Plane (`packages/control`) is the **sole
business-layer Research State mutation authority**. Agents, capabilities,
tools, cognition, and persistence adapters may only **propose**; only the
Transition Engine commits. There is no `set_status(...)` /
`store.force_update(...)` public mutation path — transitions must traverse
the engine. The in-memory store's `seed_snapshot` is a test/dev helper and
is explicitly **not** part of the `StateStore` Protocol.

## Optimistic Revision

Every proposal carries `expected_revision`. On commit, the store checks:

```
proposal.expected_revision == current_snapshot.revision
```

A mismatch raises `StaleStateError` and nothing is committed. This is the
first real state-consistency protection; it survives the later move to
PostgreSQL because the Domain/Control layers never depend on the database.

## Error Taxonomy

`ControlError` base, with: `IllegalActionError`, `StaleStateError`,
`TransitionRejectedError`, `InvariantViolationError`,
`ActionNotRegisteredError`, `DuplicateActionError`. The exception **type**
encodes the failure category; messages are human context only.

## What Is Explicitly Not Implemented Yet

The following are deliberately out of scope for the kernel and arrive in
later steps:

- Research semantics (ResearchQuestion, Gap, Hypothesis, Experiment, Claim,
  Evidence, Protocol, …)
- Research Policy (action ranking, prioritization)
- Task DAG
- Cognition (CognitiveMode, ContextCompiler, PromptPolicy, BlindingPolicy)
- Agent Runtime (Pydantic AI, Session/Run, sandbox, hooks)
- Persistence (PostgreSQL, SQLAlchemy, Alembic, event store)
- LLM integration (any provider SDK)

The kernel is intentionally a *control* artifact, not a *research* artifact.
