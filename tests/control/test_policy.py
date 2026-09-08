"""POL-001..043 + M1-001 — deterministic Research Policy Engine.

Neutral fixtures: project=PROJECT, main branch=BRANCH, object OBJ starts
DRAFT. Signals are constructed explicitly (Policy consumes, never infers).
"""

from __future__ import annotations

import math
from dataclasses import FrozenInstanceError

import pytest

from packages.control import (
    ActionPrioritySignals,
    PolicyCandidate,
    PolicyStatus,
    PolicyWeights,
    ResearchAction,
    ResearchPolicyConfig,
)
from packages.control.errors import (
    DuplicatePolicyCandidateError,
    InvalidPolicyConfigError,
    InvalidPolicySignalError,
)
from packages.control.policy import score_candidate
from packages.domain.enums import ActorType
from packages.domain.events import ControlEventType
from packages.domain.ids import ActionId, BranchId

from .conftest import BRANCH, OBJ, PROJECT, STATE_READY


# --- helpers -------------------------------------------------------------
def signals(
    *,
    ig=0.5,  # type: ignore[no-untyped-def]
    br=0.5,
    sv=0.5,
    ur=0.5,
    cost=0.5,
    risk=0.5,
    blocked=False,
) -> ActionPrioritySignals:
    return ActionPrioritySignals(
        information_gain=ig,
        blocker_resolution=br,
        scientific_value=sv,
        urgency=ur,
        cost=cost,
        risk=risk,
        blocked=blocked,
    )


def weights(  # type: ignore[no-untyped-def]
    *,
    ig=1.0,
    br=1.0,
    sv=1.0,
    ur=1.0,
    cost=1.0,
    risk=1.0,
) -> PolicyWeights:
    return PolicyWeights(
        information_gain_weight=ig,
        blocker_resolution_weight=br,
        scientific_value_weight=sv,
        urgency_weight=ur,
        cost_weight=cost,
        risk_weight=risk,
    )


def config() -> ResearchPolicyConfig:
    return ResearchPolicyConfig(policy_id="test-policy", version=1, weights=weights())


def action(action_id: str, action_type: str = "TEST_ADVANCE") -> ResearchAction:
    return ResearchAction(
        action_id=ActionId(action_id),
        action_type=action_type,
        project_id=PROJECT,
        branch_id=BRANCH,
        target_object_id=OBJ,
        actor_type=ActorType.SYSTEM,
    )


def candidate(
    aid: str,
    sig: ActionPrioritySignals,
    action_type: str = "TEST_ADVANCE",
) -> PolicyCandidate:
    return PolicyCandidate(action=action(aid, action_type), signals=sig)


# =========================================================================
# POL-001..006 — signals & weights validation
# =========================================================================
def test_pol_001_legal_signal_created() -> None:
    s = signals(ig=0.0, cost=1.0)
    assert s.information_gain == 0.0
    assert s.cost == 1.0


def test_pol_002_negative_signal_rejected() -> None:
    with pytest.raises(InvalidPolicySignalError):
        signals(ig=-0.1)


def test_pol_003_above_one_signal_rejected() -> None:
    with pytest.raises(InvalidPolicySignalError):
        signals(ig=1.2)


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_pol_004_nan_inf_rejected(bad: float) -> None:
    with pytest.raises(InvalidPolicySignalError):
        signals(ig=bad)


def test_pol_005_negative_weight_rejected() -> None:
    with pytest.raises(InvalidPolicyConfigError):
        PolicyWeights(
            information_gain_weight=-1.0,
            blocker_resolution_weight=0.0,
            scientific_value_weight=0.0,
            urgency_weight=0.0,
            cost_weight=0.0,
            risk_weight=0.0,
        )


def test_pol_006_all_zero_weights_rejected() -> None:
    with pytest.raises(InvalidPolicyConfigError):
        weights(ig=0.0, br=0.0, sv=0.0, ur=0.0, cost=0.0, risk=0.0)


# =========================================================================
# POL-007..013 — ranking by individual signals
# =========================================================================
def test_pol_007_information_gain_ranks_higher(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[
            candidate("a-low", signals(ig=0.2)),
            candidate("a-high", signals(ig=0.9)),
        ],
        policy_config=config(),
    )
    assert rec.selected_action_id == ActionId("a-high")


