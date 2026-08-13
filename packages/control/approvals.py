"""ApprovalRequest — Human-in-the-loop decision lifecycle (STEP-003 §18).

An ApprovalRequest is a formal Control Object, NOT a UI popup: it is a
versioned, auditable record that an Action with ``requires_approval=True``
is waiting for an explicit human (or system) decision.

Lifecycle (STEP-003 §19/§21):
    PENDING -> APPROVED | REJECTED | EXPIRED | CANCELLED
    (terminal: APPROVED / REJECTED / EXPIRED / CANCELLED — never re-resolved)

Only a PENDING approval may be resolved. ``resolved_by`` MUST be recorded on
resolution.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import StrEnum

from ..domain.enums import ActorType, SideEffectLevel
from ..domain.ids import ApprovalId, BranchId, ProjectId, ProposalId, TaskId
from .errors import InvariantViolationError


class ApprovalStatus(StrEnum):
    """Lifecycle of an ApprovalRequest (STEP-003 §19)."""

    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


TERMINAL_APPROVAL_STATUSES = frozenset(
    {
        ApprovalStatus.APPROVED,
        ApprovalStatus.REJECTED,
        ApprovalStatus.EXPIRED,
        ApprovalStatus.CANCELLED,
    }
)


@dataclass(frozen=True)
class ApprovalRequest:
    """An immutable Human-in-the-loop decision request."""

    approval_id: ApprovalId
    project_id: ProjectId
    branch_id: BranchId

    task_id: TaskId
    proposal_id: ProposalId

    requested_action: str
    reason: str

    impact: str
    side_effect_level: SideEffectLevel

    status: ApprovalStatus = ApprovalStatus.PENDING

    requested_by: ActorType = ActorType.SYSTEM
    requested_at: datetime = field(default_factory=lambda: _EPOCH)

    resolved_by: ActorType | None = None
    resolved_at: datetime | None = None
    resolution_note: str = ""

    metadata: Mapping[str, object] = field(default_factory=dict)

    def is_terminal(self) -> bool:
        return self.status in TERMINAL_APPROVAL_STATUSES

    def resolve(
        self,
        *,
        status: ApprovalStatus,
        resolved_by: ActorType,
        now: datetime,
        note: str = "",
    ) -> ApprovalRequest:
        """Return a NEW approval moved to a terminal resolution status.

        Only PENDING -> {APPROVED, REJECTED, EXPIRED, CANCELLED} is legal.
        """
        if self.status is not ApprovalStatus.PENDING:
            raise InvariantViolationError(
                f"approval {self.approval_id} is terminal ({self.status.value}); "
                "cannot be re-resolved"
            )
        if status is ApprovalStatus.PENDING:
            raise InvariantViolationError("cannot resolve to PENDING")
        return replace(
            self,
            status=status,
            resolved_by=resolved_by,
            resolved_at=now,
            resolution_note=note,
        )


# Placeholder epoch (tz-aware) for dataclass defaults only; real timestamps
# are supplied by ApprovalManager. Importing UTC lazily to keep the module
# header clean.
from datetime import UTC  # noqa: E402

_EPOCH: datetime = datetime(1970, 1, 1, tzinfo=UTC)


__all__ = [
    "TERMINAL_APPROVAL_STATUSES",
    "ApprovalRequest",
    "ApprovalStatus",
]
