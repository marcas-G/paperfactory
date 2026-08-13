# ADR-001: Architecture Style

## Status

Accepted

## Context

The Research Agent Platform is a long-lived system that must prioritize, in
order (per the global constitution §50):

1. Correctness
2. State consistency
3. Controllability
4. Auditability
5. Recoverability
6. Testability
7. Extensibility
8. Agent intelligence

We are at project inception with zero existing code. The system must
support non-linear research workflows (loops, rollback, branches, pause,
re-open, correction, parallel research lines) and must keep research
semantics isolated from infrastructure (§38). At the same time we must not
prematurely optimize for unknown scale (§39, §40).

The key forces:

- Research State must have a single, versioned, recoverable source of truth.
- Mutation must be governed (gated, approved, auditable), not free-form.
- Module boundaries must be clear and stable enough to evolve
  independently.
- We must be able to ship and iterate a vertical slice quickly.

## Decision

Adopt the following architecture style:

- **Modular Monolith** — one Python repository, one deployable unit,
  with strict module boundaries (M1..M7) rather than microservices.
- **Ports & Adapters** (Hexagonal) — Domain / Control define ports;
  infrastructure (DB, vector store, LLM SDKs, external APIs) lives in
  adapters. Infrastructure depends on Domain, never the reverse.
- **Event-driven Domain** — important state changes produce immutable
  Domain Events; the system can always answer "why is the state this way?".
- **Durable Workers** — long-running research tasks are durable
  (checkpoint, resume, retry policy, cancel).
- **Top-down Skeleton + Vertical Increment** — establish the full module
  boundary skeleton first, then deliver one minimal vertical chain
  (State -> Action -> Context -> Execution -> Observation -> Gate ->
  Transition -> Event) at a time.

We will NOT adopt microservices in the early phases.

## Alternatives Considered

- **Microservices from day one.** Rejected: introduces distributed-systems
  complexity (network failure, consistency across services, deployment
  coordination) before the domain model is stable. Prohibited by §39/§40
  unless justified by a future ADR.
- **Single-layer monolith with no port abstractions.** Rejected: couples
  domain semantics to framework choices, violating §38 ("Infrastructure
  depends on Domain, not the reverse") and preventing testability.
- **Agent-framework-as-core-controller** (e.g. LangGraph/CrewAI as the
  control plane). Rejected: the constitution requires the Controller to be
  deterministic and framework-agnostic (§24); an agent framework must be a
  capability/runtime concern, not the state authority.

## Consequences

- Positive: clear boundaries, high testability, easy refactor, cheap
  vertical-slice delivery, recoverability is a first-class concern.
- Positive: we can defer distributed-systems decisions until scale demands
  them, each backed by its own ADR.
- Negative: module discipline must be maintained manually (and later by
  architecture tests); "modular" can degrade to "monolith" if boundaries
  erode.
- Neutral: a single deployable does not prevent logical isolation; the
  same packages can be extracted later if a future ADR justifies it.