def test_pol_008_blocker_resolution_ranks_higher(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[
            candidate("a-low", signals(br=0.1)),
            candidate("a-high", signals(br=0.8)),
        ],
        policy_config=config(),
    )
    assert rec.selected_action_id == ActionId("a-high")


def test_pol_009_scientific_value_ranks_higher(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[
            candidate("a-low", signals(sv=0.2)),
            candidate("a-high", signals(sv=0.7)),
        ],
        policy_config=config(),
    )
    assert rec.selected_action_id == ActionId("a-high")


def test_pol_010_urgency_ranks_higher(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[
            candidate("a-low", signals(ur=0.1)),
            candidate("a-high", signals(ur=0.9)),
        ],
        policy_config=config(),
    )
    assert rec.selected_action_id == ActionId("a-high")


def test_pol_011_higher_cost_ranks_lower(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[
            candidate("a-costly", signals(cost=0.9)),
            candidate("a-cheap", signals(cost=0.1)),
        ],
        policy_config=config(),
    )
    assert rec.selected_action_id == ActionId("a-cheap")


def test_pol_012_higher_risk_ranks_lower(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[
            candidate("a-risky", signals(risk=0.9)),
            candidate("a-safe", signals(risk=0.1)),
        ],
        policy_config=config(),
    )
    assert rec.selected_action_id == ActionId("a-safe")


def test_pol_013_score_components_sum_to_total() -> None:
    s = signals(ig=0.3, br=0.4, sv=0.5, ur=0.6, cost=0.2, risk=0.1)
    w = weights()
    comp = score_candidate(s, w)
    expected = 1.0 * 0.3 + 1.0 * 0.4 + 1.0 * 0.5 + 1.0 * 0.6 - 1.0 * 0.2 - 1.0 * 0.1
    assert math.isclose(comp.total_score, expected)
    # recomputable
    recomputed = (
        comp.information_gain_component
        + comp.blocker_resolution_component
        + comp.scientific_value_component
        + comp.urgency_component
        - comp.cost_component
        - comp.risk_component
    )
    assert math.isclose(comp.total_score, recomputed)


# =========================================================================
# POL-014..020 — hard filtering
# =========================================================================
def test_pol_014_blocked_candidate_excluded(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[
            candidate("a-blocked", signals(blocked=True)),
            candidate("a-ok", signals()),
        ],
        policy_config=config(),
    )
    excluded_ids = [e.action_id for e in rec.excluded_candidates]
    assert ActionId("a-blocked") in excluded_ids
    assert rec.selected_action_id == ActionId("a-ok")


def test_pol_015_unregistered_action_excluded(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[candidate("a-x", signals(), action_type="NOT_REGISTERED")],
        policy_config=config(),
    )
    assert rec.status is PolicyStatus.NO_ACTION
    assert rec.excluded_candidates[0].reason_codes == ("UNREGISTERED_ACTION",)


def test_pol_016_illegal_state_action_excluded(controller, registry) -> None:  # type: ignore[no-untyped-def]
    # TEST_BLOCKED_ADVANCE requires READY; object is DRAFT -> illegal
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[candidate("a-x", signals(), action_type="TEST_BLOCKED_ADVANCE")],
        policy_config=config(),
    )
    assert rec.status is PolicyStatus.NO_ACTION
    assert rec.excluded_candidates[0].reason_codes == ("ILLEGAL_ACTION",)


def test_pol_017_project_mismatch_excluded(controller) -> None:  # type: ignore[no-untyped-def]
    from packages.control import ResearchAction
    from packages.domain.ids import ProjectId

    bad = PolicyCandidate(
        action=ResearchAction(
            action_id=ActionId("a-x"),
            action_type="TEST_ADVANCE",
            project_id=ProjectId("other"),
            branch_id=BRANCH,
            target_object_id=OBJ,
            actor_type=ActorType.SYSTEM,
        ),
        signals=signals(),
    )
    rec = controller.recommend_next_action(
        branch_id=BRANCH, candidates=[bad], policy_config=config()
    )
    assert rec.excluded_candidates[0].reason_codes == ("PROJECT_MISMATCH",)


