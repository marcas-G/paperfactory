"""ResearchPolicyEngine — deterministic candidate ranking (STEP-005).

Strict responsibilities:
    * validate inputs (duplicate candidates, signal values via contracts)
    * hard-filter candidates (registered / legal / scope / branch / blocked)
    * score surviving candidates with the frozen formula
    * stable-sort with a fixed tie-break
    * build + persist a PolicyRecommendation
    * emit one POLICY_EVALUATED audit event

It MUST NOT generate actions, call an LLM, create tasks, create approvals, or
mutate Research State. Illegal/unregistered candidates are EXCLUDED (audited),
not raised — only invalid signals/config/context raise.
"""

from __future__ import annotations

from ..domain.enums import ActorType
from ..domain.events import ControlEvent, ControlEventType
from ..domain.ids import EventId, PolicyEvaluationId, ProjectId
from ..domain.models import ResearchStateSnapshot
from .branches import BranchStatus
from .clock import IdFactory, TimeProvider
from .errors import DuplicatePolicyCandidateError
from .policy import (
    REASON_ACTION_BLOCKED,
    REASON_BRANCH_MISMATCH,
    REASON_BRANCH_NOT_ACTIVE,
    REASON_ILLEGAL_ACTION,
    REASON_PROJECT_MISMATCH,
    REASON_UNREGISTERED_ACTION,
    ExcludedPolicyCandidate,
    PolicyCandidate,
    PolicyRecommendation,
    PolicyStatus,
    RankedAction,
    ResearchPolicyConfig,
    score_candidate,
)
from .registry import ActionRegistry
from .store import ControlEventSink, PolicyRecommendationStore


