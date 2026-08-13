"""ResearchTask — a Control-plane execution unit for one Research Action.

A Task is a Control Object, NOT a Runtime Job (STEP-003 §28): there is no
scheduler, no async, no worker. It merely tracks the lifecycle of an Action
the Control Plane plans or is advancing.

Immutability strategy (STEP-003 §7): Tasks are frozen dataclasses; state
changes produce a NEW Task via ``with_status(...)``. There is no
``task.status = ...`` anywhere in the Controller.

Task lifecycle rules (STEP-003 §8, extended for resume §25/§26):
    PENDING  -> READY | CANCELLED
    READY    -> RUNNING | CANCELLED
    RUNNING  -> WAITING | SUCCEEDED | FAILED
    WAITING  -> READY | SUCCEEDED | FAILED | CANCELLED
    (terminal: SUCCEEDED / FAILED / CANCELLED — never revived)
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import StrEnum

from ..domain.enums import ActorType
from ..domain.ids import ActionId, BranchId, ObjectId, ProjectId, TaskId
from .actions import ActionType
from .errors import InvariantViolationError

# Reason code: a task failed because its approval was rejected.
REASON_APPROVAL_REJECTED = "APPROVAL_REJECTED"

# Reason code: a task failed because its approval was rejected.
REASON_APPROVAL_REJECTED = "APPROVAL_REJECTED"


class TaskStatus(StrEnum):
    """Lifecycle states of a ResearchTask (STEP-003 §6)."""

    PENDING = "PENDING"
    READY = "READY"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


TERMINAL_TASK_STATUSES = frozenset(
    {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELLED}
)

# Legal forward transitions (STEP-003 §8). Terminal states never appear as a
# source — they cannot be revived.
_LEGAL_TASK_TRANSITIONS: dict[TaskStatus, frozenset[TaskStatus]] = {
    TaskStatus.PENDING: frozenset({TaskStatus.READY, TaskStatus.CANCELLED}),
    TaskStatus.READY: frozenset({TaskStatus.RUNNING, TaskStatus.CANCELLED}),
    TaskStatus.RUNNING: frozenset(
        {TaskStatus.WAITING, TaskStatus.SUCCEEDED, TaskStatus.FAILED}
    ),
    # WAITING may resolve to READY (resume), succeed/fail directly on resume,
    # or be cancelled. Direct SUCCEEDED/FAILED from WAITING covers the
    # approval-resume and approval-rejected paths (STEP-003 §25/§26).
    TaskStatus.WAITING: frozenset(
        {TaskStatus.READY, TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELLED}
    ),
    # terminal: no outgoing edges
    TaskStatus.SUCCEEDED: frozenset(),
    TaskStatus.FAILED: frozenset(),
    TaskStatus.CANCELLED: frozenset(),
}


@dataclass(frozen=True)
class ResearchTask:
    """An immutable Control-plane execution unit for one Research Action.

    ``created_at`` / ``updated_at`` are required (no silent default): the
    TaskManager always supplies a timezone-aware ``now`` for determinism.
    """

    task_id: TaskId
    project_id: ProjectId
    branch_id: BranchId
    action_id: ActionId
    action_type: ActionType
    target_object_id: ObjectId

    created_at: datetime
    updated_at: datetime

    status: TaskStatus = TaskStatus.PENDING
    dependencies: tuple[TaskId, ...] = ()
    blockers: tuple[str, ...] = ()
    created_by: ActorType = ActorType.SYSTEM
    metadata: Mapping[str, object] = field(default_factory=dict)

    def is_terminal(self) -> bool:
        return self.status in TERMINAL_TASK_STATUSES

    def with_status(self, new_status: TaskStatus, *, now: datetime) -> ResearchTask:
        """Return a NEW task with ``new_status`` after validating the edge."""
        _assert_task_transition(self.status, new_status)
        return replace(self, status=new_status, updated_at=now)


def _assert_task_transition(current: TaskStatus, target: TaskStatus) -> None:
    allowed = _LEGAL_TASK_TRANSITIONS.get(current, frozenset())
    if target not in allowed:
        raise InvariantViolationError(
            f"illegal task transition: {current.value} -> {target.value}"
        )


def initial_task_status(dependencies: tuple[TaskId, ...]) -> TaskStatus:
    """A task with no dependencies starts READY; with dependencies, PENDING."""
    return TaskStatus.READY if not dependencies else TaskStatus.PENDING


def dependencies_satisfied(
    statuses: Mapping[TaskId, TaskStatus], dependencies: tuple[TaskId, ...]
) -> bool:
    """All dependency tasks must be SUCCEEDED (STEP-003 §9)."""
    if not dependencies:
        return True
    return all(statuses.get(dep) is TaskStatus.SUCCEEDED for dep in dependencies)


__all__ = [
    "REASON_APPROVAL_REJECTED",
    "TERMINAL_TASK_STATUSES",
    "ResearchTask",
    "TaskStatus",
    "dependencies_satisfied",
    "initial_task_status",
]
