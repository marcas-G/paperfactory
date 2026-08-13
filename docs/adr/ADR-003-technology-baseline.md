# ADR-003: Technology Baseline

## Status

Accepted

## Context

The architecture style (ADR-001) is framework-agnostic, but the team must
still converge on a concrete technology baseline so that adapters can be
built consistently and future contributors know the target stack. The
global constitution (§40) forbids introducing complex infrastructure
without justification; this ADR records the intended baseline and —
critically — separates **decided direction** from **what is actually
installed today**.

At STEP-001 there is no runtime module that needs any of these dependencies
yet. Installing them now would violate the constitution's
minimal-change / no-premature-infrastructure guidance and would create
locked-in dependencies before their usage shape is known.

## Decision

The target technology baseline for the platform is:

| Concern                       | Technology                          |
| ----------------------------- | ----------------------------------- |
| Backend language              | Python (>= 3.11)                    |
| API                           | FastAPI                             |
| Validation / contracts        | Pydantic                            |
| ORM                           | SQLAlchemy 2.x                      |
| Migration                     | Alembic                             |
| Agent executor                | Pydantic AI                         |
| Durable workflow              | Temporal                            |
| System of record              | PostgreSQL                          |
| Vector store                  | pgvector                            |
| Artifacts                     | S3-compatible / MinIO               |
| Observability                 | OpenTelemetry                       |
| Frontend                      | Next.js + TypeScript                |
| Research graph UI             | React Flow                          |
| Experiment isolation          | Docker                              |
| External tool protocol        | MCP where appropriate               |

## Currently Installed (STEP-001)

Explicitly distinguished from the table above:

- **ARCHITECTURE_DECISION**: everything in the table above is the agreed
  target baseline.
- **CURRENTLY_INSTALLED**: none of the runtime dependencies above are
  installed. Only dev tooling is installed: `pytest`, `ruff`, and `uv`.

Runtime dependencies will be added incrementally, per vertical slice, as
the consuming module actually requires them. Each non-trivial addition
should land alongside the code that uses it.

## Source of Truth

**PostgreSQL WILL be the Research State system of record** (per
constitution §35).

However, **STEP-001 does not implement PostgreSQL persistence.** Until a
real persistence adapter exists, an in-memory fake / test state store may
be used for Controller tests.

The Domain and Control layers MUST NOT depend on the database directly. A
port is defined in the Domain layer and implemented by a persistence
adapter; the in-memory fake is simply another adapter satisfying the same
port. This keeps the path to PostgreSQL a pure adapter swap, not a rewrite.

## Alternatives Considered

- **Install the full baseline now.** Rejected: no module consumes these
  deps yet; premature lock-in and a heavy install before usage shape is
  known.
- **Defer deciding the baseline entirely.** Rejected: converging on a
  target now prevents fragmentation later; recording it here costs nothing
  and gives every adapter a consistent target.
- **SQLite as system of record.** Rejected for the production target:
  research state needs concurrent writers, typed relations, and pgvector;
  PostgreSQL is the chosen SoT. (SQLite remains acceptable as a test
  fixture where appropriate.)
- **LangGraph / CrewAI / AutoGen as the agent executor or controller.**
  Rejected as the core controller (per ADR-002 and §40). Pydantic AI is
  the chosen agent executor; the controller stays deterministic.

## Consequences

- Positive: clear target stack; adapters can be built consistently.
- Positive: no premature runtime dependencies; STEP-001 stays minimal.
- Positive: SoT migration is an adapter swap, not a rewrite, because
  Domain/Control never depend on the DB.
- Negative: discipline required to add deps lazily and not let the
  "ARCHITECTURE_DECISION" list silently imply "CURRENTLY_INSTALLED".
- Operational: a follow-up ADR will be required before adopting any
  infrastructure NOT in this baseline (Neo4j, Qdrant, Pinecone, Kafka,
  Kubernetes, etc.) per §40.
