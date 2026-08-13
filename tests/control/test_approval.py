"""APP-001..007 — Approval lifecycle: request, approve, resume, reject, terminal.

Flow under test (STEP-003 §23/§24/§25):
    requires_approval + gates PASS + approval missing
        -> WAIT -> PendingTransition(PENDING) -> ApprovalRequest(PENDING)
    APPROVED  -> PendingTransition RESUMABLE -> resume -> COMMIT (re-check rev)
    REJECTED  -> PendingTransition REJECTED + Task FAILED, no state change
    terminal approval cannot be re-resolved
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from packages.control.approvals import ApprovalStatus
from packages.control.controller import APPROVAL_APPROVED, APPROVAL_NOT_REQUIRED
from packages.control.errors import StaleStateError
from packages.control.pending import PendingTransitionStatus
from packages.control.tasks import TaskStatus
from packages.domain.enums import ActorType, TransitionDecision
from packages.domain.events import ControlEventType, DomainEvent
from packages.domain.ids import ActionId, EventId, ProposalId

from .conftest import BRANCH, OBJ, PROJECT, STATE_READY


def _seed_running_task(controller) -> object:  # type: ignore[no-untyped-def]
    task = controller.create_task(
        project_id=PROJECT,
        branch_id=BRANCH,
        action_id=ActionId("act-approval"),
        action_type="TEST_APPROVAL_ADVANCE",
        target_object_id=OBJ,
    )
    controller._tasks.mark_running(task.task_id)
    return task


def _propose_and_execute(controller, action, definition, *, task_id):  # type: ignore[no-untyped-def]
    proposal = controller.propose_transition(
        action, definition, to_state=STATE_READY, gate_results=()
    )
    result = controller.execute_transition(
        proposal,
        definition,
        actor_type=ActorType.SYSTEM,
        task_id=task_id,
        # approval missing -> engine treats as PENDING wait
        approval_state=APPROVAL_NOT_REQUIRED,
    )
    return result


# APP-001 ----------------------------------------------------------------
def test_app_001_approval_required_waits_and_creates_request(
    controller, approval_action, approval_definition, store, approval_store  # type: ignore[no-untyped-def]
) -> None:
    task = _seed_running_task(controller)
    result = _propose_and_execute(
        controller, approval_action, approval_definition, task_id=task.task_id
    )

    assert result.decision is TransitionDecision.WAIT
    assert result.pending_transition is not None
    # state NOT committed
    assert store.get_snapshot(PROJECT, BRANCH).revision == 0
    # pending transition created and PENDING
    pendings = controller.list_pending_transitions(PROJECT, BRANCH)
    assert len(pendings) == 1
    assert pendings[0].status is PendingTransitionStatus.PENDING
    # approval request created and PENDING
    pending_approval = approval_store.list_pending(PROJECT, BRANCH)
    assert len(pending_approval) == 1
    assert pending_approval[0].status is ApprovalStatus.PENDING
    # task moved to WAITING
    assert controller.get_task(task.task_id).status is TaskStatus.WAITING


# APP-002 ----------------------------------------------------------------
def test_app_002_approved_marks_pending_resumable(
    controller, approval_action, approval_definition  # type: ignore[no-untyped-def]
) -> None:
    task = _seed_running_task(controller)
    _propose_and_execute(
        controller, approval_action, approval_definition, task_id=task.task_id
    )
    pending = controller.list_pending_transitions(PROJECT, BRANCH)[0]

    controller.approve(pending.approval_id, resolved_by=ActorType.USER, note="ok")

    updated = controller._pending_store.get(pending.proposal_id)
    assert updated.status is PendingTransitionStatus.RESUMABLE


# APP-003 ----------------------------------------------------------------
def test_app_003_resume_after_approval_commits(
    controller, approval_action, approval_definition, store  # type: ignore[no-untyped-def]
) -> None:
    task = _seed_running_task(controller)
    _propose_and_execute(
        controller, approval_action, approval_definition, task_id=task.task_id
    )
    pending = controller.list_pending_transitions(PROJECT, BRANCH)[0]
    controller.approve(pending.approval_id, resolved_by=ActorType.USER)

    refreshed = controller._pending_store.get(pending.proposal_id)
    result = controller.resume_pending_transition(
        refreshed,
        definition=approval_definition,
        actor_type=ActorType.SYSTEM,
        approval_state=APPROVAL_APPROVED,
    )

    assert result.decision is TransitionDecision.COMMIT
    assert store.get_snapshot(PROJECT, BRANCH).revision == 1
    assert store.get_snapshot(PROJECT, BRANCH).object_states[OBJ] == STATE_READY
    # task succeeded after commit
    assert controller.get_task(task.task_id).status is TaskStatus.SUCCEEDED


# APP-004 ----------------------------------------------------------------
def test_app_004_resume_with_changed_revision_raises_stale(
    controller, approval_action, approval_definition, store  # type: ignore[no-untyped-def]
) -> None:
    task = _seed_running_task(controller)
    _propose_and_execute(
        controller, approval_action, approval_definition, task_id=task.task_id
    )
    pending = controller.list_pending_transitions(PROJECT, BRANCH)[0]
    controller.approve(pending.approval_id, resolved_by=ActorType.USER)

    # Simulate external state change: bump revision via a direct store commit
    # using a different (non-approval) action so the pending proposal's
    # expected_revision (0) is now stale.
    from packages.control.proposals import StateTransitionProposal

    other = StateTransitionProposal(
        proposal_id=ProposalId("prop-ext"),
        project_id=PROJECT,
        branch_id=BRANCH,
        target_object_id=OBJ,
        from_state="DRAFT",
        to_state="READY",
        action_id=ActionId("act-other"),
        gate_results=(),
        expected_revision=0,
    )
    store.commit_transition(
        other,
        DomainEvent(
            event_id=EventId("e-ext"),
            project_id=PROJECT,
            branch_id=BRANCH,
            event_type="OBJECT_STATE_CHANGED",
            aggregate_id=OBJ,
            previous_state="DRAFT",
            new_state="READY",
            previous_revision=0,
            new_revision=1,
            action_id=ActionId("act-other"),
            actor_type=ActorType.SYSTEM,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        ),
    )

    refreshed = controller._pending_store.get(pending.proposal_id)
    with pytest.raises(StaleStateError):
        controller.resume_pending_transition(
            refreshed,
            definition=approval_definition,
            actor_type=ActorType.SYSTEM,
            approval_state=APPROVAL_APPROVED,
        )
    # research state must remain at revision 1 (the external change), NOT 2
    assert store.get_snapshot(PROJECT, BRANCH).revision == 1


# APP-005 ----------------------------------------------------------------
def test_app_005_rejected_fails_task_and_rejects_pending(
    controller, approval_action, approval_definition, store  # type: ignore[no-untyped-def]
) -> None:
    task = _seed_running_task(controller)
    _propose_and_execute(
        controller, approval_action, approval_definition, task_id=task.task_id
    )
    pending = controller.list_pending_transitions(PROJECT, BRANCH)[0]

    controller.reject(pending.approval_id, resolved_by=ActorType.USER, note="no")

    assert controller._pending_store.get(pending.proposal_id).status is (
        PendingTransitionStatus.REJECTED
    )
    assert controller.get_task(task.task_id).status is TaskStatus.FAILED
    # research state unchanged
    assert store.get_snapshot(PROJECT, BRANCH).revision == 0


# APP-006 ----------------------------------------------------------------
@pytest.mark.parametrize("resolver", ["approve", "reject"])
def test_app_006_terminal_approval_cannot_be_re_resolved(
    controller, approval_action, approval_definition, resolver  # type: ignore[no-untyped-def]
) -> None:
    from packages.control.errors import InvariantViolationError

    task = _seed_running_task(controller)
    _propose_and_execute(
        controller, approval_action, approval_definition, task_id=task.task_id
    )
    pending = controller.list_pending_transitions(PROJECT, BRANCH)[0]

    if resolver == "approve":
        controller.approve(pending.approval_id, resolved_by=ActorType.USER)
    else:
        controller.reject(pending.approval_id, resolved_by=ActorType.USER)

    # second resolution must fail
    with pytest.raises(InvariantViolationError):
        if resolver == "approve":
            controller.approve(pending.approval_id, resolved_by=ActorType.USER)
        else:
            controller.reject(pending.approval_id, resolved_by=ActorType.USER)


# APP-007 ----------------------------------------------------------------
def test_app_007_approval_lifecycle_emits_events(
    controller, approval_action, approval_definition, event_sink  # type: ignore[no-untyped-def]
) -> None:
    task = _seed_running_task(controller)
    _propose_and_execute(
        controller, approval_action, approval_definition, task_id=task.task_id
    )
    pending = controller.list_pending_transitions(PROJECT, BRANCH)[0]

    types_before = {e.event_type for e in event_sink.list_for_project(PROJECT)}
    assert ControlEventType.APPROVAL_REQUESTED in types_before
    assert ControlEventType.TRANSITION_WAITING in types_before

    controller.approve(pending.approval_id, resolved_by=ActorType.USER)

    types_after = {e.event_type for e in event_sink.list_for_project(PROJECT)}
    assert ControlEventType.APPROVAL_APPROVED in types_after
