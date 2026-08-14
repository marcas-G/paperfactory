# Model Selection Policy

> STEP-014 architecture note. A deterministic, auditable policy that
> recommends which already-allowed `ModelExecutionProfile` to use for a Run,
> using ONLY explicit Requirements + explicit Signals.

## 1. Purpose

Once a Run has been decided, answer:

> "Which already-allowed ModelExecutionProfile should this Run use?"

It produces a `ModelSelectionRecommendation`. It does NOT bind, does NOT
choose a Config, does NOT call a provider.

## 2. Model Selection vs Research Policy

| | M1 ResearchPolicy | M3 ModelSelectionPolicy |
|---|---|---|
| Question | "What research Action next?" | "Which allowed profile for this Run?" |
| Semantics | information gain, scientific value, blockers | quality/cost/latency/reliability signals |
| Module | `packages.control` | `packages.runtime` |

They share no class, no scoring semantic, and never import each other.
`ModelSelectionPolicy` understands no research semantics — no hypothesis,
evidence, gap, or blocker.

## 3. Candidate Universe = Agent Allowed Profiles

The candidate universe is **exactly**
`AgentDefinition.allowed_execution_profiles`. The engine never scans the full
Profile registry — that would bypass AgentDefinition compatibility. A missing
allowed profile (not registered) is a `ModelSelectionProfileResolutionError`
(incomplete agent configuration), never silently ignored.

## 4. Explicit Requirements

`ModelSelectionRequirement` hard-filters candidates:

- `required_capabilities ⊆ profile.capabilities`
- `required_parameters ⊆ profile.supported_parameters`
- `allowed_providers` empty OR `profile.provider.name ∈ allowed_providers`
- `profile.ref ∉ forbidden_profiles`

## 5. Explicit Signals

`ModelSelectionSignals` per candidate profile:

- `quality`, `cost_efficiency`, `latency`, `reliability` — floats in [0, 1].
  NaN / inf / <0 / >1 rejected.
- `available: bool`
- `reason_codes: tuple[str, ...]` — if `available=False`, must be non-empty.

## 6. No External Signal Derivation

The runtime never queries prices, benchmarks, latency monitors, calls an LLM,
or estimates quality. Signals are explicit caller inputs. M3 only consumes
them, so selection does not depend on time-varying external data.

## 7. Hard Filtering

Before scoring, candidates are excluded for: missing capability, missing
parameter support, provider not allowed, profile forbidden, or
`available=False`. Each exclusion produces an `ExcludedModelCandidate` with a
stable `ModelSelectionExclusionReason` (not a free-text message).

## 8. Deterministic Scoring

```
score = w_quality * quality
      + w_cost_efficiency * cost_efficiency
      + w_latency * latency
      + w_reliability * reliability
```

Weights are `>= 0` with at least one `> 0`. No provider/model hidden bonus.
Score components are auditable (`ModelSelectionScoreComponents`) and fully
reconstructable from signals + weights.

## 9. Stable Tie-break

Sort key: score descending, then `profile_id` lexical ascending, then
`profile_version` lexical ascending. No registry insertion order, no set
order, no randomness.

## 10. Recommendation

`ModelSelectionRecommendation`:

- `RECOMMENDED` when at least one candidate survives → `selected == rank-1`.
- `NO_MATCH` when all filtered → `selected is None`.

## 11. Recommendation != Binding

`ModelSelectionEngine.evaluate` creates NO binding, NO Run/Attempt, calls NO
provider, and is wired to no binding store / run store. It only returns (and
persists) a Recommendation.

## 12. Recommendation Does Not Select Config

The Recommendation carries no Config choice. Even after a profile is
recommended, the caller must explicitly pick an exact Config version and call
`AgentBindingManager.bind`. (A future Config Selection Policy is not this
step.)

## 13. No default / latest / first

No default policy, no latest profile, no first-allowed implicit choice. The
caller supplies an explicit `ModelSelectionPolicy` (weights) and explicit
signals. Signal completeness is enforced: exactly one signal set per allowed
profile — missing, duplicate, or extra signals fail evaluation.

## 14. Auditability

Each Recommendation gets an `evaluation_id`, records the exact Agent version
and Policy version, the requirement, ranked + excluded candidates with scores
and reason codes, and is persisted via `ModelSelectionRecommendationStore`.
It is an audit artifact.

## 15. What Is Not Implemented Yet

- Real Provider Adapter (OpenAI / Anthropic SDK) + provider parameter mapping.
- Dynamic metric collection / model benchmark service / live price lookup.
- Config Selection Policy (caller still picks an exact Config explicitly).
- Agent Loop / Tool / Skill / Subagent / Retry / Checkpoint / Temporal /
  Sandbox / Permission Runtime.
