"""TaskManager — deterministic ResearchTask lifecycle orchestrator.

Owns create / status-transition / readiness-refresh for tasks. It NEVER calls
an LLM and runs no scheduler (STEP-003 §28). All status changes go through
``ResearchTask.with_status`` (which enforces legal edges) and emit a
ControlEvent.
"""

from __future__ import annotations

from ..domain.enums import ActorType
from ..domain.events import ControlEvent, ControlEventType
from ..domain.ids import (
    ActionId,
    BranchId,
    EventId,
    ObjectId,
    ProjectId,
    TaskId,
)
from .actions import ActionType
from .clock import IdFactory, TimeProvider
from .errors import InvariantViolationError
from .store import ControlEventSink, TaskStore
from .tasks import (
    ResearchTask,
    TaskStatus,
    dependencies_satisfied,
    initial_task_status,
)


class TaskManager:
    """Deterministic Task lifecycle controller."""

    def __init__(
        self,
        store: TaskStore,
        event_sink: ControlEventSink,
        *,
        id_factory: IdFactory,
        now: TimeProvider,
    ) -> None:
        self._store = store
        self._sink = event_sink
        self._id_factory = id_factory
        self._now = now

    # --- create ---------------------------------------------------------
    def create_task(
        self,
        *,
        project_id: ProjectId,
        branch_id: BranchId,
        action_id: ActionId,
        action_type: ActionType,
        target_object_id: ObjectId,
        dependencies: tuple[TaskId, ...] = (),
        created_by: ActorType = ActorType.SYSTEM,
    ) -> ResearchTask:
        ts = self._now()
        task_id = TaskId(self._id_factory())
        # Defensive duplicate-id guard (STEP-003 §11): creation must not
        # silently overwrite an existing task. (id collisions are not expected
        # with uuid/seq factories, but the contract is enforced explicitly.)
        try:
            self._store.get(task_id)
            raise InvariantViolationError(f"task already exists: {task_id}")
        except KeyError:
            pass

        task = ResearchTask(
            task_id=task_id,
            project_id=project_id,
            branch_id=branch_id,
            action_id=action_id,
            action_type=action_type,
            target_object_id=target_object_id,
            created_at=ts,
            updated_at=ts,
            status=initial_task_status(dependencies),
            dependencies=dependencies,
            created_by=created_by,
        )
        self._store.save(task)
        self._emit(task, ControlEventType.TASK_CREATED)
        return task

    # --- status transitions --------------------------------------------
    def mark_running(self, task_id: TaskId) -> ResearchTask:
        return self._transition(task_id, TaskStatus.RUNNING)

    def mark_waiting(self, task_id: TaskId) -> ResearchTask:
        return self._transition(task_id, TaskStatus.WAITING)

    def mark_succeeded(self, task_id: TaskId) -> ResearchTask:
        return self._transition(task_id, TaskStatus.SUCCEEDED)

    def mark_failed(self, task_id: TaskId) -> ResearchTask:
        return self._transition(task_id, TaskStatus.FAILED)

    def cancel(self, task_id: TaskId) -> ResearchTask:
        return self._transition(task_id, TaskStatus.CANCELLED)

    def mark_ready(self, task_id: TaskId) -> ResearchTask:
        return self._transition(task_id, TaskStatus.READY)

    # --- readiness ------------------------------------------------------
    def refresh_readiness(self, task_id: TaskId) -> ResearchTask:
        """Move a PENDING task to READY once all dependencies SUCCEEDED."""
        task = self._store.get(task_id)
        if task.status is not TaskStatus.PENDING:
            return task
        dep_statuses = {
            dep: self._store.get_status(dep) for dep in task.dependencies
        }
        if dependencies_satisfied(dep_statuses, task.dependencies):
            return self._transition(task_id, TaskStatus.READY)
        return task

    def get(self, task_id: TaskId) -> ResearchTask:
        return self._store.get(task_id)

    # --- internals ------------------------------------------------------
    def _transition(self, task_id: TaskId, target: TaskStatus) -> ResearchTask:
        task = self._store.get(task_id)
        updated = task.with_status(target, now=self._now())
        self._store.save(updated)
        self._emit(updated, ControlEventType.TASK_STATE_CHANGED)
        return updated

    def _emit(self, task: ResearchTask, event_type: ControlEventType) -> None:
        self._sink.append(
            ControlEvent(
                event_id=EventId(self._id_factory()),
                project_id=task.project_id,
                branch_id=task.branch_id,
                event_type=event_type,
                aggregate_id=str(task.task_id),
                actor_type=task.created_by,
                created_at=self._now(),
                payload={
                    "task_id": str(task.task_id),
                    "action_type": task.action_type,
                    "status": task.status.value,
                },
            )
        )


__all__ = ["TaskManager"]
