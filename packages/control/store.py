"""StateStore port — the Persistence adapter interface (Ports & Adapters).

The Control Plane depends on this ``Protocol``, never on a concrete
persistence implementation (RULE-07). ``commit_transition`` MUST be atomic
and MUST validate ``expected_revision`` (optimistic concurrency).

A real PostgreSQL adapter implements this later; an in-memory adapter lives
in ``packages/control/testing.py`` for tests/dev (STEP-002 §19). Both
satisfy the same port, so swapping the SoT is an adapter change, not a
rewrite.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..domain.events import ControlEvent, DomainEvent
from ..domain.ids import ApprovalId, BranchId, MergeId, ProjectId, ProposalId, TaskId
from ..domain.models import ResearchStateSnapshot
from .approvals import ApprovalRequest
from .branches import BranchForkPoint, ResearchBranch
from .merges import BranchMergeProposal
from .pending import PendingTransition
from .proposals import StateTransitionProposal
from .tasks import ResearchTask, TaskStatus


@runtime_checkable
class StateStore(Protocol):
    """Abstract, atomic store of Research State snapshots."""

    def get_snapshot(self, project_id: ProjectId, branch_id: BranchId) -> ResearchStateSnapshot:
        """Return the current snapshot for (project, branch).

        Implementations decide how to represent "not found" (e.g. empty
        snapshot at revision 0, or raise). The in-memory adapter seeds an
        initial snapshot.
        """
        ...

    def initialize_branch_snapshot(self, snapshot: ResearchStateSnapshot) -> None:
        """Seed the initial snapshot for a NEW branch (STEP-004 §14).

        This is the formal port contract for establishing a branch's state —
        used at main-branch creation and at fork time. It MUST reject a
        snapshot for an already-initialized (project, branch). It is NOT a
        production state-mutation shortcut: it only sets the starting point
        for a branch that has no state yet.
        """
        ...

    def commit_transition(
        self,
        proposal: StateTransitionProposal,
        event: DomainEvent,
    ) -> ResearchStateSnapshot:
        """Atomically apply a committed transition.

        Implementations MUST:
            * verify ``proposal.expected_revision`` == current revision, else
              raise ``StaleStateError``;
            * verify ``proposal.from_state`` == current object state, else
              raise ``InvariantViolationError``;
            * increment revision by exactly 1;
            * update the target object's state;
            * record ``event``;
            * return a NEW immutable snapshot.
        """
        ...


@runtime_checkable
class TaskStore(Protocol):
    """Abstract store of ResearchTask snapshots (STEP-003 §10)."""

    def save(self, task: ResearchTask) -> None:
        """Persist an immutable task snapshot. Must NOT silently overwrite a
        different task that happens to share a TaskId (raise instead)."""
        ...

    def get(self, task_id: TaskId) -> ResearchTask:
        """Return the task or raise ``KeyError``."""
        ...

    def list_for_project(
        self, project_id: ProjectId, branch_id: BranchId
    ) -> list[ResearchTask]:
        """Return all tasks in a (project, branch)."""
        ...

    def get_status(self, task_id: TaskId) -> TaskStatus:
        """Return the current status of a task."""
        ...


@runtime_checkable
class PendingTransitionStore(Protocol):
    """Abstract store of PendingTransition records (STEP-003 §15)."""

    def save(self, pending: PendingTransition) -> None:
        ...

    def get(self, proposal_id: ProposalId) -> PendingTransition:
        ...

    def list_pending(
        self, project_id: ProjectId, branch_id: BranchId
    ) -> list[PendingTransition]:
        """Return pending transitions still awaiting resolution."""
        ...

    def update(self, pending: PendingTransition) -> None:
        """Replace a pending transition with a new immutable version."""
        ...


@runtime_checkable
class ApprovalStore(Protocol):
    """Abstract store of ApprovalRequest records (STEP-003 §20)."""

    def save(self, approval: ApprovalRequest) -> None:
        ...

    def get(self, approval_id: ApprovalId) -> ApprovalRequest:
        ...

    def list_pending(
        self, project_id: ProjectId, branch_id: BranchId
    ) -> list[ApprovalRequest]:
        ...

    def update(self, approval: ApprovalRequest) -> None:
        ...


@runtime_checkable
class ControlEventSink(Protocol):
    """Single append-only outlet for all control events (STEP-003 §33).

    Keeps control events from scattering across stores. Deliberately NOT an
    event-sourcing framework.
    """

    def append(self, event: ControlEvent) -> None:
        ...

    def list_for_project(self, project_id: ProjectId) -> list[ControlEvent]:
        ...


@runtime_checkable
class BranchStore(Protocol):
    """Abstract store of ResearchBranch records (STEP-004 §9)."""

    def save_new(self, branch: ResearchBranch) -> None:
        """Strict create: reject (DuplicateBranchError) if the BranchId already
        exists. Used for main-branch creation and fork (BR-INV-01)."""
        ...

    def save(self, branch: ResearchBranch) -> None:
        """Upsert: persist a new immutable version of an existing branch
        (status evolution)."""
        ...

    def get(self, branch_id: BranchId) -> ResearchBranch:
        """Return the branch or raise ``BranchNotFoundError``."""
        ...

    def list_for_project(self, project_id: ProjectId) -> list[ResearchBranch]:
        ...

    def exists(self, branch_id: BranchId) -> bool:
        ...

    def get_main(self, project_id: ProjectId) -> ResearchBranch | None:
        """Return the main branch for a project, or None if none exists."""
        ...


@runtime_checkable
class ForkPointStore(Protocol):
    """Abstract store of BranchForkPoint base snapshots (STEP-004 §27).

    Needed for three-way merge comparison since the in-memory StateStore does
    not keep historical revisions.
    """

    def save(self, fork_point: BranchForkPoint) -> None:
        ...

    def get(self, branch_id: BranchId) -> BranchForkPoint:
        """Return the fork point for a branch or raise ``KeyError``."""
        ...


@runtime_checkable
class MergeStore(Protocol):
    """Abstract store of BranchMergeProposal records (STEP-004 §24)."""

    def save(self, proposal: BranchMergeProposal) -> None:
        ...

    def get(self, merge_id: MergeId) -> BranchMergeProposal:
        ...


__all__ = [
    "ApprovalStore",
    "BranchStore",
    "ControlEventSink",
    "ForkPointStore",
    "MergeStore",
    "PendingTransitionStore",
    "StateStore",
    "TaskStore",
]
