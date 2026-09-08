"""CTRL-001/002/003 (legal actions + illegality), CTRL-008/009/010/011
(commit lifecycle, revision +1, stale revision, from_state mismatch),
CTRL-015 (full closed loop without LLM/DB/Temporal)."""

from __future__ import annotations

import pytest

from packages.control import (
    IllegalActionError,
    ResearchAction,
    StaleStateError,
    TransitionRejectedError,
    assert_action_legal,
)
from packages.control.gates import GateResult
from packages.control.proposals import StateTransitionProposal
from packages.domain.enums import ActorType, GateStatus, TransitionDecision
from packages.domain.ids import ObjectId

from .conftest import (
    BRANCH,
    OBJ,
    PROJECT,
    STATE_COMPLETE,
    STATE_DRAFT,
    STATE_READY,
)


# CTRL-001 ----------------------------------------------------------------
def test_ctrl_001_legal_action_is_listed(
    controller,
    draft_snapshot,
    advance_definition,  # type: ignore[no-untyped-def]
) -> None:
    legal = controller.list_legal_actions(draft_snapshot, OBJ)
    actionTypes = {d.action_type for d in legal}
    assert "TEST_ADVANCE" in actionTypes


# CTRL-002 ----------------------------------------------------------------
def test_ctrl_002_action_for_wrong_source_state_not_listed(
    controller,
    ready_snapshot,  # type: ignore[no-untyped-def]
) -> None:
    # Object is READY -> DRAFT-only action (TEST_ADVANCE) must NOT be listed;
    # only READY-only action (TEST_BLOCKED_ADVANCE) should appear.
    legal = controller.list_legal_actions(ready_snapshot, OBJ)
    actionTypes = {d.action_type for d in legal}
    assert "TEST_ADVANCE" not in actionTypes
    assert "TEST_BLOCKED_ADVANCE" in actionTypes


# CTRL-003 ----------------------------------------------------------------
def test_ctrl_003_illegal_source_state_action_raises(
    draft_snapshot,
    blocked_advance_definition,
    advance_action,  # type: ignore[no-untyped-def]
) -> None:
    # advance_action is type TEST_ADVANCE but here we test asserting against
    # a definition whose allowed source state (READY) the object (DRAFT) lacks.
    with pytest.raises(IllegalActionError):
        assert_action_legal(draft_snapshot, blocked_advance_definition, advance_action)


def test_illegal_missing_target_object_raises(
    draft_snapshot,
    advance_definition,
    advance_action,  # type: ignore[no-untyped-def]
) -> None:
    action = ResearchAction(
        action_id=advance_action.action_id,
        action_type=advance_action.action_type,
        project_id=advance_action.project_id,
        branch_id=advance_action.branch_id,
        target_object_id=ObjectId("does-not-exist"),
        actor_type=advance_action.actor_type,
    )
    with pytest.raises(IllegalActionError):
        assert_action_legal(draft_snapshot, advance_definition, action)


# CTRL-008 / 009 ---------------------------------------------------------
def test_ctrl_008_009_commit_advances_state_and_emits_event(
    controller,
    advance_action,
    advance_definition,
    store,
    fixed_now,
    seq_id_factory,  # type: ignore[no-untyped-def]
) -> None:
    proposal = controller.propose_transition(
        advance_action, advance_definition, to_state=STATE_READY, gate_results=()
    )
    assert proposal.from_state == STATE_DRAFT
    assert proposal.expected_revision == 0

    new_snapshot, event, decision = controller.commit_transition(
        proposal,
        ActorType.SYSTEM,
        advance_definition,
        now=lambda: fixed_now,
        id_factory=seq_id_factory,
    )

    assert decision is TransitionDecision.COMMIT
    # CTRL-008: state moved DRAFT -> READY
    assert new_snapshot.object_states[OBJ] == STATE_READY
    assert new_snapshot.revision == 1
    # CTRL-009: revision +1 and a single unique event
    assert event.new_revision == 1
    assert event.previous_revision == 0
    assert event.previous_state == STATE_DRAFT
    assert event.new_state == STATE_READY
    assert event.aggregate_id == OBJ
    events = store.events()
    assert len(events) == 1
    assert events[0].event_id == event.event_id


