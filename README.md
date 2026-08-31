# PaperFactory — Research Agent Platform

> A platform that continuously maintains research project state, identifies
> the current key uncertainty, selects the next research action, organizes
> the required context, invokes specialized capabilities to execute, and
> advances research state on the basis of evidence.

The system's core is not "messages" but structured **Research State**.
Chat is only one interaction layer.

## Architecture Overview

**Modular Monolith + Ports & Adapters + Event-driven Domain + Durable
Workers.** See [ADR-001](docs/adr/ADR-001-architecture-style.md).

Seven layers (top-down):

```
M7  Application / UX          apps/
M6  Research Control Plane    packages/control        <- sole Research State mutation authority
M5  Cognitive Control Plane   packages/cognition
M4  Agent Runtime             packages/runtime
M3  Research Capability Layer packages/capabilities
M2  Data / Audit Plane        packages/persistence    <- PostgreSQL system of record (planned)
M1  Domain contracts          packages/domain         <- innermost; no framework deps
```

Plus cross-cutting packages: `observability`, `evals`.

Governance axioms (frozen, see [ADR-002](docs/adr/ADR-002-research-state-ownership.md)):

> **LLM proposes; the system decides.**
> **Tools execute; the controller governs.**
> **Evidence changes research state; prose does not.**

## Current Development Phase

```
Agent Loop / STEP-016
```

The first end-to-end chain is live (State → Action → Context → Prompt →
Provider execution → Output validation → Gate → Transition → Domain Event),
now driven by a self-selecting loop (`apps/orchestration/loop_runner.py`):
it enumerates legal candidates, ranks them, executes the governed chain, and
stops on explicit conditions (budget / no work / branch / stop flag) per
constitution §15.10. See
[docs/architecture/vertical-slice.md](docs/architecture/vertical-slice.md)
and [docs/architecture/agent-loop.md](docs/architecture/agent-loop.md).
Verified against a real LLM (DeepSeek v4-flash, opt-in smoke test) and with
deterministic integration tests. Research capabilities (literature /
experiment / writing), PostgreSQL persistence, and the API/worker apps
arrive in later steps.

## Module Map

| Module                  | Path                         | Role                                              |
| ----------------------- | ---------------------------- | ------------------------------------------------- |
| Application shells      | `apps/api`, `apps/worker`    | API + worker entry points (shells)                |
| Composition root        | `apps/orchestration`         | Vertical-slice wiring (STEP-015)                  |
| Control Plane (M1)      | `packages/control`           | Research process governance                       |
| Cognitive Plane (M2)    | `packages/cognition`         | Context / prompt / cognitive mode                 |
| Agent Runtime (M3)      | `packages/runtime`           | Run / retry / checkpoint / sandbox                |
| Domain (M4)             | `packages/domain`            | Typed Research Objects, events, invariants        |
| Capabilities (M5)       | `packages/capabilities`      | Literature / code / experiment / writing          |
| Persistence (M6)        | `packages/persistence`       | PostgreSQL adapters, event store                  |
| Observability           | `packages/observability`     | Logs / traces / metrics / audit telemetry         |
| Evals                   | `packages/evals`             | Platform-level evaluation harness                 |

Each module has a README documenting Responsibility / Owns / Must Not Own /
Allowed Dependencies. Cross-module rules live in
[docs/architecture/dependency-rules.md](docs/architecture/dependency-rules.md).

## Development Commands

```bash
uv sync                 # install dev tooling (pytest, ruff)
uv run pytest           # run tests (incl. architecture tests)
uv run ruff check .     # lint
```

## Global Constitution

The project-wide engineering constitution lives at
[`.claude/CLAUDE.md`](.claude/CLAUDE.md). It is the highest-level
constraint on all design and code in this repository.

## ADRs

Architecture Decision Records live in [`docs/adr/`](docs/adr/):

- [ADR-001 — Architecture Style](docs/adr/ADR-001-architecture-style.md)
- [ADR-002 — Research State Ownership](docs/adr/ADR-002-research-state-ownership.md)
- [ADR-003 — Technology Baseline](docs/adr/ADR-003-technology-baseline.md)

## Technology Baseline

See [ADR-003](docs/adr/ADR-003-technology-baseline.md). Target stack is
Python / FastAPI / Pydantic / SQLAlchemy 2.x / Alembic / Pydantic AI /
Temporal / PostgreSQL / pgvector / OpenTelemetry / Next.js. **None of
these runtime dependencies are installed yet** — only `pytest` and `ruff`.
