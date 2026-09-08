"""BR-001..012, ISO-001..007, BUSY-001..004 — branch lifecycle, isolation, busy.

Neutral fixtures: project=PROJECT, main branch=BRANCH, forked branches H1/H2.
Object OBJ starts DRAFT on main.
"""

from __future__ import annotations

import pytest

from packages.control.branches import BranchStatus
from packages.control.errors import (
    BranchBusyError,
    BranchScopeMismatchError,
    CrossBranchDependencyError,
    DuplicateBranchError,
    IllegalActionError,
    IllegalBranchTransitionError,
)
from packages.domain.enums import ActorType
from packages.domain.events import ControlEventType
from packages.domain.ids import ActionId, BranchId

from .conftest import BRANCH, OBJ, PROJECT, STATE_READY

H1 = BranchId("H1")
H2 = BranchId("H2")


# =========================================================================
# BR — lifecycle
# =========================================================================
def test_br_001_create_main_branch(controller) -> None:  # type: ignore[no-untyped-def]
    # main branch already created by the controller fixture
    main = controller.get_branch(BRANCH)
    assert main.is_main()
    assert main.status is BranchStatus.ACTIVE
    assert main.parent_branch_id is None
    assert main.forked_from_revision is None


def test_br_002_second_main_rejected(controller) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(DuplicateBranchError):
        controller.create_main_branch(project_id=PROJECT, branch_id=BranchId("main-2"))


def test_br_003_fork_active_source(controller) -> None:  # type: ignore[no-untyped-def]
    h1 = controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    assert h1.status is BranchStatus.ACTIVE
    assert h1.parent_branch_id == BRANCH


def test_br_004_fork_provenance(controller) -> None:  # type: ignore[no-untyped-def]
    h1 = controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    assert h1.parent_branch_id == BRANCH
    assert h1.forked_from_revision == 0  # main is at revision 0


def test_br_005_fork_new_branch_revision_zero(controller) -> None:  # type: ignore[no-untyped-def]
    controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    snap = controller.get_state(PROJECT, H1)
    assert snap.revision == 0


def test_br_006_fork_states_not_aliased(controller, store) -> None:  # type: ignore[no-untyped-def]
    controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    main_snap = store.get_snapshot(PROJECT, BRANCH)
    h1_snap = store.get_snapshot(PROJECT, H1)
    assert main_snap.object_states is not h1_snap.object_states
    assert dict(main_snap.object_states) == dict(h1_snap.object_states)


def test_br_007_modify_child_does_not_affect_source(controller, store) -> None:  # type: ignore[no-untyped-def]
    controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    # advance H1: DRAFT -> READY
    from packages.control.controller import APPROVAL_NOT_REQUIRED
    from packages.domain.enums import ActorType as AT

    action = _action_on(H1, "TEST_ADVANCE")
    definition = controller._registry.get("TEST_ADVANCE")
    proposal = controller.propose_transition(action, definition, to_state=STATE_READY)
    controller.execute_transition(
        proposal, definition, actor_type=AT.SYSTEM, approval_state=APPROVAL_NOT_REQUIRED
    )

    # main untouched
    main_snap = store.get_snapshot(PROJECT, BRANCH)
    assert main_snap.object_states[OBJ] == "DRAFT"
    assert main_snap.revision == 0
    # H1 advanced
    h1_snap = store.get_snapshot(PROJECT, H1)
    assert h1_snap.object_states[OBJ] == STATE_READY
    assert h1_snap.revision == 1


def test_br_008_pause_active(controller) -> None:  # type: ignore[no-untyped-def]
    updated = controller.pause_branch(BRANCH)
    assert updated.status is BranchStatus.PAUSED


def test_br_009_resume_paused(controller) -> None:  # type: ignore[no-untyped-def]
    controller.pause_branch(BRANCH)
    updated = controller.resume_branch(BRANCH)
    assert updated.status is BranchStatus.ACTIVE


@pytest.mark.parametrize("op", ["archive_branch", "reject_branch"])
def test_br_010_terminal_via_archive_or_reject(controller, op) -> None:  # type: ignore[no-untyped-def]
    updated = getattr(controller, op)(BRANCH)
    assert updated.is_terminal()


