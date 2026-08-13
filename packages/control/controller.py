"""ResearchController — a thin facade over the Control Plane.

It DELEGATES to:
    * ActionRegistry        (legal action lookup)
    * TransitionEngine      (decision + commit / WAIT materialization)
    * TaskManager           (task lifecycle)
    * ApprovalManager       (approval lifecycle)
and coordinates the stores (state / task / pending / approval) and the
control event sink. The Controller itself holds no domain logic; it wires
the pieces and keeps each step atomic at the logical level (STEP-003 §34).

Back-compat: ``commit_transition`` is retained for STEP-002 callers and
raises on WAIT/REJECT (old exception-style behavior). New code should use
``execute_transition`` which returns a unified ``TransitionExecutionResult``.
"""

from __future__ import annotations

from collections.abc import Callable

from ..domain.enums import ActorType, TransitionDecision
from ..domain.events import ControlEvent, ControlEventType, DomainEvent
from ..domain.ids import (
    ActionId,
    ApprovalId,
    BranchId,
    EventId,
    ObjectId,
    ProjectId,
    ProposalId,
    TaskId,
)
from ..domain.models import ResearchStateSnapshot
from .actions import (
    ResearchAction,
    ResearchActionDefinition,
    StateLabel,
)
from .approval_manager import ApprovalManager
from .approvals import ApprovalRequest, ApprovalStatus
from .clock import IdFactory, TimeProvider, default_id, default_now
from .engine import (
    TransitionEngine,
    TransitionExecutionResult,
    assert_action_legal,
)
from .errors import TransitionRejectedError
from .gates import GateResult
from .pending import PendingTransition, PendingTransitionStatus
from .proposals import StateTransitionProposal
from .registry import ActionRegistry
from .store import (
    ApprovalStore,
    ControlEventSink,
    PendingTransitionStore,
    TaskStore,
)
from .task_manager import TaskManager
from .tasks import ResearchTask, TaskStatus

# Approval states passed to the engine (kept here to avoid leaking engine
# internals to callers).
APPROVAL_NOT_REQUIRED = "NOT_REQUIRED"
APPROVAL_PENDING = "PENDING"
APPROVAL_APPROVED = "APPROVED"


