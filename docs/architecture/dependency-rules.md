# Architecture Dependency Rules

These rules govern module-to-module and module-to-framework dependencies
across the whole platform. They are the operational expression of the
global constitution (`.claude/CLAUDE.md`, especially §10 and §38).

The intended dependency direction is top-down:

```
Application  ->  Control Plane  ->  Cognitive / Runtime  ->  Capabilities  ->  Data / Infrastructure
```

"Upper layers define why and when; lower layers define how."

## RULE-01

`domain` does not depend on any framework / infrastructure implementation.

It MUST NOT import FastAPI, SQLAlchemy ORM, Temporal, Pydantic AI,
OpenAI / Anthropic SDKs, or external scholarly APIs.

## RULE-02

`control` MAY depend on `domain` contracts.

## RULE-03

`control` is the sole business-layer Research State mutation authority.

No other business layer may commit a Research State transition directly.

## RULE-04

`cognition` MAY read `domain` contracts / state representation, but MUST
NOT commit state.

## RULE-05

`runtime` does not understand research-domain semantics.

It MUST NOT encode hypothesis judgement, novelty policy, or claim policy.

## RULE-06

`capabilities` MUST NOT directly modify Research State.

A capability returns a structured observation / result only.

## RULE-07

`persistence` implements ports; it MUST NOT reverse-define the Domain.

Infrastructure depends on Domain; the reverse is forbidden.

## RULE-08

LLM output is a Proposal / Observation, never a State mutation.

> LLM proposes; the system decides.

## RULE-09

No cross-module cyclic dependencies.

## RULE-10

Framework-specific imports MUST stay at the adapter / infrastructure
boundary, not leak into domain / control / cognition cores.

---

## Enforcement

During STEP-001 these rules are documented and partially covered by import
smoke tests (`tests/architecture/`). As concrete code lands, architecture
tests under `tests/architecture/` will be strengthened to assert these
rules programmatically (e.g. layer-level import boundaries, banned-import
checks).
