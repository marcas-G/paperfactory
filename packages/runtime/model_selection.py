"""Deterministic Model Selection Policy (STEP-014).

Selects which already-allowed ModelExecutionProfile to recommend for a Run,
using ONLY explicit Requirements + explicit Signals provided by the caller.

Layering (STEP-014):

    AgentDefinition.allowed_execution_profiles  (candidate universe)
        ↓
    ModelSelectionRequirement   (hard filters)
        ↓
    ModelSelectionSignals       (per-profile explicit inputs)
        ↓
    ModelSelectionPolicy        (weights + formula)
        ↓
    ModelSelectionRecommendation (RECOMMENDED | NO_MATCH)
        ↓ explicit caller decision (Config + AgentBindingManager.bind)

Hard rules (STEP-014):

* Model Selection != Research Action selection. This module understands NO
  research semantics (information gain / scientific value / hypothesis /
  evidence / blocker). It shares NOTHING with M1 ResearchPolicy.
* No external signal derivation: never queries prices, benchmarks, latency
  monitors, or calls an LLM. Signals are explicit caller inputs.
* Candidate universe is EXACTLY AgentDefinition.allowed_execution_profiles —
  never a full registry scan.
* One complete signal set per allowed Profile (no missing, no duplicate, no
  extra). No default-zero signals.
* Deterministic scoring: fixed weighted sum. No provider/model hidden bonus.
* Stable tie-break: score desc, profile_id lexical asc, version lexical asc.
* Recommendation != Binding. evaluate() creates NO binding, NO Run/Attempt,
  calls NO provider, selects NO Config.
* No default/latest/first-profile implicit selection.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, runtime_checkable

from ..domain.ids import (
    AgentId,
    ModelSelectionEvaluationId,
    ModelSelectionPolicyId,
)
from .errors import (
    InvalidModelSelectionPolicyError,
    InvalidModelSelectionSignalsError,
    ModelExecutionProfileNotFoundError,
    ModelSelectionProfileResolutionError,
    ModelSelectionSignalSetError,
)
from .model_execution import ModelCapability, ModelParameter

if TYPE_CHECKING:
    from .agent import (
        AgentDefinitionRegistry,
        ModelExecutionProfile,
        ModelExecutionProfileRef,
        ModelExecutionProfileRegistry,
    )


# =========================================================================
# Requirement
# =========================================================================
@dataclass(frozen=True)
class ModelSelectionRequirement:
    """Hard-filter requirements (STEP-014 §30/§31)."""

    required_capabilities: frozenset[ModelCapability]
    required_parameters: frozenset[ModelParameter]
    allowed_providers: frozenset[str]
    forbidden_profiles: frozenset[ModelExecutionProfileRef]

    def __post_init__(self) -> None:
        if not isinstance(self.required_capabilities, frozenset):
            raise ValueError("required_capabilities must be a frozenset")
        if not isinstance(self.required_parameters, frozenset):
            raise ValueError("required_parameters must be a frozenset")
        if not isinstance(self.allowed_providers, frozenset):
            raise ValueError("allowed_providers must be a frozenset")
        if not isinstance(self.forbidden_profiles, frozenset):
            raise ValueError("forbidden_profiles must be a frozenset")


# =========================================================================
# Signals
# =========================================================================
def _check_signal_value(name: str, value: float) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidModelSelectionSignalsError(
            f"signal {name} must be int|float, got {type(value).__name__}"
        )
    v = float(value)
    if math.isnan(v):
        raise InvalidModelSelectionSignalsError(f"signal {name} is NaN")
    if math.isinf(v):
        raise InvalidModelSelectionSignalsError(f"signal {name} is inf")
    if v < 0.0 or v > 1.0:
        raise InvalidModelSelectionSignalsError(f"signal {name} must be in [0.0, 1.0], got {value}")


@dataclass(frozen=True)
class ModelSelectionSignals:
    """Per-profile explicit selection signals (STEP-014 §34/§35).

    All four dimension signals are normalized to [0.0, 1.0]; NaN/inf/<0/>1 are
    rejected. If ``available`` is False, ``reason_codes`` MUST be non-empty.
    The runtime never derives these itself — they are caller inputs.
    """

    quality: float
    cost_efficiency: float
    latency: float
    reliability: float
    available: bool
    reason_codes: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        for name, val in (
            ("quality", self.quality),
            ("cost_efficiency", self.cost_efficiency),
            ("latency", self.latency),
            ("reliability", self.reliability),
        ):
            _check_signal_value(name, val)
        if not isinstance(self.available, bool):
            raise InvalidModelSelectionSignalsError("available must be bool")
        if not isinstance(self.reason_codes, tuple):
            raise InvalidModelSelectionSignalsError("reason_codes must be a tuple")
        if not self.available and not self.reason_codes:
            raise InvalidModelSelectionSignalsError(
                "available=False requires at least one reason_code"
            )


# =========================================================================
# Weights
# =========================================================================
@dataclass(frozen=True)
class ModelSelectionWeights:
    """Scoring weights (STEP-014 §37). All >= 0; at least one > 0."""

    quality_weight: float
    cost_efficiency_weight: float
    latency_weight: float
    reliability_weight: float

    def __post_init__(self) -> None:
        for name, val in (
            ("quality_weight", self.quality_weight),
            ("cost_efficiency_weight", self.cost_efficiency_weight),
            ("latency_weight", self.latency_weight),
            ("reliability_weight", self.reliability_weight),
        ):
            if isinstance(val, bool) or not isinstance(val, (int, float)):
                raise InvalidModelSelectionPolicyError(
                    f"{name} must be int|float, got {type(val).__name__}"
                )
            v = float(val)
            if math.isnan(v) or math.isinf(v):
                raise InvalidModelSelectionPolicyError(f"{name} is NaN/inf")
            if v < 0.0:
                raise InvalidModelSelectionPolicyError(f"{name} must be >= 0")
        total = (
            float(self.quality_weight)
            + float(self.cost_efficiency_weight)
            + float(self.latency_weight)
            + float(self.reliability_weight)
        )
        if total <= 0.0:
            raise InvalidModelSelectionPolicyError("at least one weight must be > 0")


# =========================================================================
# Policy
# =========================================================================
@dataclass(frozen=True)
class ModelSelectionPolicy:
    """A versioned, deterministic scoring policy (STEP-014 §38/§39).

    Stores ONLY weights + selector_version. It never holds current prices,
    benchmarks, or a profile list.
    """

    policy_id: ModelSelectionPolicyId
    version: str
    weights: ModelSelectionWeights
    selector_version: str = "weighted-sum-v1"

    def __post_init__(self) -> None:
        if not str(self.policy_id):
            raise ValueError("policy_id must be non-empty")
        if not self.version:
            raise ValueError("version must be non-empty")
        if not self.selector_version:
            raise ValueError("selector_version must be non-empty")


# =========================================================================
# Score components
# =========================================================================
@dataclass(frozen=True)
class ModelSelectionScoreComponents:
    """Auditable score breakdown (STEP-014 §40). Fully reconstructable from
    signals + weights."""

    quality_component: float
    cost_efficiency_component: float
    latency_component: float
    reliability_component: float
    total_score: float


# =========================================================================
# Exclusion
# =========================================================================
class ModelSelectionExclusionReason(StrEnum):
    """Stable reason codes for excluded candidates (STEP-014 §42)."""

    MISSING_CAPABILITY = "MISSING_CAPABILITY"
    MISSING_PARAMETER_SUPPORT = "MISSING_PARAMETER_SUPPORT"
    PROVIDER_NOT_ALLOWED = "PROVIDER_NOT_ALLOWED"
    PROFILE_FORBIDDEN = "PROFILE_FORBIDDEN"
    UNAVAILABLE = "UNAVAILABLE"


@dataclass(frozen=True)
class ExcludedModelCandidate:
    """A candidate filtered out before ranking (STEP-014 §41)."""

    profile_ref: ModelExecutionProfileRef
    reason: ModelSelectionExclusionReason
    detail: str


@dataclass(frozen=True)
class RankedModelCandidate:
    """A scored, ranked candidate (STEP-014 §43). rank starts at 1."""

    profile_ref: ModelExecutionProfileRef
    rank: int
    score: float
    score_components: ModelSelectionScoreComponents
    reason_codes: tuple[str, ...] = ()


class ModelSelectionStatus(StrEnum):
    """Recommendation outcome (STEP-014 §45)."""

    RECOMMENDED = "RECOMMENDED"
    NO_MATCH = "NO_MATCH"


# =========================================================================
# Recommendation
# =========================================================================
@dataclass(frozen=True)
class ModelSelectionRecommendation:
    """The immutable output of one selection evaluation (STEP-014 §46)."""

    evaluation_id: ModelSelectionEvaluationId
    agent_id: AgentId
    agent_version: str
    policy_id: ModelSelectionPolicyId
    policy_version: str
    requirement: ModelSelectionRequirement
    selected_profile_ref: ModelExecutionProfileRef | None
    ranked_candidates: tuple[RankedModelCandidate, ...]
    excluded_candidates: tuple[ExcludedModelCandidate, ...]
    status: ModelSelectionStatus
    created_at: datetime
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not str(self.agent_id):
            raise ValueError("agent_id must be non-empty")
        if not self.agent_version:
            raise ValueError("agent_version must be non-empty")
        if not str(self.policy_id):
            raise ValueError("policy_id must be non-empty")
        if not self.policy_version:
            raise ValueError("policy_version must be non-empty")
        if self.status is ModelSelectionStatus.RECOMMENDED:
            if self.selected_profile_ref is None:
                raise ValueError("RECOMMENDED requires a selected_profile_ref")
            if not self.ranked_candidates:
                raise ValueError("RECOMMENDED requires ranked_candidates")
            if self.ranked_candidates[0].profile_ref != self.selected_profile_ref:
                raise ValueError("selected must equal rank-1 candidate")
        else:
            if self.selected_profile_ref is not None:
                raise ValueError("NO_MATCH requires selected_profile_ref=None")
        if self.created_at.tzinfo is None or self.created_at.utcoffset() is None:
            raise ValueError("created_at must be timezone-aware")


# =========================================================================
# Recommendation store (Port)
# =========================================================================
@runtime_checkable
class ModelSelectionRecommendationStore(Protocol):
    """Append-only store of recommendations (STEP-014 §50). Audit artifact."""

    def save(self, recommendation: ModelSelectionRecommendation) -> None:
        """Create. MUST reject a duplicate evaluation_id."""
        ...

    def get(
        self,
        evaluation_id: ModelSelectionEvaluationId,
    ) -> ModelSelectionRecommendation: ...

    def list_for_agent(
        self,
        agent_id: AgentId,
    ) -> list[ModelSelectionRecommendation]: ...


# =========================================================================
# Engine
# =========================================================================
class ModelSelectionEngine:
    """Deterministic selection evaluator (STEP-014 §52).

    Steps:
        1. exact-resolve AgentDefinition
        2. enumerate Agent allowed Profile refs
        3. exact-resolve each profile (else ModelSelectionProfileResolutionError)
        4. validate signal set completeness/exactness
        5. hard filter (capability/parameter/provider/forbidden/available)
        6. deterministic score (weighted sum)
        7. deterministic sort (score desc, profile_id asc, version asc)
        8. build Recommendation (RECOMMENDED | NO_MATCH)
        9. save Recommendation

    It never binds, creates a Run/Attempt, calls a provider, or selects a Config.
    """

    def __init__(
        self,
        agent_registry: AgentDefinitionRegistry,
        profile_registry: ModelExecutionProfileRegistry,
        recommendation_store: ModelSelectionRecommendationStore,
        *,
        evaluation_id_factory: Callable[[], str] | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._agents = agent_registry
        self._profiles = profile_registry
        self._recs = recommendation_store
        import uuid

        self._evaluation_id_factory = evaluation_id_factory or (lambda: uuid.uuid4().hex)
        from datetime import UTC
        from datetime import datetime as _dt

        self._now = now or (lambda: _dt.now(UTC))

    def evaluate(
        self,
        *,
        agent_id: AgentId,
        agent_version: str,
        policy: ModelSelectionPolicy,
        requirement: ModelSelectionRequirement,
        signals: Mapping[ModelExecutionProfileRef, ModelSelectionSignals],
        actor_meta: Mapping[str, object] | None = None,
    ) -> ModelSelectionRecommendation:
        # 1. exact-resolve AgentDefinition
        definition = self._agents.get(agent_id, agent_version)

        # 2. enumerate allowed refs (candidate universe)
        allowed_refs = list(definition.allowed_execution_profiles)

        # 3. exact-resolve each profile
        profiles: dict[ModelExecutionProfileRef, ModelExecutionProfile] = {}
        for ref in allowed_refs:
            try:
                prof = self._profiles.get(ref.profile_id, ref.version)
            except (KeyError, ModelExecutionProfileNotFoundError):
                raise ModelSelectionProfileResolutionError(
                    f"allowed profile {ref.profile_id}/{ref.version} not registered"
                ) from None
            profiles[ref] = prof

        # 4. validate signal set: exactly one signal per allowed ref, no extra
        sig_keys = set(signals.keys())
        allowed_set = set(allowed_refs)
        if sig_keys != allowed_set:
            missing = allowed_set - sig_keys
            extra = sig_keys - allowed_set
            if missing:
                raise ModelSelectionSignalSetError(
                    f"missing signals for: "
                    f"{sorted((str(r.profile_id), r.version) for r in missing)}"
                )
            if extra:
                raise ModelSelectionSignalSetError(
                    f"signals for non-allowed profiles: "
                    f"{sorted((str(r.profile_id), r.version) for r in extra)}"
                )
        # duplicates impossible (dict keys) — but also guard against a
        # non-hashable key shape is unnecessary; set membership is exact.

        # 5. hard filter
        excluded: list[ExcludedModelCandidate] = []
        surviving: list[tuple[ModelExecutionProfileRef, ModelSelectionSignals]] = []
        for ref in allowed_refs:
            prof = profiles[ref]
            sig = signals[ref]
            reason = self._hard_filter(ref, prof, sig, requirement)
            if reason is not None:
                excluded.append(reason)
            else:
                surviving.append((ref, sig))

        # 6-7. score + deterministic sort
        ranked = self._rank(surviving, policy.weights)

        # 8. build recommendation
        if ranked:
            status = ModelSelectionStatus.RECOMMENDED
            selected = ranked[0].profile_ref
        else:
            status = ModelSelectionStatus.NO_MATCH
            selected = None

        ts = self._now()
        rec = ModelSelectionRecommendation(
            evaluation_id=ModelSelectionEvaluationId(self._evaluation_id_factory()),
            agent_id=definition.agent_id,
            agent_version=definition.version,
            policy_id=policy.policy_id,
            policy_version=policy.version,
            requirement=requirement,
            selected_profile_ref=selected,
            ranked_candidates=tuple(ranked),
            excluded_candidates=tuple(excluded),
            status=status,
            created_at=ts,
            metadata=actor_meta if actor_meta is not None else {},
        )

        # 9. save recommendation
        self._recs.save(rec)
        return rec

    # --- hard filter -----------------------------------------------------
    def _hard_filter(
        self,
        ref: ModelExecutionProfileRef,
        profile: ModelExecutionProfile,
        signals: ModelSelectionSignals,
        requirement: ModelSelectionRequirement,
    ) -> ExcludedModelCandidate | None:
        if not (requirement.required_capabilities <= profile.capabilities):
            missing = requirement.required_capabilities - profile.capabilities
            return ExcludedModelCandidate(
                profile_ref=ref,
                reason=ModelSelectionExclusionReason.MISSING_CAPABILITY,
                detail="missing: " + ",".join(sorted(c.value for c in missing)),
            )
        if not (requirement.required_parameters <= profile.supported_parameters):
            missing = requirement.required_parameters - profile.supported_parameters
            return ExcludedModelCandidate(
                profile_ref=ref,
                reason=ModelSelectionExclusionReason.MISSING_PARAMETER_SUPPORT,
                detail="missing: " + ",".join(sorted(p.value for p in missing)),
            )
        if (
            requirement.allowed_providers
            and profile.provider.name not in requirement.allowed_providers
        ):
            return ExcludedModelCandidate(
                profile_ref=ref,
                reason=ModelSelectionExclusionReason.PROVIDER_NOT_ALLOWED,
                detail=f"provider {profile.provider.name} not in allowed set",
            )
        if ref in requirement.forbidden_profiles:
            return ExcludedModelCandidate(
                profile_ref=ref,
                reason=ModelSelectionExclusionReason.PROFILE_FORBIDDEN,
                detail="profile is forbidden",
            )
        if not signals.available:
            return ExcludedModelCandidate(
                profile_ref=ref,
                reason=ModelSelectionExclusionReason.UNAVAILABLE,
                detail=";".join(signals.reason_codes),
            )
        return None

    # --- scoring + ranking ----------------------------------------------
    def _rank(
        self,
        surviving: list[tuple[ModelExecutionProfileRef, ModelSelectionSignals]],
        weights: ModelSelectionWeights,
    ) -> list[RankedModelCandidate]:
        scored: list[
            tuple[
                float,
                ModelExecutionProfileRef,
                ModelSelectionSignals,
                ModelSelectionScoreComponents,
            ]
        ] = []
        for ref, sig in surviving:
            qc = weights.quality_weight * sig.quality
            cc = weights.cost_efficiency_weight * sig.cost_efficiency
            lc = weights.latency_weight * sig.latency
            rc = weights.reliability_weight * sig.reliability
            total = qc + cc + lc + rc
            comps = ModelSelectionScoreComponents(
                quality_component=qc,
                cost_efficiency_component=cc,
                latency_component=lc,
                reliability_component=rc,
                total_score=total,
            )
            scored.append((total, ref, sig, comps))

        # Deterministic sort: score desc, profile_id asc, version asc.
        scored.sort(
            key=lambda item: (
                -item[0],
                str(item[1].profile_id),
                item[1].version,
            )
        )

        result: list[RankedModelCandidate] = []
        for idx, (total, ref, sig, comps) in enumerate(scored, start=1):
            result.append(
                RankedModelCandidate(
                    profile_ref=ref,
                    rank=idx,
                    score=total,
                    score_components=comps,
                    reason_codes=sig.reason_codes,
                )
            )
        return result


# Late, TYPE_CHECKING-only imports are kept in the header so this module
# stays decoupled at runtime from agent.py (which imports model_execution;
# model_selection imports model_execution already). AgentDefinitionRegistry /
# ModelExecutionProfile / ModelExecutionProfileRef live in agent.py.


__all__ = [
    "ExcludedModelCandidate",
    "ModelSelectionEngine",
    "ModelSelectionExclusionReason",
    "ModelSelectionPolicy",
    "ModelSelectionRecommendation",
    "ModelSelectionRecommendationStore",
    "ModelSelectionRequirement",
    "ModelSelectionScoreComponents",
    "ModelSelectionSignals",
    "ModelSelectionStatus",
    "ModelSelectionWeights",
    "RankedModelCandidate",
]
