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
from .branch_manager import BranchManager
from .branches import ACTIONABLE_BRANCH_STATUSES, ResearchBranch
from .clock import IdFactory, TimeProvider, default_id, default_now
from .engine import (
    TransitionEngine,
    TransitionExecutionResult,
    assert_action_legal,
)
from .errors import (
    BranchScopeMismatchError,
    CrossBranchDependencyError,
    IllegalActionError,
    TransitionRejectedError,
)
from .gates import GateResult
from .merges import BranchMergeProposal
from .pending import PendingTransition, PendingTransitionStatus
from .proposals import StateTransitionProposal
from .registry import ActionRegistry
from .store import (
    ApprovalStore,
    BranchStore,
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
        branch_manager: BranchManager,
        *,
        pending_store: PendingTransitionStore,
        task_store: TaskStore,
        approval_store: ApprovalStore,
        branch_store: BranchStore,
        event_sink: ControlEventSink,
        proposal_id_factory: Callable[[], str] | None = None,
        id_factory: IdFactory | None = None,
        now: TimeProvider | None = None,
    ) -> None:
        self._registry = registry
        self._engine = engine
        self._tasks = task_manager
        self._approvals = approval_manager
        self._branches = branch_manager
        self._pending_store = pending_store
        self._task_store = task_store
        self._approval_store = approval_store
        self._branch_store = branch_store
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
        """Ordinary research actions legal for ``target_object_id`` in the
        current state. Returns [] when the branch is not ACTIVE — a PAUSED or
        terminal branch may not start ordinary research actions (STEP-004
        §16). Branch-control actions are handled via BranchManager methods
        (their own audit path)."""
        try:
            branch = self._branch_store.get(state.branch_id)
        except KeyError:
            return []
        if branch.status not in ACTIONABLE_BRANCH_STATUSES:
            return []
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
        # Task dependencies MUST stay within the same branch (STEP-004 §20).
        for dep_id in dependencies:
            dep = self._task_store.get(dep_id)
            if dep.branch_id != branch_id or dep.project_id != project_id:
                raise CrossBranchDependencyError(
                    f"task dependency {dep_id} belongs to a different branch "
                    f"({dep.project_id}/{dep.branch_id})"
                )
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
    # Branches (STEP-004) — delegate to BranchManager
    # ===================================================================
    def create_main_branch(
        self,
        *,
        project_id: ProjectId,
        branch_id: BranchId,
        name: str = "main",
        purpose: str = "",
        created_by: ActorType = ActorType.SYSTEM,
        initial_snapshot: ResearchStateSnapshot | None = None,
    ) -> ResearchBranch:
        return self._branches.create_main_branch(
            project_id=project_id,
            branch_id=branch_id,
            name=name,
            purpose=purpose,
            created_by=created_by,
            initial_snapshot=initial_snapshot,
        )

    def fork_branch(
        self,
        *,
        source_branch_id: BranchId,
        new_branch_id: BranchId,
        name: str,
        purpose: str = "",
        created_by: ActorType = ActorType.SYSTEM,
    ) -> ResearchBranch:
        return self._branches.fork_branch(
            source_branch_id=source_branch_id,
            new_branch_id=new_branch_id,
            name=name,
            purpose=purpose,
            created_by=created_by,
        )

    def get_branch(self, branch_id: BranchId) -> ResearchBranch:
        return self._branches.get_branch(branch_id)

    def list_branches(self, project_id: ProjectId) -> list[ResearchBranch]:
        return self._branches.list_branches(project_id)

    def pause_branch(
        self, branch_id: BranchId, *, actor: ActorType = ActorType.SYSTEM
    ) -> ResearchBranch:
        return self._branches.pause_branch(branch_id, actor=actor)

    def resume_branch(
        self, branch_id: BranchId, *, actor: ActorType = ActorType.SYSTEM
    ) -> ResearchBranch:
        return self._branches.resume_branch(branch_id, actor=actor)

    def archive_branch(
        self, branch_id: BranchId, *, actor: ActorType = ActorType.SYSTEM
    ) -> ResearchBranch:
        return self._branches.archive_branch(branch_id, actor=actor)

    def reject_branch(
        self, branch_id: BranchId, *, actor: ActorType = ActorType.SYSTEM
    ) -> ResearchBranch:
        return self._branches.reject_branch(branch_id, actor=actor)

    def prepare_branch_merge(
        self,
        *,
        source_branch_id: BranchId,
        target_branch_id: BranchId,
        actor: ActorType = ActorType.SYSTEM,
    ) -> BranchMergeProposal:
        return self._branches.prepare_merge(
            source_branch_id=source_branch_id,
            target_branch_id=target_branch_id,
            actor=actor,
        )

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
        self._assert_branch_actionable(proposal.project_id, proposal.branch_id)
        if task_id is not None:
            self._assert_task_in_branch(task_id, proposal.project_id, proposal.branch_id)

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
        ``StaleStateError`` and nothing is committed. The branch MUST be
        ACTIVE — a PAUSED/terminal branch cannot commit a pending transition
        (STEP-004 §21/§35).
        """
        self._assert_branch_actionable(pending.project_id, pending.branch_id)
        if pending.related_task_id is not None:
            self._assert_task_in_branch(
                pending.related_task_id, pending.project_id, pending.branch_id
            )

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
    # Branch-aware guards (STEP-004 §16/§20/§21/§22)
    # ===================================================================
    def _assert_branch_actionable(
        self, project_id: ProjectId, branch_id: BranchId
    ) -> None:
        """Ordinary research actions/transitions require an ACTIVE branch
        (STEP-004 §16). PAUSED/terminal branches raise IllegalActionError."""
        try:
            branch = self._branch_store.get(branch_id)
        except KeyError:
            raise IllegalActionError(f"branch not found: {branch_id}") from None
        if branch.project_id != project_id:
            raise BranchScopeMismatchError(
                f"branch {branch_id} belongs to project {branch.project_id}, "
                f"not {project_id}"
            )
        if branch.status not in ACTIONABLE_BRANCH_STATUSES:
            raise IllegalActionError(
                f"branch {branch_id} is {branch.status.value}; "
                f"ordinary actions require an ACTIVE branch"
            )

    def _assert_task_in_branch(
        self, task_id: TaskId, project_id: ProjectId, branch_id: BranchId
    ) -> None:
        try:
            task = self._task_store.get(task_id)
        except KeyError:
            raise IllegalActionError(f"task not found: {task_id}") from None
        if task.project_id != project_id or task.branch_id != branch_id:
            raise BranchScopeMismatchError(
                f"task {task_id} belongs to {task.project_id}/{task.branch_id}, "
                f"not {project_id}/{branch_id}"
            )

    def assert_approval_branch_matches(
        self, approval_id: ApprovalId, project_id: ProjectId, branch_id: BranchId
    ) -> None:
        """Public guard: an approval must belong to the same branch as the
        pending transition it is being used to resume (STEP-004 §22)."""
        approval = self._approval_store.get(approval_id)
        if approval.project_id != project_id or approval.branch_id != branch_id:
            raise BranchScopeMismatchError(
                f"approval {approval_id} belongs to "
                f"{approval.project_id}/{approval.branch_id}, "
                f"not {project_id}/{branch_id}"
            )

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