def test_br_011_terminal_not_revived(controller) -> None:  # type: ignore[no-untyped-def]
    controller.archive_branch(BRANCH)
    with pytest.raises(IllegalBranchTransitionError):
        controller.resume_branch(BRANCH)
    with pytest.raises(IllegalBranchTransitionError):
        controller.pause_branch(BRANCH)


def test_br_012_lifecycle_change_emits_event(controller, event_sink) -> None:  # type: ignore[no-untyped-def]
    controller.pause_branch(BRANCH)
    types = [e.event_type for e in event_sink.list_for_project(PROJECT)]
    assert ControlEventType.BRANCH_CREATED in types
    assert ControlEventType.BRANCH_PAUSED in types


# =========================================================================
# ISO — isolation
# =========================================================================
def test_iso_001_revisions_independent(controller, store) -> None:  # type: ignore[no-untyped-def]
    # advance main DRAFT->READY (main rev 1); fork H1 (rev 0, also READY);
    # advance H1 READY->COMPLETE (H1 rev 1). main and H1 revisions are independent.
    _advance_main(controller, to=STATE_READY)  # main rev 1
    controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    h1_action = _action_on(H1, "TEST_BLOCKED_ADVANCE")
    h1_def = controller._registry.get("TEST_BLOCKED_ADVANCE")
    h1_proposal = controller.propose_transition(h1_action, h1_def, to_state="COMPLETE")
    controller.execute_transition(h1_proposal, h1_def, actor_type=ActorType.SYSTEM)

    assert store.get_snapshot(PROJECT, BRANCH).revision == 1
    assert store.get_snapshot(PROJECT, H1).revision == 1
    # main stayed READY; H1 went to COMPLETE — independent evolution
    assert store.get_snapshot(PROJECT, BRANCH).object_states[OBJ] == STATE_READY
    assert store.get_snapshot(PROJECT, H1).object_states[OBJ] == "COMPLETE"


def test_iso_002_action_branch_mismatch_rejected(controller) -> None:  # type: ignore[no-untyped-def]
    controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    # action targets H1 but branch store lookup for H1 is fine; mismatch here
    # is about scope: an action whose project differs.
    from packages.control.engine import assert_action_legal

    bad_action = type(_action_on(H1, "TEST_ADVANCE"))(
        action_id=ActionId("x"),
        action_type="TEST_ADVANCE",
        project_id=PROJECT,
        branch_id=BranchId("nonexistent"),
        target_object_id=OBJ,
        actor_type=ActorType.SYSTEM,
    )
    definition = controller._registry.get("TEST_ADVANCE")
    state = controller.get_state(PROJECT, H1)
    with pytest.raises(IllegalActionError):
        assert_action_legal(state, definition, bad_action)


def test_iso_003_cross_branch_task_dependency_rejected(controller) -> None:  # type: ignore[no-untyped-def]
    controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    main_task = controller.create_task(
        project_id=PROJECT,
        branch_id=BRANCH,
        action_id=ActionId("a-main"),
        action_type="TEST_ADVANCE",
        target_object_id=OBJ,
    )
    with pytest.raises(CrossBranchDependencyError):
        controller.create_task(
            project_id=PROJECT,
            branch_id=H1,
            action_id=ActionId("a-h1"),
            action_type="TEST_ADVANCE",
            target_object_id=OBJ,
            dependencies=(main_task.task_id,),
        )


def test_iso_004_approval_branch_mismatch_rejected(controller) -> None:  # type: ignore[no-untyped-def]
    controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    # build an approval on H1
    approval_action = _action_on(H1, "TEST_APPROVAL_ADVANCE")
    approval_def = controller._registry.get("TEST_APPROVAL_ADVANCE")
    task = controller.create_task(
        project_id=PROJECT,
        branch_id=H1,
        action_id=approval_action.action_id,
        action_type="TEST_APPROVAL_ADVANCE",
        target_object_id=OBJ,
    )
    controller._tasks.mark_running(task.task_id)
    proposal = controller.propose_transition(approval_action, approval_def, to_state=STATE_READY)
    controller.execute_transition(
        proposal, approval_def, actor_type=ActorType.SYSTEM, task_id=task.task_id
    )
    pending = controller.list_pending_transitions(PROJECT, H1)[0]
    # approve on H1
    approval = controller.approve(pending.approval_id, resolved_by=ActorType.USER)
    # using that approval against the MAIN branch must fail
    with pytest.raises(BranchScopeMismatchError):
        controller.assert_approval_branch_matches(approval.approval_id, PROJECT, BRANCH)