class ResearchController:
    """Facade: registry + engine + managers + stores."""

    def __init__(
        self,
        registry: ActionRegistry,
        engine: TransitionEngine,
        task_manager: TaskManager,
        approval_manager: ApprovalManager,
        *,
        pending_store: PendingTransitionStore,
        task_store: TaskStore,
        approval_store: ApprovalStore,
        event_sink: ControlEventSink,
        proposal_id_factory: Callable[[], str] | None = None,
        id_factory: IdFactory | None = None,
        now: TimeProvider | None = None,
    ) -> None:
        self._registry = registry
        self._engine = engine
        self._tasks = task_manager
        self._approvals = approval_manager
        self._pending_store = pending_store
        self._task_store = task_store
        self._approval_store = approval_store
        self._sink = event_sink
        self._proposal_id_factory: Callable[[], str] = (
            proposal_id_factory or id_factory or default_id
        )
        self._id_factory: IdFactory = id_factory or default_id
        self._now: TimeProvider = now or default_now

    # ===================================================================
    # Read
    # ===================================================================
    def get_state(self, project_id: ProjectId, branch_id: BranchId) -> ResearchStateSnapshot:
        return self._engine.get_snapshot(project_id, branch_id)

    def list_legal_actions(
        self,
        state: ResearchStateSnapshot,
        target_object_id: ObjectId,
    ) -> list[ResearchActionDefinition]:
        current = state.object_states.get(target_object_id)
        if current is None:
            return []
        return [
            d for d in self._registry.list_all() if d.allows_source_state(current)
        ]

    # ===================================================================
    # Tasks
    # ===================================================================
    def create_task(
        self,
        *,
        project_id: ProjectId,
        branch_id: BranchId,
        action_id: ActionId,
        action_type: str,
        target_object_id: ObjectId,
        dependencies: tuple[TaskId, ...] = (),
        created_by: ActorType = ActorType.SYSTEM,
    ) -> ResearchTask:
        return self._tasks.create_task(
            project_id=project_id,
            branch_id=branch_id,
            action_id=action_id,
            action_type=action_type,
            target_object_id=target_object_id,
            dependencies=dependencies,
            created_by=created_by,
        )

    def get_task(self, task_id: TaskId) -> ResearchTask:
        return self._tasks.get(task_id)

    def refresh_readiness(self, task_id: TaskId) -> ResearchTask:
        return self._tasks.refresh_readiness(task_id)

    # ===================================================================
    # Propose + execute (unified result)
    # ===================================================================
    def propose_transition(
        self,
        action: ResearchAction,
        definition: ResearchActionDefinition,
        to_state: StateLabel,
        gate_results: tuple[GateResult, ...] = (),
    ) -> StateTransitionProposal:
        state = self.get_state(action.project_id, action.branch_id)
        assert_action_legal(state, definition, action)
        from_state = state.object_states[action.target_object_id]
        return StateTransitionProposal(
            proposal_id=ProposalId(self._proposal_id_factory()),
            project_id=action.project_id,
            branch_id=action.branch_id,
            target_object_id=action.target_object_id,
            from_state=from_state,
            to_state=to_state,
            action_id=action.action_id,
            gate_results=gate_results,
            expected_revision=state.revision,
        )

    def execute_transition(
        self,
        proposal: StateTransitionProposal,
        definition: ResearchActionDefinition,
        *,
        actor_type: ActorType,
        task_id: TaskId | None = None,
        approval_state: str = APPROVAL_NOT_REQUIRED,
    ) -> TransitionExecutionResult:
        """Execute a proposal end-to-end and coordinate side effects.

        On COMMIT: optionally advance the linked task RUNNING -> SUCCEEDED.
        On WAIT:   persist the PendingTransition; if waiting on approval and a
                   task is linked, request an ApprovalRequest and move the
                   task RUNNING -> WAITING.
        On REJECT: optionally advance the task RUNNING -> FAILED.

        Returns the unified ``TransitionExecutionResult`` (never raises for a
        normal WAIT/REJECT — only for illegal action / stale / invariant).
        """
        result = self._engine.execute(
            proposal,
            definition=definition,
            actor_type=actor_type,
            approval_state=approval_state,
            related_task_id=task_id,
            now=self._now,
            id_factory=self._id_factory,
        )

        if result.decision is TransitionDecision.COMMIT:
            self._emit_state_event(result)
            if task_id is not None:
                self._advance_task_on_commit(task_id)
        elif result.decision is TransitionDecision.WAIT:
            pending = result.pending_transition
            assert pending is not None
            self._pending_store.save(pending)
            self._emit(
                ControlEventType.TRANSITION_WAITING,
                str(pending.proposal_id),
                proposal.project_id,
                proposal.branch_id,
                actor_type,
                {"waiting_on": pending.waiting_on, "task_id": _str(task_id)},
            )
            if task_id is not None:
                # Any WAIT moves the task RUNNING -> WAITING (STEP-003 §26).
                self._try_mark_task(task_id, TaskStatus.WAITING)
            if pending.waiting_on == "APPROVAL" and task_id is not None:
                self._request_approval_for(pending, definition, task_id, actor_type)
        elif result.decision is TransitionDecision.REJECT:
            if task_id is not None:
                self._try_mark_task(task_id, TaskStatus.FAILED)

        return result

    def list_pending_transitions(
        self, project_id: ProjectId, branch_id: BranchId
    ) -> list[PendingTransition]:
        return self._pending_store.list_pending(project_id, branch_id)

    # ===================================================================
    # Approval lifecycle
    # ===================================================================
    def request_approval(
        self,
        *,
        pending: PendingTransition,
        definition: ResearchActionDefinition,
        task_id: TaskId,
        requested_by: ActorType,
        impact: str = "",
        reason: str = "",
    ) -> ApprovalRequest:
        return self._request_approval_for(
            pending, definition, task_id, requested_by, impact=impact, reason=reason
        )

    def approve(
        self, approval_id: ApprovalId, *, resolved_by: ActorType, note: str = ""
    ) -> ApprovalRequest:
        approval = self._approvals.approve(
            approval_id, resolved_by=resolved_by, note=note
        )
        self._on_approval_resolved(approval, approved=True)
        return approval

    def reject(
        self, approval_id: ApprovalId, *, resolved_by: ActorType, note: str = ""
    ) -> ApprovalRequest:
        approval = self._approvals.reject(
            approval_id, resolved_by=resolved_by, note=note
        )
        self._on_approval_resolved(approval, approved=False)
        return approval

    def resume_pending_transition(
        self,
        pending: PendingTransition,
        *,
        definition: ResearchActionDefinition,
        actor_type: ActorType,
        approval_state: str = APPROVAL_APPROVED,
    ) -> TransitionExecutionResult:
        """Resume a pending transition, re-validating against CURRENT state.

        MUST re-check revision (STEP-003 §24): the engine re-reads the store
        during execute, so a stale expected_revision surfaces as
        ``StaleStateError`` and nothing is committed.
        """
        result = self._engine.resume(
            pending,
            definition=definition,
            actor_type=actor_type,
            approval_state=approval_state,
            now=self._now,
            id_factory=self._id_factory,
        )

        if result.decision is TransitionDecision.COMMIT:
            self._emit_state_event(result)
            self._advance_pending(pending, PendingTransitionStatus.COMMITTED)
            if pending.related_task_id is not None:
                self._advance_task_on_commit(pending.related_task_id)
        elif result.decision is TransitionDecision.WAIT:
            # Still blocked (e.g. other gate uncertain) — keep waiting.
            pass
        elif result.decision is TransitionDecision.REJECT:
            self._advance_pending(pending, PendingTransitionStatus.REJECTED)
            if pending.related_task_id is not None:
                self._try_mark_task(pending.related_task_id, TaskStatus.FAILED)

        self._emit(
            ControlEventType.TRANSITION_RESUMED,
            str(pending.proposal_id),
            pending.project_id,
            pending.branch_id,
            actor_type,
            {"decision": result.decision.value},
        )
        return result

    # ===================================================================
    # Back-compat: STEP-002 commit_transition (raises on WAIT/REJECT)
    # ===================================================================
    def commit_transition(
        self,
        proposal: StateTransitionProposal,
        actor_type: ActorType,
        definition: ResearchActionDefinition,
        *,
        now: TimeProvider | None = None,
        id_factory: IdFactory | None = None,
    ) -> tuple[ResearchStateSnapshot, DomainEvent, TransitionDecision]:
        """Back-compat COMMIT-only path (raises on WAIT/REJECT).

        ``definition`` is required: the engine needs it to evaluate the
        approval requirement. New code should prefer ``execute_transition``
        which returns a unified result instead of raising.
        """
        result = self._engine.execute(
            proposal,
            definition=definition,
            actor_type=actor_type,
            now=now or self._now,
            id_factory=id_factory or self._id_factory,
        )
        if result.decision is TransitionDecision.WAIT:
            raise TransitionRejectedError("transition is WAITING; not committed")
        if result.decision is TransitionDecision.REJECT:
            raise TransitionRejectedError("transition REJECTED by gates")
        assert result.snapshot is not None and result.event is not None
        return result.snapshot, result.event, TransitionDecision.COMMIT

    # ===================================================================
    # Internals
    # ===================================================================
    def _request_approval_for(
        self,
        pending: PendingTransition,
        definition: ResearchActionDefinition,
        task_id: TaskId,
        requested_by: ActorType,
        *,
        impact: str = "",
        reason: str = "",
    ) -> ApprovalRequest:
        approval = self._approvals.request(
            project_id=pending.project_id,
            branch_id=pending.branch_id,
            task_id=task_id,
            proposal_id=pending.proposal_id,
            requested_action=definition.action_type,
            reason=reason or pending.reason,
            impact=impact or definition.action_type,
            side_effect_level=definition.side_effect_level,
            requested_by=requested_by,
        )
        # link approval back to the pending transition
        linked = pending.with_approval(approval.approval_id, now=self._now())
        self._pending_store.update(linked)
        return approval

    def _on_approval_resolved(self, approval: ApprovalRequest, *, approved: bool) -> None:
        status = approval.status
        if status is ApprovalStatus.APPROVED:
            # mark the linked pending transition RESUMABLE
            try:
                pending = self._pending_store.get(approval.proposal_id)
            except KeyError:
                return
            if pending.status is PendingTransitionStatus.PENDING:
                updated = pending.with_status(
                    PendingTransitionStatus.RESUMABLE, now=self._now()
                )
                self._pending_store.update(updated)
        elif status is ApprovalStatus.REJECTED:
            try:
                pending = self._pending_store.get(approval.proposal_id)
            except KeyError:
                pending = None
            if pending is not None and not pending.is_terminal():
                updated = pending.with_status(
                    PendingTransitionStatus.REJECTED, now=self._now()
                )
                self._pending_store.update(updated)
            # FAIL the linked task (STEP-003 §25): WAITING -> FAILED
            try:
                task = self._task_store.get(approval.task_id)
            except KeyError:
                return
            if task.status is TaskStatus.WAITING:
                self._tasks.mark_failed(approval.task_id)

    def _advance_task_on_commit(self, task_id: TaskId) -> None:
        try:
            task = self._task_store.get(task_id)
        except KeyError:
            return
        if task.is_terminal():
            return
        if task.status in (TaskStatus.RUNNING, TaskStatus.WAITING):
            self._tasks.mark_succeeded(task_id)

    def _try_mark_task(self, task_id: TaskId, status: TaskStatus) -> None:
        try:
            task = self._task_store.get(task_id)
        except KeyError:
            return
        if task.status is status or task.is_terminal():
            return
        if status is TaskStatus.WAITING:
            self._tasks.mark_waiting(task_id)
        elif status is TaskStatus.FAILED:
            self._tasks.mark_failed(task_id)

    def _advance_pending(
        self, pending: PendingTransition, status: PendingTransitionStatus
    ) -> None:
        if pending.status is status:
            return
        updated = pending.with_status(status, now=self._now())
        self._pending_store.update(updated)

    def _emit_state_event(self, result: TransitionExecutionResult) -> None:
        event = result.event
        assert event is not None
        self._emit(
            ControlEventType.OBJECT_STATE_CHANGED,
            str(event.event_id),
            event.project_id,
            event.branch_id,
            event.actor_type,
            {
                "aggregate_id": str(event.aggregate_id),
                "previous_revision": event.previous_revision,
                "new_revision": event.new_revision,
            },
        )

    def _emit(
        self,
        event_type: ControlEventType,
        aggregate_id: str,
        project_id: ProjectId,
        branch_id: BranchId | None,
        actor_type: ActorType,
        payload: dict[str, object],
    ) -> None:
        self._sink.append(
            ControlEvent(
                event_id=EventId(self._id_factory()),
                project_id=project_id,
                branch_id=branch_id,
                event_type=event_type,
                aggregate_id=aggregate_id,
                actor_type=actor_type,
                created_at=self._now(),
                payload=payload,
            )
        )


def _str(value: object) -> str | None:
    return None if value is None else str(value)


__all__ = [
    "APPROVAL_APPROVED",
    "APPROVAL_NOT_REQUIRED",
    "APPROVAL_PENDING",
    "ResearchController",
]
