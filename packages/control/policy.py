"""Research Policy contracts — deterministic action prioritization (STEP-005).

The Policy Engine CONSUMES priority signals; it does NOT infer them
(information_gain / scientific_value / blocker_resolution are inputs supplied
by upstream layers — M4 Domain, M2 Cognition, schedulers). It RANKS candidate
actions; it does NOT execute them and does NOT generate new actions.

All six numeric signals are normalized to ``0.0 <= value <= 1.0`` and validated
strictly (no silent clamp). Scoring is a frozen linear formula (STEP-005 §11):
no hidden bonuses, no action-type hard-coding.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from ..domain.ids import ActionId, BranchId, ObjectId, PolicyEvaluationId, ProjectId
from .actions import ResearchAction, ResearchActionDefinition
from .errors import InvalidPolicyConfigError, InvalidPolicySignalError

# Reason codes used for excluded candidates (STEP-005 §18).
REASON_ACTION_BLOCKED = "ACTION_BLOCKED"
REASON_BRANCH_NOT_ACTIVE = "BRANCH_NOT_ACTIVE"
REASON_ILLEGAL_ACTION = "ILLEGAL_ACTION"
REASON_UNREGISTERED_ACTION = "UNREGISTERED_ACTION"
REASON_PROJECT_MISMATCH = "PROJECT_MISMATCH"
REASON_BRANCH_MISMATCH = "BRANCH_MISMATCH"


def _validate_signal(name: str, value: float) -> float:
    """Reject NaN/inf and values outside [0, 1]. No silent clamp."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidPolicySignalError(f"signal {name!r} must be a real number, got {value!r}")
    f = float(value)
    if math.isnan(f) or math.isinf(f):
        raise InvalidPolicySignalError(f"signal {name!r} is NaN/inf: {f}")
    if f < 0.0 or f > 1.0:
        raise InvalidPolicySignalError(f"signal {name!r} out of [0,1]: {f}")
    return f


@dataclass(frozen=True)
class ActionPrioritySignals:
    """Explicit, upstream-provided priority signals for one action.

    All six numeric fields are normalized to [0, 1]. ``blocked`` means the
    action cannot be run right now (it is excluded from ranking, not scored).
    """

    information_gain: float
    blocker_resolution: float
    scientific_value: float
    urgency: float
    cost: float
    risk: float

    blocked: bool = False
    block_reason_codes: tuple[str, ...] = ()
    source_refs: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        for name in (
            "information_gain",
            "blocker_resolution",
            "scientific_value",
            "urgency",
            "cost",
            "risk",
        ):
            object.__setattr__(self, name, _validate_signal(name, getattr(self, name)))


@dataclass(frozen=True)
class PolicyWeights:
    """Non-negative weights for the scoring formula. At least one must be > 0."""

    information_gain_weight: float
    blocker_resolution_weight: float
    scientific_value_weight: float
    urgency_weight: float
    cost_weight: float
    risk_weight: float

    def __post_init__(self) -> None:
        names = (
            "information_gain_weight",
            "blocker_resolution_weight",
            "scientific_value_weight",
            "urgency_weight",
            "cost_weight",
            "risk_weight",
        )
        values = []
        for name in names:
            v = float(getattr(self, name))
            if math.isnan(v) or math.isinf(v) or v < 0.0:
                raise InvalidPolicyConfigError(f"weight {name!r} invalid: {v}")
            values.append((name, v))
            object.__setattr__(self, name, v)
        if all(v <= 0.0 for _, v in values):
            raise InvalidPolicyConfigError("at least one policy weight must be > 0")


@dataclass(frozen=True)
class ResearchPolicyConfig:
    """A versioned policy: identified + weighted. Every recommendation records
    which policy produced it."""

    policy_id: str
    version: int
    weights: PolicyWeights

    def __post_init__(self) -> None:
        if not self.policy_id:
            raise InvalidPolicyConfigError("policy_id must be non-empty")
        if self.version < 1:
            raise InvalidPolicyConfigError("policy version must be >= 1")


@dataclass(frozen=True)
class PolicyCandidate:
    """A candidate action plus its priority signals.

    ``definition`` is an optional reference to the registered ActionDefinition
    (not a copy — the ActionRegistry remains the single source of truth)."""

    action: ResearchAction
    signals: ActionPrioritySignals
    definition: ResearchActionDefinition | None = None


@dataclass(frozen=True)
class PolicyScoreComponents:
    """Per-component score breakdown. ``total_score`` is recomputable from the
    other six fields + weights, so it stays auditable."""

    information_gain_component: float
    blocker_resolution_component: float
    scientific_value_component: float
    urgency_component: float
    cost_component: float
    risk_component: float
    total_score: float


def score_candidate(
    signals: ActionPrioritySignals, weights: PolicyWeights
) -> PolicyScoreComponents:
    """Frozen scoring formula (STEP-005 §11):

        score = w_ig*ig + w_br*br + w_sv*sv + w_ur*ur - w_cost*cost - w_risk*risk

    No hidden bonuses; no action-type hard-coding.
    """
    ig = weights.information_gain_weight * signals.information_gain
    br = weights.blocker_resolution_weight * signals.blocker_resolution
    sv = weights.scientific_value_weight * signals.scientific_value
    ur = weights.urgency_weight * signals.urgency
    cost = weights.cost_weight * signals.cost
    risk = weights.risk_weight * signals.risk
    total = ig + br + sv + ur - cost - risk
    return PolicyScoreComponents(
        information_gain_component=ig,
        blocker_resolution_component=br,
        scientific_value_component=sv,
        urgency_component=ur,
        cost_component=cost,
        risk_component=risk,
        total_score=total,
    )


@dataclass(frozen=True)
class RankedAction:
    """An action that survived filtering, with its rank, score and breakdown."""

    action_id: ActionId
    action_type: str
    target_object_id: ObjectId

    rank: int
    score: float
    score_components: PolicyScoreComponents
    reason_codes: tuple[str, ...] = ()


@dataclass(frozen=True)
class ExcludedPolicyCandidate:
    """A candidate removed by hard filtering, with the reason(s)."""

    action_id: ActionId
    reason_codes: tuple[str, ...]


class PolicyStatus(StrEnum):
    """Outcome of a policy evaluation (STEP-005 §5). Only two states."""

    RECOMMENDED = "RECOMMENDED"
    NO_ACTION = "NO_ACTION"


@dataclass(frozen=True)
class PolicyRecommendation:
    """The full, auditable decision record of one evaluation."""

    evaluation_id: PolicyEvaluationId
    project_id: ProjectId
    branch_id: BranchId
    state_revision: int

    policy_id: str
    policy_version: int

    status: PolicyStatus
    selected_action_id: ActionId | None

    ranked_actions: tuple[RankedAction, ...]
    excluded_candidates: tuple[ExcludedPolicyCandidate, ...]
    created_at: datetime
    metadata: Mapping[str, object] = field(default_factory=dict)


__all__ = [
    "REASON_ACTION_BLOCKED",
    "REASON_BRANCH_MISMATCH",
    "REASON_BRANCH_NOT_ACTIVE",
    "REASON_ILLEGAL_ACTION",
    "REASON_PROJECT_MISMATCH",
    "REASON_UNREGISTERED_ACTION",
    "ActionPrioritySignals",
    "ExcludedPolicyCandidate",
    "PolicyCandidate",
    "PolicyRecommendation",
    "PolicyScoreComponents",
    "PolicyStatus",
    "PolicyWeights",
    "RankedAction",
    "ResearchPolicyConfig",
    "score_candidate",
]
