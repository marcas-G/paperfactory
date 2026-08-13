"""BAPP-001/002 — approval + branch interaction (STEP-004 §35/§36).

A pending transition on a branch may be approved while the branch is PAUSED,
but it MUST NOT commit until the branch is RESUMED.
"""

from __future__ import annotations

import pytest

from packages.control.errors import IllegalActionError
from packages.domain.enums import ActorType, TransitionDecision
from packages.domain.ids import ActionId, BranchId

from .conftest import BRANCH, OBJ, PROJECT, STATE_READY

H1 = BranchId("H1")


def _seed_approval_pending(controller):  # type: ignore[no-untyped-def]
    """Create a task + approval-required proposal on H1, return (task, proposal, pending)."""
    controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")
    from packages.control import ResearchAction

    action = ResearchAction(
        action_id=ActionId("act-app"),
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
    pending = controller.list_pending_transitions(PROJECT, H1)[0]
    return task, definition, pending


def test_bapp_001_approved_while_paused_cannot_commit(controller, store) -> None:  # type: ignore[no-untyped-def]
    task, definition, pending = _seed_approval_pending(controller)

    # pause the branch while approval is still pending
    controller.pause_branch(H1)
    # approval can still be granted (records the decision)
    controller.approve(pending.approval_id, resolved_by=ActorType.USER)

    refreshed = controller._pending_store.get(pending.proposal_id)
    # branch is PAUSED -> resume must be refused (no commit)
    with pytest.raises(IllegalActionError):
        controller.resume_pending_transition(
            refreshed, definition=definition, actor_type=ActorType.SYSTEM
        )
    # research state unchanged
    assert store.get_snapshot(PROJECT, H1).revision == 0


def test_bapp_002_resume_branch_then_pending_commits(controller, store) -> None:  # type: ignore[no-untyped-def]
    from packages.control.tasks import TaskStatus

    task, definition, pending = _seed_approval_pending(controller)
    controller.pause_branch(H1)
    controller.approve(pending.approval_id, resolved_by=ActorType.USER)

    # now resume the branch
    controller.resume_branch(H1)
    refreshed = controller._pending_store.get(pending.proposal_id)
    result = controller.resume_pending_transition(
        refreshed, definition=definition, actor_type=ActorType.SYSTEM
    )

    assert result.decision is TransitionDecision.COMMIT
    assert store.get_snapshot(PROJECT, H1).revision == 1
    assert controller.get_task(task.task_id).status is TaskStatus.SUCCEEDED