def test_pol_018_branch_mismatch_excluded(controller) -> None:  # type: ignore[no-untyped-def]
    from packages.control import ResearchAction

    bad = PolicyCandidate(
        action=ResearchAction(
            action_id=ActionId("a-x"),
            action_type="TEST_ADVANCE",
            project_id=PROJECT,
            branch_id=BranchId("other-branch"),
            target_object_id=OBJ,
            actor_type=ActorType.SYSTEM,
        ),
        signals=signals(),
    )
    rec = controller.recommend_next_action(
        branch_id=BRANCH, candidates=[bad], policy_config=config()
    )
    assert rec.excluded_candidates[0].reason_codes == ("BRANCH_MISMATCH",)


def test_pol_019_paused_branch_no_action(controller) -> None:  # type: ignore[no-untyped-def]
    controller.pause_branch(BRANCH)
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[candidate("a-x", signals())],
        policy_config=config(),
    )
    assert rec.status is PolicyStatus.NO_ACTION
    assert rec.excluded_candidates[0].reason_codes == ("BRANCH_NOT_ACTIVE",)


def test_pol_020_terminal_branch_no_action(controller) -> None:  # type: ignore[no-untyped-def]
    controller.archive_branch(BRANCH)
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[candidate("a-x", signals())],
        policy_config=config(),
    )
    assert rec.status is PolicyStatus.NO_ACTION


# =========================================================================
# POL-021..022 — approval interaction
# =========================================================================
def test_pol_021_approval_required_can_rank_first(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[
            candidate("a-plain", signals(ig=0.1), action_type="TEST_ADVANCE"),
            candidate("a-approval", signals(ig=0.9), action_type="TEST_APPROVAL_ADVANCE"),
        ],
        policy_config=config(),
    )
    assert rec.selected_action_id == ActionId("a-approval")


def test_pol_022_recommendation_creates_no_approval_no_task_no_state(
    controller,
    approval_store,
    task_store,
    store,  # type: ignore[no-untyped-def]
) -> None:
    rev_before = store.get_snapshot(PROJECT, BRANCH).revision
    controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[candidate("a-approval", signals(ig=0.9), action_type="TEST_APPROVAL_ADVANCE")],
        policy_config=config(),
    )
    assert approval_store.list_pending(PROJECT, BRANCH) == []
    assert task_store.list_for_project(PROJECT, BRANCH) == []
    assert store.get_snapshot(PROJECT, BRANCH).revision == rev_before


# =========================================================================
# POL-023..025 — determinism
# =========================================================================
def test_pol_023_repeat_evaluation_same_ranking(controller) -> None:  # type: ignore[no-untyped-def]
    cands = [
        candidate("a", signals(ig=0.4)),
        candidate("b", signals(ig=0.7)),
        candidate("c", signals(ig=0.55)),
    ]
    r1 = controller.recommend_next_action(
        branch_id=BRANCH, candidates=cands, policy_config=config()
    )
    r2 = controller.recommend_next_action(
        branch_id=BRANCH, candidates=cands, policy_config=config()
    )
    assert [r.action_id for r in r1.ranked_actions] == [r.action_id for r in r2.ranked_actions]
    assert r1.selected_action_id == r2.selected_action_id
    assert [(r.action_id, round(r.score, 9)) for r in r1.ranked_actions] == [
        (r.action_id, round(r.score, 9)) for r in r2.ranked_actions
    ]


def test_pol_024_equal_score_tiebreak(controller) -> None:  # type: ignore[no-untyped-def]
    # identical signals + same registered action_type -> equal score ->
    # tiebreak by target_object_id asc (same), then action_id asc.
    cands = [
        candidate("z-id", signals(), action_type="TEST_ADVANCE"),
        candidate("a-id", signals(), action_type="TEST_ADVANCE"),
    ]
    rec = controller.recommend_next_action(
        branch_id=BRANCH, candidates=cands, policy_config=config()
    )
    assert len(rec.ranked_actions) == 2
    assert rec.ranked_actions[0].action_id == ActionId("a-id")
    assert rec.ranked_actions[1].action_id == ActionId("z-id")


def test_pol_025_input_order_does_not_affect_ranking(controller) -> None:  # type: ignore[no-untyped-def]
    base = [
        candidate("a", signals(ig=0.4)),
        candidate("b", signals(ig=0.7)),
        candidate("c", signals(ig=0.1)),
    ]
    forward = controller.recommend_next_action(
        branch_id=BRANCH, candidates=list(base), policy_config=config()
    )
    reverse = controller.recommend_next_action(
        branch_id=BRANCH, candidates=list(reversed(base)), policy_config=config()
    )
    assert [r.action_id for r in forward.ranked_actions] == [
        r.action_id for r in reverse.ranked_actions
    ]