# CTRL-010 ----------------------------------------------------------------
def test_ctrl_010_stale_revision_rejected_and_state_unchanged(
    controller,
    store,
    advance_action,
    advance_definition,
    fixed_now,
    seq_id_factory,  # type: ignore[no-untyped-def]
) -> None:
    stale = StateTransitionProposal(
        proposal_id="p-stale",
        project_id=PROJECT,
        branch_id=BRANCH,
        target_object_id=OBJ,
        from_state=STATE_DRAFT,
        to_state=STATE_READY,
        action_id=advance_action.action_id,
        gate_results=(),
        expected_revision=99,  # actual is 0
    )
    with pytest.raises(StaleStateError):
        controller.commit_transition(
            stale,
            ActorType.SYSTEM,
            advance_definition,
            now=lambda: fixed_now,
            id_factory=seq_id_factory,
        )
    # state must be unchanged
    snap = store.get_snapshot(PROJECT, BRANCH)
    assert snap.revision == 0
    assert snap.object_states[OBJ] == STATE_DRAFT
    assert store.events() == []


# CTRL-011 ----------------------------------------------------------------
def test_ctrl_011_wrong_from_state_not_committed(
    controller,
    store,
    advance_action,
    advance_definition,
    fixed_now,
    seq_id_factory,  # type: ignore[no-untyped-def]
) -> None:
    from packages.control.errors import InvariantViolationError

    proposal = StateTransitionProposal(
        proposal_id="p-wrong",
        project_id=PROJECT,
        branch_id=BRANCH,
        target_object_id=OBJ,
        from_state=STATE_COMPLETE,  # object is actually DRAFT
        to_state=STATE_READY,
        action_id=advance_action.action_id,
        gate_results=(),
        expected_revision=0,
    )
    with pytest.raises(InvariantViolationError):
        controller.commit_transition(
            proposal,
            ActorType.SYSTEM,
            advance_definition,
            now=lambda: fixed_now,
            id_factory=seq_id_factory,
        )
    snap = store.get_snapshot(PROJECT, BRANCH)
    assert snap.object_states[OBJ] == STATE_DRAFT
    assert store.events() == []


def test_reject_decision_does_not_commit(
    controller,
    advance_action,
    advance_definition,
    store,  # type: ignore[no-untyped-def]
) -> None:
    failing = (GateResult(gate_id="g", status=GateStatus.FAIL, message="no"),)
    proposal = controller.propose_transition(
        advance_action,
        advance_definition,
        to_state=STATE_READY,
        gate_results=failing,
    )
    with pytest.raises(TransitionRejectedError):
        controller.commit_transition(proposal, ActorType.SYSTEM, advance_definition)
    assert store.get_snapshot(PROJECT, BRANCH).revision == 0
    assert store.events() == []


def test_wait_decision_does_not_commit(
    controller,
    advance_action,
    advance_definition,
    store,  # type: ignore[no-untyped-def]
) -> None:
    blocked = (GateResult(gate_id="g", status=GateStatus.BLOCKED),)
    proposal = controller.propose_transition(
        advance_action,
        advance_definition,
        to_state=STATE_READY,
        gate_results=blocked,
    )
    with pytest.raises(TransitionRejectedError):
        controller.commit_transition(proposal, ActorType.SYSTEM, advance_definition)
    assert store.events() == []


# CTRL-015 ----------------------------------------------------------------
def test_ctrl_015_full_closed_loop_without_llm_db_temporal(
    controller,
    store,
    advance_action,
    advance_definition,
    fixed_now,
    seq_id_factory,  # type: ignore[no-untyped-def]
) -> None:
    """State -> Action -> Gate -> Transition -> Event -> New State, with no
    LLM, no database, and no Temporal anywhere in the call path."""

    # 1. read state
    before = controller.get_state(PROJECT, BRANCH)
    assert before.revision == 0
    assert before.object_states[OBJ] == STATE_DRAFT

    # 2. legal action
    assert advance_definition in controller.list_legal_actions(before, OBJ)

    # 3. propose (gate results: none required)
    proposal = controller.propose_transition(
        advance_action, advance_definition, to_state=STATE_READY, gate_results=()
    )

    # 4. commit -> decision + event + new state
    after, event, decision = controller.commit_transition(
        proposal,
        ActorType.SYSTEM,
        advance_definition,
        now=lambda: fixed_now,
        id_factory=seq_id_factory,
    )

    # 5. assertions over the closed loop
    assert decision is TransitionDecision.COMMIT
    assert after.revision == before.revision + 1
    assert after.object_states[OBJ] == STATE_READY
    assert event.previous_revision == before.revision
    assert event.new_revision == after.revision
    assert store.events() == [event]
