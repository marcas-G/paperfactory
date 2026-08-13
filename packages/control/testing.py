"""InMemoryStateStore — a test / dev StateStore adapter.

This is NOT a Domain object and NOT a production persistence adapter. It
exists so the Control Kernel can be exercised end-to-end without a database
(STEP-002 §19, ADR-003). Production code MUST NOT depend on it; only tests
and dev harnesses import from here.

``seed_snapshot`` is a test/dev helper and intentionally NOT part of the
``StateStore`` Protocol — production control APIs have no seeding path.
"""

from __future__ import annotations

from copy import deepcopy

from ..domain.events import ControlEvent, DomainEvent
from ..domain.ids import ApprovalId, BranchId, ProjectId, ProposalId, TaskId
from ..domain.models import ResearchStateSnapshot
from .approvals import ApprovalRequest
from .errors import InvariantViolationError, StaleStateError
from .pending import PendingTransition
from .proposals import StateTransitionProposal
from .tasks import ResearchTask, TaskStatus


class InMemoryStateStore:
    """In-memory implementation of the StateStore port."""

    def __init__(self) -> None:
        # keyed by (project_id, branch_id)
        self._snapshots: dict[tuple[ProjectId, BranchId], ResearchStateSnapshot] = {}
        self._events: list[DomainEvent] = []

    # --- test/dev helpers (NOT on the StateStore Protocol) --------------
    def seed_snapshot(self, snapshot: ResearchStateSnapshot) -> None:
        """Seed an initial snapshot. Test/dev only — no production path."""
        key = (snapshot.project_id, snapshot.branch_id)
        if key in self._snapshots:
            raise InvariantViolationError(
                f"snapshot already seeded for {snapshot.project_id}/{snapshot.branch_id}"
            )
        self._snapshots[key] = snapshot

    def events(self) -> list[DomainEvent]:
        """Return a copy of all committed events (test assertion helper)."""
        return list(self._events)

    # --- StateStore Protocol --------------------------------------------
    def get_snapshot(self, project_id: ProjectId, branch_id: BranchId) -> ResearchStateSnapshot:
        key = (project_id, branch_id)
        if key not in self._snapshots:
            # Empty branch — revision 0, no objects.
            return ResearchStateSnapshot(
                project_id=project_id, branch_id=branch_id, revision=0
            )
        return self._snapshots[key]

    def commit_transition(
        self,
        proposal: StateTransitionProposal,
        event: DomainEvent,
    ) -> ResearchStateSnapshot:
        current = self.get_snapshot(proposal.project_id, proposal.branch_id)

        # 1. optimistic-concurrency guard
        if proposal.expected_revision != current.revision:
            raise StaleStateError(
                f"stale revision: expected={proposal.expected_revision} "
                f"actual={current.revision}"
            )

        # 2. from_state invariant
        actual_state = current.object_states.get(proposal.target_object_id)
        if actual_state != proposal.from_state:
            raise InvariantViolationError(
                f"from_state mismatch: proposal={proposal.from_state!r} "
                f"actual={actual_state!r}"
            )

        # 3. build new immutable snapshot: copy states, update target, +1 rev
        new_states = dict(current.object_states)
        new_states[proposal.target_object_id] = proposal.to_state
        new_snapshot = ResearchStateSnapshot(
            project_id=current.project_id,
            branch_id=current.branch_id,
            revision=current.revision + 1,
            object_states=new_states,
            metadata=deepcopy(dict(current.metadata)),
        )

        # 4. commit atomically (dict update + event append are the "tx")
        key = (current.project_id, current.branch_id)
        self._snapshots[key] = new_snapshot
        self._events.append(event)

        return new_snapshot


__all__ = [
    "InMemoryApprovalStore",
    "InMemoryControlEventSink",
    "InMemoryPendingTransitionStore",
    "InMemoryStateStore",
    "InMemoryTaskStore",
]


# =========================================================================
# TaskStore
# =========================================================================
class InMemoryTaskStore:
    """In-memory TaskStore adapter (test/dev only)."""

    def __init__(self) -> None:
        self._tasks: dict[TaskId, ResearchTask] = {}

    def save(self, task: ResearchTask) -> None:
        # Upsert semantics: the same task_id may be overwritten with a new
        # immutable version (state evolution). Duplicate-id detection for
        # *creation* is enforced by TaskManager.create_task, not here.
        self._tasks[task.task_id] = task

    def get(self, task_id: TaskId) -> ResearchTask:
        return self._tasks[task_id]

    def list_for_project(
        self, project_id: ProjectId, branch_id: BranchId
    ) -> list[ResearchTask]:
        return [
            t
            for t in self._tasks.values()
            if t.project_id == project_id and t.branch_id == branch_id
        ]

    def get_status(self, task_id: TaskId) -> TaskStatus:
        return self._tasks[task_id].status


# =========================================================================
# PendingTransitionStore
# =========================================================================
class InMemoryPendingTransitionStore:
    """In-memory PendingTransitionStore adapter (test/dev only)."""

    def __init__(self) -> None:
        self._records: dict[ProposalId, PendingTransition] = {}

    def save(self, pending: PendingTransition) -> None:
        self._records[pending.proposal_id] = pending

    def get(self, proposal_id: ProposalId) -> PendingTransition:
        return self._records[proposal_id]

    def list_pending(
        self, project_id: ProjectId, branch_id: BranchId
    ) -> list[PendingTransition]:
        return [
            p
            for p in self._records.values()
            if p.project_id == project_id
            and p.branch_id == branch_id
            and not p.is_terminal()
        ]

    def update(self, pending: PendingTransition) -> None:
        if pending.proposal_id not in self._records:
            raise InvariantViolationError(
                f"cannot update unknown pending transition: {pending.proposal_id}"
            )
        self._records[pending.proposal_id] = pending


# =========================================================================
# ApprovalStore
# =========================================================================
class InMemoryApprovalStore:
    """In-memory ApprovalStore adapter (test/dev only)."""

    def __init__(self) -> None:
        self._records: dict[ApprovalId, ApprovalRequest] = {}

    def save(self, approval: ApprovalRequest) -> None:
        self._records[approval.approval_id] = approval

    def get(self, approval_id: ApprovalId) -> ApprovalRequest:
        return self._records[approval_id]

    def list_pending(
        self, project_id: ProjectId, branch_id: BranchId
    ) -> list[ApprovalRequest]:
        return [
            a
            for a in self._records.values()
            if a.project_id == project_id
            and a.branch_id == branch_id
            and a.status.value == "PENDING"
        ]

    def update(self, approval: ApprovalRequest) -> None:
        if approval.approval_id not in self._records:
            raise InvariantViolationError(
                f"cannot update unknown approval: {approval.approval_id}"
            )
        self._records[approval.approval_id] = approval


# =========================================================================
# ControlEventSink
# =========================================================================
class InMemoryControlEventSink:
    """In-memory ControlEventSink adapter (test/dev only).

    A single append-only outlet for all ControlEvents so tests can assert on
    the full event stream per project.
    """

    def __init__(self) -> None:
        self._events: list[ControlEvent] = []

    def append(self, event: ControlEvent) -> None:
        self._events.append(event)

    def list_for_project(self, project_id: ProjectId) -> list[ControlEvent]:
        return [e for e in self._events if e.project_id == project_id]

    def all_events(self) -> list[ControlEvent]:
        """Test helper: return every event regardless of project."""
        return list(self._events)