class ResearchPolicyEngine:
    """Deterministic, auditable action prioritization."""

    def __init__(
        self,
        registry: ActionRegistry,
        recommendation_store: PolicyRecommendationStore,
        event_sink: ControlEventSink,
        *,
        id_factory: IdFactory,
        now: TimeProvider,
    ) -> None:
        self._registry = registry
        self._store = recommendation_store
        self._sink = event_sink
        self._id_factory = id_factory
        self._now = now

    def evaluate(
        self,
        *,
        project_id: ProjectId,
        branch_id,  # BranchId
        branch_status: BranchStatus,
        state: ResearchStateSnapshot,
        candidates: tuple[PolicyCandidate, ...] | list[PolicyCandidate],
        policy_config: ResearchPolicyConfig,
        actor_type: ActorType = ActorType.SYSTEM,
    ) -> PolicyRecommendation:
        """Rank candidates and produce a PolicyRecommendation."""
        # --- duplicate candidate guard (whole evaluation fails) ----------
        seen: set[object] = set()
        for cand in candidates:
            if cand.action.action_id in seen:
                raise DuplicatePolicyCandidateError(
                    f"duplicate candidate action_id: {cand.action.action_id}"
                )
            seen.add(cand.action.action_id)

        excluded: list[ExcludedPolicyCandidate] = []
        scored: list[tuple[RankedAction, float]] = []

        # --- branch not ACTIVE: every candidate excluded, NO_ACTION ------
        if branch_status is not BranchStatus.ACTIVE:
            for cand in candidates:
                excluded.append(
                    ExcludedPolicyCandidate(
                        action_id=cand.action.action_id,
                        reason_codes=(REASON_BRANCH_NOT_ACTIVE,),
                    )
                )
            return self._finalize(
                project_id=project_id,
                branch_id=branch_id,
                state_revision=state.revision,
                policy_config=policy_config,
                ranked=[],
                excluded=excluded,
                actor_type=actor_type,
            )

        # --- hard filter + score -----------------------------------------
        for cand in candidates:
            reason = self._hard_filter(cand, project_id, branch_id, state)
            if reason is not None:
                excluded.append(
                    ExcludedPolicyCandidate(action_id=cand.action.action_id, reason_codes=(reason,))
                )
                continue
            components = score_candidate(cand.signals, policy_config.weights)
            ranked = RankedAction(
                action_id=cand.action.action_id,
                action_type=cand.action.action_type,
                target_object_id=cand.action.target_object_id,
                rank=0,  # assigned after sorting
                score=components.total_score,
                score_components=components,
            )
            scored.append((ranked, components.total_score))

        # --- stable sort with fixed tie-break (STEP-005 §19) -------------
        ranked_actions = self._stable_rank(scored)

        return self._finalize(
            project_id=project_id,
            branch_id=branch_id,
            state_revision=state.revision,
            policy_config=policy_config,
            ranked=ranked_actions,
            excluded=excluded,
            actor_type=actor_type,
        )

    # ===================================================================
    # Internals
    # ===================================================================
    def _hard_filter(
        self,
        cand: PolicyCandidate,
        project_id: ProjectId,
        branch_id,  # BranchId
        state: ResearchStateSnapshot,
    ) -> str | None:
        action = cand.action
        # HC-03 project scope
        if action.project_id != project_id:
            return REASON_PROJECT_MISMATCH
        # HC-04 branch scope
        if action.branch_id != branch_id:
            return REASON_BRANCH_MISMATCH
        # HC-01 registered
        if not self._registry.has(action.action_type):
            return REASON_UNREGISTERED_ACTION
        definition = self._registry.get(action.action_type)
        # HC-06 blocked signal
        if cand.signals.blocked:
            return REASON_ACTION_BLOCKED
        # HC-02 legal against current state (lightweight; does not raise)
        if action.target_object_id not in state.object_states:
            return REASON_ILLEGAL_ACTION
        current = state.object_states[action.target_object_id]
        if not definition.allows_source_state(current):
            return REASON_ILLEGAL_ACTION
        return None

    @staticmethod
    def _stable_rank(
        scored: list[tuple[RankedAction, float]],
    ) -> list[RankedAction]:
        """Sort by: score desc, action_type asc, target_object_id asc,
        action_id asc. Returns a NEW list with rank assigned from 1."""
        ordered = sorted(
            scored,
            key=lambda item: (
                -item[1],  # score descending
                item[0].action_type,  # ascending
                str(item[0].target_object_id),  # ascending
                str(item[0].action_id),  # ascending
            ),
        )
        return [
            RankedAction(
                action_id=r.action_id,
                action_type=r.action_type,
                target_object_id=r.target_object_id,
                rank=index + 1,
                score=r.score,
                score_components=r.score_components,
                reason_codes=r.reason_codes,
            )
            for index, (r, _score) in enumerate(ordered)
        ]

    def _finalize(
        self,
        *,
        project_id: ProjectId,
        branch_id,  # BranchId
        state_revision: int,
        policy_config: ResearchPolicyConfig,
        ranked: list[RankedAction],
        excluded: list[ExcludedPolicyCandidate],
        actor_type: ActorType,
    ) -> PolicyRecommendation:
        if ranked:
            status = PolicyStatus.RECOMMENDED
            selected = ranked[0].action_id
        else:
            status = PolicyStatus.NO_ACTION
            selected = None

        recommendation = PolicyRecommendation(
            evaluation_id=PolicyEvaluationId(self._id_factory()),
            project_id=project_id,
            branch_id=branch_id,
            state_revision=state_revision,
            policy_id=policy_config.policy_id,
            policy_version=policy_config.version,
            status=status,
            selected_action_id=selected,
            ranked_actions=tuple(ranked),
            excluded_candidates=tuple(excluded),
            created_at=self._now(),
        )
        self._store.save(recommendation)
        self._emit(recommendation, actor_type)
        return recommendation

    def _emit(self, recommendation: PolicyRecommendation, actor_type: ActorType) -> None:
        self._sink.append(
            ControlEvent(
                event_id=EventId(self._id_factory()),
                project_id=recommendation.project_id,
                branch_id=recommendation.branch_id,
                event_type=ControlEventType.POLICY_EVALUATED,
                aggregate_id=str(recommendation.evaluation_id),
                actor_type=actor_type,
                created_at=self._now(),
                payload={
                    "evaluation_id": str(recommendation.evaluation_id),
                    "policy_id": recommendation.policy_id,
                    "policy_version": recommendation.policy_version,
                    "state_revision": recommendation.state_revision,
                    "candidate_count": len(recommendation.ranked_actions)
                    + len(recommendation.excluded_candidates),
                    "ranked_count": len(recommendation.ranked_actions),
                    "excluded_count": len(recommendation.excluded_candidates),
                    "selected_action_id": (
                        str(recommendation.selected_action_id)
                        if recommendation.selected_action_id is not None
                        else None
                    ),
                },
            )
        )


__all__ = ["ResearchPolicyEngine"]
