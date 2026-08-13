"""ResearchBranch — an isolation boundary for research-state evolution.

A branch is a *research-state isolation boundary* within a project (STEP-004).
Multiple branches (main, H1, H2, ...) evolve independently: each has its own
branch-local revision counter, its own object states, and its own pending /
approval / task lifecycle. Branches are NOT ResearchStateSnapshots — the
snapshot still lives in the StateStore; the branch is the lifecycle +
provenance record.

Lifecycle (STEP-004 §8):
    ACTIVE  -> PAUSED | MERGED | REJECTED | ARCHIVED
    PAUSED  -> ACTIVE | REJECTED | ARCHIVED
    (terminal: MERGED / REJECTED / ARCHIVED — never revived)
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import StrEnum

from ..domain.enums import ActorType
from ..domain.ids import BranchId, ObjectId, ProjectId
from ..domain.models import StateLabel
from .errors import IllegalBranchTransitionError


class BranchStatus(StrEnum):
    """Lifecycle states of a ResearchBranch (STEP-004 §6)."""

    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    MERGED = "MERGED"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"


TERMINAL_BRANCH_STATUSES = frozenset(
    {BranchStatus.MERGED, BranchStatus.REJECTED, BranchStatus.ARCHIVED}
)

# Branches that may be used as a fork SOURCE (STEP-004 §12).
FORKABLE_BRANCH_STATUSES = frozenset({BranchStatus.ACTIVE, BranchStatus.PAUSED})

# Branches that allow ordinary research actions (STEP-004 §16).
ACTIONABLE_BRANCH_STATUSES = frozenset({BranchStatus.ACTIVE})

_LEGAL_BRANCH_TRANSITIONS: dict[BranchStatus, frozenset[BranchStatus]] = {
    BranchStatus.ACTIVE: frozenset(
        {BranchStatus.PAUSED, BranchStatus.MERGED, BranchStatus.REJECTED, BranchStatus.ARCHIVED}
    ),
    BranchStatus.PAUSED: frozenset(
        {BranchStatus.ACTIVE, BranchStatus.REJECTED, BranchStatus.ARCHIVED}
    ),
    # terminal: no outgoing edges
    BranchStatus.MERGED: frozenset(),
    BranchStatus.REJECTED: frozenset(),
    BranchStatus.ARCHIVED: frozenset(),
}


@dataclass(frozen=True)
class ResearchBranch:
    """An immutable Research Branch record.

    ``parent_branch_id`` / ``forked_from_revision`` capture fork provenance
    (None for the main branch). The branch does NOT hold state itself — state
    lives in the StateStore keyed by (project_id, branch_id).
    """

    branch_id: BranchId
    project_id: ProjectId
    name: str
    created_at: datetime
    updated_at: datetime

    purpose: str = ""
    parent_branch_id: BranchId | None = None
    forked_from_revision: int | None = None
    status: BranchStatus = BranchStatus.ACTIVE
    created_by: ActorType = ActorType.SYSTEM
    metadata: Mapping[str, object] = field(default_factory=dict)

    def is_terminal(self) -> bool:
        return self.status in TERMINAL_BRANCH_STATUSES

    def is_main(self) -> bool:
        return self.parent_branch_id is None

    def with_status(self, new_status: BranchStatus, *, now: datetime) -> ResearchBranch:
        _assert_branch_transition(self.status, new_status)
        return replace(self, status=new_status, updated_at=now)


@dataclass(frozen=True)
class BranchForkPoint:
    """The base snapshot captured at fork time for three-way merge (STEP-004 §27).

    A separate typed object so persistence can store it independently, and so
    branch metadata is not overloaded with large state blobs. Records the
    source branch/revision the fork was taken from plus the object states at
    that point.
    """

    branch_id: BranchId
    source_branch_id: BranchId
    source_revision: int
    object_states: Mapping[ObjectId, StateLabel] = field(default_factory=dict)


def _assert_branch_transition(current: BranchStatus, target: BranchStatus) -> None:
    allowed = _LEGAL_BRANCH_TRANSITIONS.get(current, frozenset())
    if target not in allowed:
        raise IllegalBranchTransitionError(
            f"illegal branch transition: {current.value} -> {target.value}"
        )


__all__ = [
    "ACTIONABLE_BRANCH_STATUSES",
    "BranchForkPoint",
    "BranchStatus",
    "FORKABLE_BRANCH_STATUSES",
    "TERMINAL_BRANCH_STATUSES",
    "ResearchBranch",
]