# =========================================================================
# POL-026..032 — recommendation semantics
# =========================================================================
def test_pol_026_recommended_status(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[candidate("a", signals(ig=0.5))],
        policy_config=config(),
    )
    assert rec.status is PolicyStatus.RECOMMENDED
    assert rec.selected_action_id == rec.ranked_actions[0].action_id
    assert rec.ranked_actions[0].rank == 1


def test_pol_027_zero_candidates_no_action(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(branch_id=BRANCH, candidates=[], policy_config=config())
    assert rec.status is PolicyStatus.NO_ACTION
    assert rec.selected_action_id is None


def test_pol_028_all_excluded_no_action(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[
            candidate("a", signals(blocked=True)),
            candidate("b", signals(), action_type="NOT_REGISTERED"),
        ],
        policy_config=config(),
    )
    assert rec.status is PolicyStatus.NO_ACTION
    assert len(rec.excluded_candidates) == 2


def test_pol_029_recommendation_records_policy_and_revision(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH, candidates=[candidate("a", signals())], policy_config=config()
    )
    assert rec.policy_id == "test-policy"
    assert rec.policy_version == 1
    assert rec.state_revision == 0


def test_pol_030_recommendation_does_not_change_state(controller, store) -> None:  # type: ignore[no-untyped-def]
    rev_before = store.get_snapshot(PROJECT, BRANCH).revision
    controller.recommend_next_action(
        branch_id=BRANCH, candidates=[candidate("a", signals())], policy_config=config()
    )
    assert store.get_snapshot(PROJECT, BRANCH).revision == rev_before


def test_pol_031_recommendation_creates_no_task(controller, task_store) -> None:  # type: ignore[no-untyped-def]
    controller.recommend_next_action(
        branch_id=BRANCH, candidates=[candidate("a", signals())], policy_config=config()
    )
    assert task_store.list_for_project(PROJECT, BRANCH) == []


def test_pol_032_recommendation_creates_no_approval(controller, approval_store) -> None:  # type: ignore[no-untyped-def]
    controller.recommend_next_action(
        branch_id=BRANCH, candidates=[candidate("a", signals())], policy_config=config()
    )
    assert approval_store.list_pending(PROJECT, BRANCH) == []


# =========================================================================
# POL-033..036 — audit
# =========================================================================
def test_pol_033_emits_policy_evaluated(controller, event_sink) -> None:  # type: ignore[no-untyped-def]
    controller.recommend_next_action(
        branch_id=BRANCH, candidates=[candidate("a", signals())], policy_config=config()
    )
    types = [e.event_type for e in event_sink.list_for_project(PROJECT)]
    assert ControlEventType.POLICY_EVALUATED in types


def test_pol_034_event_records_selected(controller, event_sink) -> None:  # type: ignore[no-untyped-def]
    controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[candidate("a", signals(ig=0.9))],
        policy_config=config(),
    )
    evt = next(
        e
        for e in event_sink.list_for_project(PROJECT)
        if e.event_type is ControlEventType.POLICY_EVALUATED
    )
    assert evt.payload["selected_action_id"] == "a"


def test_pol_035_no_action_also_emits_event(controller, event_sink) -> None:  # type: ignore[no-untyped-def]
    controller.recommend_next_action(branch_id=BRANCH, candidates=[], policy_config=config())
    types = [e.event_type for e in event_sink.list_for_project(PROJECT)]
    assert ControlEventType.POLICY_EVALUATED in types


def test_pol_036_recommendation_store_saves(controller, recommendation_store) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH, candidates=[candidate("a", signals())], policy_config=config()
    )
    fetched = recommendation_store.get(rec.evaluation_id)
    assert fetched is rec
    assert recommendation_store.list_for_project(PROJECT, BRANCH) == [rec]


# =========================================================================
# POL-037..039 — staleness
# =========================================================================
def test_pol_037_current_when_revision_matches(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH, candidates=[candidate("a", signals())], policy_config=config()
    )
    assert controller.is_recommendation_current(rec) is True