def test_iso_005_pending_cannot_resume_on_other_branch(controller) -> None:  # type: ignore[no-untyped-def]
    # main pending transition; archive main -> terminal; resume must fail
    approval_action = _action_on(BRANCH, "TEST_APPROVAL_ADVANCE")
    approval_def = controller._registry.get("TEST_APPROVAL_ADVANCE")
    task = controller.create_task(
        project_id=PROJECT,
        branch_id=BRANCH,
        action_id=approval_action.action_id,
        action_type="TEST_APPROVAL_ADVANCE",
        target_object_id=OBJ,
    )
    controller._tasks.mark_running(task.task_id)
    proposal = controller.propose_transition(approval_action, approval_def, to_state=STATE_READY)
    controller.execute_transition(
        proposal, approval_def, actor_type=ActorType.SYSTEM, task_id=task.task_id
    )
    pending = controller.list_pending_transitions(PROJECT, BRANCH)[0]
    controller.archive_branch(BRANCH)  # terminal
    refreshed = controller._pending_store.get(pending.proposal_id)
    with pytest.raises(IllegalActionError):
        controller.resume_pending_transition(
            refreshed, definition=approval_def, actor_type=ActorType.SYSTEM
        )


def test_iso_006_terminal_branch_cannot_commit(controller) -> None:  # type: ignore[no-untyped-def]
    controller.reject_branch(BRANCH)
    action = _action_on(BRANCH, "TEST_ADVANCE")
    definition = controller._registry.get("TEST_ADVANCE")
    with pytest.raises(IllegalActionError):
        # propose_transition itself asserts action legality against state but
        # not branch status; execute_transition enforces branch actionable.
        proposal = controller.propose_transition(action, definition, to_state=STATE_READY)
        controller.execute_transition(proposal, definition, actor_type=ActorType.SYSTEM)


def test_iso_007_paused_branch_no_ordinary_actions(controller) -> None:  # type: ignore[no-untyped-def]
    controller.pause_branch(BRANCH)
    state = controller.get_state(PROJECT, BRANCH)
    assert controller.list_legal_actions(state, OBJ) == []


# =========================================================================
# BUSY — running tasks block lifecycle ops
# =========================================================================
@pytest.mark.parametrize("op", ["pause_branch", "archive_branch", "reject_branch"])
def test_busy_001_003_running_task_blocks(controller, op) -> None:  # type: ignore[no-untyped-def]
    task = controller.create_task(
        project_id=PROJECT,
        branch_id=BRANCH,
        action_id=ActionId("a"),
        action_type="TEST_ADVANCE",
        target_object_id=OBJ,
    )
    controller._tasks.mark_running(task.task_id)
    with pytest.raises(BranchBusyError):
        getattr(controller, op)(BRANCH)


def test_busy_004_waiting_task_allows_pause(controller) -> None:  # type: ignore[no-untyped-def]
    task = controller.create_task(
        project_id=PROJECT,
        branch_id=BRANCH,
        action_id=ActionId("a"),
        action_type="TEST_ADVANCE",
        target_object_id=OBJ,
    )
    controller._tasks.mark_running(task.task_id)
    controller._tasks.mark_waiting(task.task_id)
    updated = controller.pause_branch(BRANCH)  # must NOT raise
    assert updated.status is BranchStatus.PAUSED


# --- helpers -------------------------------------------------------------
def _action_on(branch_id: BranchId, action_type: str):  # type: ignore[no-untyped-def]
    from packages.control import ResearchAction

    return ResearchAction(
        action_id=ActionId(f"act-{branch_id}"),
        action_type=action_type,
        project_id=PROJECT,
        branch_id=branch_id,
        target_object_id=OBJ,
        actor_type=ActorType.SYSTEM,
    )


def _advance_main(controller, *, to: str, from_state: str = "DRAFT") -> None:  # type: ignore[no-untyped-def]
    from packages.control.controller import APPROVAL_NOT_REQUIRED

    action = _action_on(BRANCH, "TEST_ADVANCE")
    definition = controller._registry.get("TEST_ADVANCE")
    proposal = controller.propose_transition(action, definition, to_state=to)
    assert proposal.from_state == from_state
    controller.execute_transition(
        proposal, definition, actor_type=ActorType.SYSTEM, approval_state=APPROVAL_NOT_REQUIRED
    )
