"""WAIT-001/002/003 + CTRL-016 — WAIT semantics via unified TransitionExecutionResult.

WAIT must NOT drop the proposal, NOT be expressed as an exception, and must
materialize a recoverable PendingTransition while leaving Research State
unchanged.
"""

from __future__ import annotations

from packages.control.controller import APPROVAL_NOT_REQUIRED
from packages.control.gates import GateResult
from packages.control.pending import PendingTransitionStatus
from packages.domain.enums import ActorType, GateStatus, TransitionDecision
from packages.domain.ids import ActionId

from .conftest import BRANCH, OBJ, PROJECT, STATE_READY


def _g(status: GateStatus, gate_id: str = "g1") -> GateResult:
    return GateResult(gate_id=gate_id, status=status)


# WAIT-001 ----------------------------------------------------------------
def test_wait_001_uncertain_creates_pending_and_leaves_state(
    controller, advance_action, advance_definition, store  # type: ignore[no-untyped-def]
) -> None:
    proposal = controller.propose_transition(
        advance_action,
        advance_definition,
        to_state=STATE_READY,
        gate_results=(_g(GateStatus.UNCERTAIN),),
    )
    result = controller.execute_transition(
        proposal,
        advance_definition,
        actor_type=ActorType.SYSTEM,
        approval_state=APPROVAL_NOT_REQUIRED,
    )

    assert result.decision is TransitionDecision.WAIT
    assert result.snapshot is None
    assert result.event is None
    assert result.pending_transition is not None
    assert result.pending_transition.waiting_on == "UNCERTAINTY"

    # state unchanged
    snap = store.get_snapshot(PROJECT, BRANCH)
    assert snap.revision == 0
    assert snap.object_states[OBJ] == "DRAFT"

    # pending persisted
    pendings = controller.list_pending_transitions(PROJECT, BRANCH)
    assert len(pendings) == 1
    assert pendings[0].status is PendingTransitionStatus.PENDING


# WAIT-002 ----------------------------------------------------------------
def test_wait_002_blocked_creates_pending(
    controller, advance_action, advance_definition, store  # type: ignore[no-untyped-def]
) -> None:
    proposal = controller.propose_transition(
        advance_action,
        advance_definition,
        to_state=STATE_READY,
        gate_results=(_g(GateStatus.BLOCKED),),
    )
    result = controller.execute_transition(
        proposal, advance_definition, actor_type=ActorType.SYSTEM
    )

    assert result.decision is TransitionDecision.WAIT
    assert result.pending_transition is not None
    assert result.pending_transition.waiting_on == "BLOCKED"
    assert store.get_snapshot(PROJECT, BRANCH).revision == 0


# WAIT-003 ----------------------------------------------------------------
def test_wait_003_not_expressed_as_exception(
    controller, advance_action, advance_definition  # type: ignore[no-untyped-def]
) -> None:
    """WAIT is a normal typed result, never a raised exception."""
    proposal = controller.propose_transition(
        advance_action,
        advance_definition,
        to_state=STATE_READY,
        gate_results=(_g(GateStatus.UNCERTAIN),),
    )
    # Must return, not raise.
    result = controller.execute_transition(
        proposal, advance_definition, actor_type=ActorType.SYSTEM
    )
    assert result.decision is TransitionDecision.WAIT


def test_wait_with_task_marks_task_waiting(
    controller, advance_action, advance_definition  # type: ignore[no-untyped-def]
) -> None:
    from packages.control.tasks import TaskStatus

    task = controller.create_task(
        project_id=PROJECT,
        branch_id=BRANCH,
        action_id=ActionId("act-wait"),
        action_type="TEST_ADVANCE",
        target_object_id=OBJ,
    )
    controller._tasks.mark_running(task.task_id)

    proposal = controller.propose_transition(
        advance_action,
        advance_definition,
        to_state=STATE_READY,
        gate_results=(_g(GateStatus.UNCERTAIN),),
    )
    controller.execute_transition(
        proposal,
        advance_definition,
        actor_type=ActorType.SYSTEM,
        task_id=task.task_id,
    )

    assert controller.get_task(task.task_id).status is TaskStatus.WAITING


# CTRL-016 ----------------------------------------------------------------
def test_ctrl_016_normal_action_still_commits(
    controller, advance_action, advance_definition, store  # type: ignore[no-untyped-def]
) -> None:
    """A legal, no-approval, all-PASS action still commits (STEP-002 behavior)."""
    proposal = controller.propose_transition(
        advance_action, advance_definition, to_state=STATE_READY, gate_results=()
    )
    result = controller.execute_transition(
        proposal, advance_definition, actor_type=ActorType.SYSTEM
    )
    assert result.decision is TransitionDecision.COMMIT
    assert result.snapshot is not None
    assert result.event is not None
    assert result.pending_transition is None
    assert store.get_snapshot(PROJECT, BRANCH).revision == 1
