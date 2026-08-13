# ADR-002: Research State Ownership

## Status

Accepted

## Context

The platform's core is not "messages" but structured Research State
(current Research Question, Gap, Hypotheses, rejected directions, active
Experiments, frozen Protocols, Evidence, Claims, open uncertainties,
blocking issues, pending decisions, reviewer concerns — see constitution
§11). If any layer can mutate this state freely, the system loses
consistency, controllability, and auditability.

There are many parties that touch state-adjacent work: the LLM (reasoning),
agents (execution), capabilities (search, code, experiment), the cognitive
plane (context/prompt), and persistence adapters (storage). Letting any of
them directly change research state leads to:

- Prose-driven state changes (LLM says "X is now a confirmed claim").
- Hidden mutations bypassing gates and approvals.
- Untraceable history ("why is the state this way?").
- Post-hoc, silent modification of confirmatory rules (§14).

## Decision

**The Research Control Plane (`packages/control`) is the sole business-layer
authority for Research State mutation.**

All Research State transitions flow through:

```
Current State
  -> Action
  -> Transition Proposal   (LLM/agent may PROPOSE here)
  -> Precondition Check
  -> Invariant Check
  -> Gate Evaluation
  -> Permission Check
  -> Human Approval (if required)
  -> Commit                    (only the Control Plane commits)
  -> Domain Event
```

The following are frozen as the platform's inviolable governance axioms:

> **LLM proposes; the system decides.**

> **Tools execute; the controller governs.**

> **Evidence changes research state; prose does not.**

Consequently, none of the following may bypass the Control Plane to commit
a research state transition directly:

- **Agent** (runtime)
- **Capability** (literature, code, experiment, writing, ...)
- **Tool** (atomic execution)
- **Cognition** (context/prompt compilation)
- **Persistence Adapter** (storage)

LLM output, capability output, and tool output are **Proposals /
Observations**, never State mutations.

## Alternatives Considered

- **Let agents commit state directly.** Rejected: makes the LLM a black-box
  brain that owns state (prohibited by §23, §24); destroys auditability and
  gate enforcement.
- **Let the database/persistence layer be the source of truth AND the
  mutation authority.** Rejected: persistence implements ports (§17, RULE-07);
  it must not define research semantics or gate logic.
- **Encode governance purely in prompts ("please don't change the state").**
  Rejected: prompts are not system architecture (§18); program-level gates
  and Context Policy are required for blinding and control (§16, §17, §20).

## Consequences

- Positive: single, auditable mutation path; every transition produces a
  Domain Event; replay/recovery is feasible.
- Positive: gates and approvals are enforced deterministically where
  possible (§17, RULE-03).
- Negative: every state change must traverse the Controller, which adds
  ceremony; the Controller must be designed for this without becoming a
  bottleneck.
- Operational: the Control Plane must stay deterministic and
  framework-agnostic; semantic judgment is the only place LLMs participate,
  and only behind declared semantic gates.
