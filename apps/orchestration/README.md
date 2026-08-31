# apps/orchestration — Composition Root (M7, STEP-015)

## Responsibility

Wire the control / cognition / runtime planes into ONE governed action
execution chain. See
[docs/architecture/vertical-slice.md](../../docs/architecture/vertical-slice.md).

## Owns

- `ActionExecutionRequest` / `ActionExecutionRecord` /
  `ActionExecutionFailure` (typed application-edge DTOs)
- `ResearchActionExecutor` (pure sequencing; all engines/stores injected)
- `ExecutionBindingSpec` (explicit agent/profile/config pinning)

## Must Not Own

- Business rules (gates, policies, validation logic — those live in planes)
- Persistence or framework concerns
- Any knowledge of how a provider is reached (the `ProviderExecutionPort`
  is injected per execution)

## Allowed Dependencies

All of `packages.control`, `packages.cognition`, `packages.runtime`,
`packages.domain`. It must NOT import `packages.*.testing` (production code
runs on real ports; in-memory adapters are test/dev only). No production
package may import `apps.*` (reverse-dependency prohibition).

## Determinism

Every engine, store, id factory and clock is constructor-injected, so the
whole chain is reproducible in tests (fixed clock + sequential ids).
