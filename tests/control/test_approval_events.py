"""EVT-001/002/003 — approval event semantics correction (STEP-004 §3/§45).

cancel and reject are now DISTINCT audit events; expire() emits its own event.
"""

from __future__ import annotations

from packages.domain.enums import ActorType
from packages.domain.events import ControlEventType
from packages.domain.ids import ActionId, BranchId

from .conftest import BRANCH, OBJ, PROJECT, STATE_READY

H1 = BranchId("H1")


def _seed_pending_approval(controller):  # type: ignore[no-untyped-def]
    from packages.control import ResearchAction

    controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    action = ResearchAction(
        action_id=ActionId("act"),
        action_type="TEST_APPROVAL_ADVANCE",
        project_id=PROJECT,
        branch_id=H1,
        target_object_id=OBJ,
        actor_type=ActorType.SYSTEM,
    )
    definition = controller._registry.get("TEST_APPROVAL_ADVANCE")
    task = controller.create_task(
        project_id=PROJECT,
        branch_id=H1,
        action_id=action.action_id,
        action_type="TEST_APPROVAL_ADVANCE",
        target_object_id=OBJ,
    )
    controller._tasks.mark_running(task.task_id)
    proposal = controller.propose_transition(action, definition, to_state=STATE_READY)
    controller.execute_transition(
        proposal, definition, actor_type=ActorType.SYSTEM, task_id=task.task_id
    )
    return controller.list_pending_transitions(PROJECT, H1)[0]


def test_evt_001_reject_emits_rejected(controller, event_sink) -> None:  # type: ignore[no-untyped-def]
    pending = _seed_pending_approval(controller)
    controller.reject(pending.approval_id, resolved_by=ActorType.USER)
    types = [e.event_type for e in event_sink.list_for_project(PROJECT)]
    assert ControlEventType.APPROVAL_REJECTED in types


def test_evt_002_cancel_emits_cancelled_not_rejected(controller, event_sink) -> None:  # type: ignore[no-untyped-def]
    pending = _seed_pending_approval(controller)
    controller._approvals.cancel(pending.approval_id, resolved_by=ActorType.USER)
    types = [e.event_type for e in event_sink.list_for_project(PROJECT)]
    assert ControlEventType.APPROVAL_CANCELLED in types
    assert ControlEventType.APPROVAL_REJECTED not in types


def test_evt_003_expire_emits_expired(controller, event_sink) -> None:  # type: ignore[no-untyped-def]
    pending = _seed_pending_approval(controller)
    controller._approvals.expire(pending.approval_id, resolved_by=ActorType.SYSTEM)
    types = [e.event_type for e in event_sink.list_for_project(PROJECT)]
    assert ControlEventType.APPROVAL_EXPIRED in types
