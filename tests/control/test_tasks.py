"""TASK-001..006 — ResearchTask lifecycle, dependencies, immutability, events.

These tests exercise the TaskManager directly (via the controller's wired
manager) using neutral, task-scoped ids separate from the transition
fixtures.
"""

from __future__ import annotations

import pytest

from packages.control.errors import InvariantViolationError
from packages.control.tasks import TaskStatus
from packages.domain.enums import ActorType  # noqa: F401  (kept for fixture parity)
from packages.domain.events import ControlEventType
from packages.domain.ids import ActionId, BranchId, ObjectId, ProjectId

# Task-scoped neutral ids (do not collide with transition-test fixtures).
PROJECT = ProjectId("proj-task")
BRANCH = BranchId("main")
OBJ = ObjectId("obj-task")


def _make_task(controller, *, action_id: str, dependencies=()):  # type: ignore[no-untyped-def]
    return controller.create_task(
        project_id=PROJECT,
        branch_id=BRANCH,
        action_id=ActionId(action_id),
        action_type="TEST_ADVANCE",
        target_object_id=OBJ,
        dependencies=dependencies,
    )


# TASK-001 ----------------------------------------------------------------
def test_task_001_no_dependency_starts_ready(controller) -> None:  # type: ignore[no-untyped-def]
    task = _make_task(controller, action_id="a")
    assert task.status is TaskStatus.READY


# TASK-002 ----------------------------------------------------------------
def test_task_002_unmet_dependency_starts_pending(controller) -> None:  # type: ignore[no-untyped-def]
    dep = _make_task(controller, action_id="dep")
    child = _make_task(controller, action_id="child", dependencies=(dep.task_id,))
    assert child.status is TaskStatus.PENDING


# TASK-003 ----------------------------------------------------------------
def test_task_003_refresh_readiness_after_deps_succeed(controller) -> None:  # type: ignore[no-untyped-def]
    dep = _make_task(controller, action_id="dep")
    child = _make_task(controller, action_id="child", dependencies=(dep.task_id,))
    assert child.status is TaskStatus.PENDING

    controller._tasks.mark_running(dep.task_id)
    controller._tasks.mark_succeeded(dep.task_id)

    refreshed = controller.refresh_readiness(child.task_id)
    assert refreshed.status is TaskStatus.READY


# TASK-004 ----------------------------------------------------------------
def test_task_004_illegal_transition_rejected(controller) -> None:  # type: ignore[no-untyped-def]
    task = _make_task(controller, action_id="a")
    # READY -> SUCCEEDED is illegal (must go through RUNNING)
    with pytest.raises(InvariantViolationError):
        controller._tasks.mark_succeeded(task.task_id)


# TASK-005 ----------------------------------------------------------------
def test_task_005_terminal_task_not_revived(controller) -> None:  # type: ignore[no-untyped-def]
    task = _make_task(controller, action_id="a")
    controller._tasks.mark_running(task.task_id)
    controller._tasks.mark_succeeded(task.task_id)
    # SUCCEEDED is terminal; any further transition must fail
    with pytest.raises(InvariantViolationError):
        controller._tasks.mark_running(task.task_id)
    with pytest.raises(InvariantViolationError):
        controller._tasks.mark_failed(task.task_id)


# TASK-006 ----------------------------------------------------------------
def test_task_006_state_change_emits_event(
    controller, event_sink  # type: ignore[no-untyped-def]
) -> None:
    task = _make_task(controller, action_id="a")
    controller._tasks.mark_running(task.task_id)

    types = [e.event_type for e in event_sink.list_for_project(PROJECT)]
    assert ControlEventType.TASK_CREATED in types
    assert ControlEventType.TASK_STATE_CHANGED in types