def test_pol_038_stale_after_state_change(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH, candidates=[candidate("a", signals())], policy_config=config()
    )
    # advance state so revision increments
    from packages.control.controller import APPROVAL_NOT_REQUIRED

    a = action("a-exec")
    definition = controller._registry.get("TEST_ADVANCE")
    proposal = controller.propose_transition(a, definition, to_state=STATE_READY)
    controller.execute_transition(
        proposal, definition, actor_type=ActorType.SYSTEM, approval_state=APPROVAL_NOT_REQUIRED
    )
    assert controller.is_recommendation_current(rec) is False


def test_pol_039_old_recommendation_not_auto_refreshed(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH, candidates=[candidate("a", signals())], policy_config=config()
    )
    original_rev = rec.state_revision
    # is_current is a pure check; calling it does not mutate the recommendation
    assert controller.is_recommendation_current(rec) in (True, False)
    assert rec.state_revision == original_rev


# =========================================================================
# POL-040..043 — candidate integrity
# =========================================================================
def test_pol_040_duplicate_candidate_rejected(controller) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(DuplicatePolicyCandidateError):
        controller.recommend_next_action(
            branch_id=BRANCH,
            candidates=[
                candidate("a", signals()),
                candidate("a", signals()),
            ],
            policy_config=config(),
        )


def test_pol_041_ranking_does_not_mutate_action(controller) -> None:  # type: ignore[no-untyped-def]
    a = action("a")
    original_type = a.action_type
    cand = PolicyCandidate(action=a, signals=signals())
    controller.recommend_next_action(branch_id=BRANCH, candidates=[cand], policy_config=config())
    assert a.action_type == original_type


def test_pol_042_signals_immutable() -> None:
    s = signals()
    with pytest.raises(FrozenInstanceError):
        s.information_gain = 0.9  # type: ignore[misc]


def test_pol_043_recommendation_immutable(controller) -> None:  # type: ignore[no-untyped-def]
    rec = controller.recommend_next_action(
        branch_id=BRANCH, candidates=[candidate("a", signals())], policy_config=config()
    )
    with pytest.raises(FrozenInstanceError):
        rec.status = PolicyStatus.NO_ACTION  # type: ignore[misc]


# =========================================================================
# M1-001 — end-to-end: State -> ranking -> explicit task -> transition -> event
# =========================================================================
def test_m1_001_end_to_end(controller, store, event_sink) -> None:  # type: ignore[no-untyped-def]
    from packages.control.controller import APPROVAL_NOT_REQUIRED
    from packages.domain.events import ControlEventType as CET

    # 3 candidates; A3 blocked. A1 medium info/low cost; A2 high info/high risk.
    rec = controller.recommend_next_action(
        branch_id=BRANCH,
        candidates=[
            candidate("A1", signals(ig=0.5, cost=0.1, risk=0.1)),
            candidate("A2", signals(ig=0.9, cost=0.5, risk=0.8)),
            candidate("A3", signals(ig=0.9, blocked=True)),
        ],
        policy_config=config(),
    )
    assert rec.status is PolicyStatus.RECOMMENDED
    selected = rec.selected_action_id
    assert selected is not None

    # Policy must NOT have created a task
    assert controller._task_store.list_for_project(PROJECT, BRANCH) == []

    # Higher layer EXPLICITLY creates a task + executes the selected action.
    chosen = next(c for c in rec.ranked_actions if c.action_id == selected)
    task = controller.create_task(
        project_id=PROJECT,
        branch_id=BRANCH,
        action_id=ActionId(str(selected)),
        action_type=chosen.action_type,
        target_object_id=OBJ,
    )
    controller._tasks.mark_running(task.task_id)

    a = action(str(selected), chosen.action_type)
    definition = controller._registry.get(chosen.action_type)
    proposal = controller.propose_transition(a, definition, to_state=STATE_READY)
    result = controller.execute_transition(
        proposal,
        definition,
        actor_type=ActorType.SYSTEM,
        task_id=task.task_id,
        approval_state=APPROVAL_NOT_REQUIRED,
    )

    from packages.domain.enums import TransitionDecision

    assert result.decision is TransitionDecision.COMMIT
    assert store.get_snapshot(PROJECT, BRANCH).revision == 1
    assert store.get_snapshot(PROJECT, BRANCH).object_states[OBJ] == STATE_READY
    # both a policy event and a state-change event present
    types = [e.event_type for e in event_sink.list_for_project(PROJECT)]
    assert CET.POLICY_EVALUATED in types
    assert CET.OBJECT_STATE_CHANGED in types
