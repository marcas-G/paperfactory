"""PendingTransition — a recoverable WAIT proposal (STEP-003 §13).

In STEP-002 a ``WAIT`` decision simply dropped the proposal. A
PendingTransition makes the WAIT *recoverable*: the proposal is captured as a
typed Control Object that can later be resumed once the blocker (approval,
external dependency, uncertainty) resolves.

Lifecycle (STEP-003 §14):
    PENDING   -> RESUMABLE | REJECTED | CANCELLED
    RESUMABLE -> COMMITTED | REJECTED | CANCELLED
    (terminal: COMMITTED / REJECTED / CANCELLED)
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import StrEnum

from ..domain.ids import ApprovalId, BranchId, ProjectId, ProposalId, TaskId
from .proposals import StateTransitionProposal


class PendingTransitionStatus(StrEnum):
    """Lifecycle of a PendingTransition (STEP-003 §14)."""

    PENDING = "PENDING"
    RESUMABLE = "RESUMABLE"
    COMMITTED = "COMMITTED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


TERMINAL_PENDING_STATUSES = frozenset(
    {
        PendingTransitionStatus.COMMITTED,
        PendingTransitionStatus.REJECTED,
        PendingTransitionStatus.CANCELLED,
    }
)

# Closed set of "why is this waiting" reasons.
WAITING_ON_APPROVAL = "APPROVAL"
WAITING_ON_EXTERNAL = "EXTERNAL_DEPENDENCY"
WAITING_ON_UNCERTAINTY = "UNCERTAINTY"
WAITING_ON_BLOCKED = "BLOCKED"


@dataclass(frozen=True)
class PendingTransition:
    """An immutable, recoverable WAIT proposal.

    ``transition_proposal`` is captured at WAIT time. ``approval_id`` is set
    when the wait is due to a missing approval; ``related_task_id`` links back
    to the controlling ResearchTask.
    """

    proposal_id: ProposalId
    project_id: ProjectId
    branch_id: BranchId

    transition_proposal: StateTransitionProposal
    reason: str
    waiting_on: str

    created_at: datetime
    updated_at: datetime

    status: PendingTransitionStatus = PendingTransitionStatus.PENDING
    related_task_id: TaskId | None = None
    approval_id: ApprovalId | None = None
    metadata: Mapping[str, object] = field(default_factory=dict)

    def is_terminal(self) -> bool:
        return self.status in TERMINAL_PENDING_STATUSES

    def with_status(
        self, new_status: PendingTransitionStatus, *, now: datetime
    ) -> PendingTransition:
        return replace(self, status=new_status, updated_at=now)

    def with_approval(self, approval_id: ApprovalId, *, now: datetime) -> PendingTransition:
        return replace(self, approval_id=approval_id, updated_at=now)


__all__ = [
    "TERMINAL_PENDING_STATUSES",
    "WAITING_ON_APPROVAL",
    "WAITING_ON_BLOCKED",
    "WAITING_ON_EXTERNAL",
    "WAITING_ON_UNCERTAINTY",
    "PendingTransition",
    "PendingTransitionStatus",
]
