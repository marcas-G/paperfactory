"""Branch merge preparation + generic three-way conflict detection.

STEP-004 does NOT implement research-semantic merge (Hypothesis/Evidence/Claim
have different merge semantics, which arrive with the research domain). This
module implements only:

    * MergePreparation — read both branch states, compare against the fork
      base, produce a typed ``BranchMergeProposal`` listing conflicts.
    * GenericStateConflictDetection — a minimal three-way comparison over
      ``object_states``.

``prepare_merge`` MUST NOT mutate either branch's Research State and MUST NOT
mark the source branch MERGED (STEP-004 §28). ``BRANCH_MERGED`` is therefore
never emitted here.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum

from ..domain.enums import ActorType
from ..domain.ids import BranchId, MergeId, ObjectId, ProjectId
from ..domain.models import StateLabel


class MergeStatus(StrEnum):
    """Lifecycle of a BranchMergeProposal (STEP-004 §25).

    STEP-004 only ever produces PREPARED / CONFLICTED / READY; COMMITTED /
    REJECTED / CANCELLED are reserved for a future real merge execution.
    """

    PREPARED = "PREPARED"
    CONFLICTED = "CONFLICTED"
    READY = "READY"
    COMMITTED = "COMMITTED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


# Per-object three-way comparison outcomes (STEP-004 §26).
class MergeChangeKind(StrEnum):
    """Why a single object is or is not in conflict."""

    UNCHANGED = "UNCHANGED"  # nobody touched it
    TARGET_ONLY_CHANGE = "TARGET_ONLY_CHANGE"  # source == base, target changed
    SOURCE_ONLY_CHANGE = "SOURCE_ONLY_CHANGE"  # target == base, source changed
    SAME_CHANGE = "SAME_CHANGE"  # source == target (regardless of base)
    CONFLICT = "CONFLICT"  # both changed differently


@dataclass(frozen=True)
class MergeConflict:
    """One object that conflicts between source and target (both changed, differ)."""

    object_id: ObjectId
    base_state: StateLabel | None
    source_state: StateLabel | None
    target_state: StateLabel | None


@dataclass(frozen=True)
class BranchMergeProposal:
    """An immutable record of a merge preparation (NOT a merge commit)."""

    merge_id: MergeId
    project_id: ProjectId

    source_branch_id: BranchId
    target_branch_id: BranchId

    source_head_revision: int
    target_head_revision: int

    fork_base_branch_id: BranchId | None
    fork_base_revision: int | None

    conflicts: tuple[MergeConflict, ...] = ()
    status: MergeStatus = MergeStatus.PREPARED
    created_by: ActorType = ActorType.SYSTEM
    created_at: datetime = field(default_factory=lambda: _EPOCH)
    metadata: Mapping[str, object] = field(default_factory=dict)


# Placeholder tz-aware epoch for the dataclass default only; BranchManager
# always supplies a real timestamp.
_EPOCH: datetime = datetime(1970, 1, 1, tzinfo=UTC)


def classify_object(
    *,
    base: StateLabel | None,
    source: StateLabel | None,
    target: StateLabel | None,
) -> MergeChangeKind:
    """Three-way classify one object (STEP-004 §26)."""
    if source == target:
        return MergeChangeKind.SAME_CHANGE
    if source == base:
        return MergeChangeKind.TARGET_ONLY_CHANGE
    if target == base:
        return MergeChangeKind.SOURCE_ONLY_CHANGE
    return MergeChangeKind.CONFLICT


def detect_conflicts(
    *,
    base: Mapping[ObjectId, StateLabel],
    source: Mapping[ObjectId, StateLabel],
    target: Mapping[ObjectId, StateLabel],
) -> list[MergeConflict]:
    """Return the list of conflicting objects across a three-way comparison."""
    all_ids = set(base) | set(source) | set(target)
    conflicts: list[MergeConflict] = []
    for object_id in all_ids:
        kind = classify_object(
            base=base.get(object_id),
            source=source.get(object_id),
            target=target.get(object_id),
        )
        if kind is MergeChangeKind.CONFLICT:
            conflicts.append(
                MergeConflict(
                    object_id=object_id,
                    base_state=base.get(object_id),
                    source_state=source.get(object_id),
                    target_state=target.get(object_id),
                )
            )
    return conflicts


__all__ = [
    "BranchMergeProposal",
    "MergeChangeKind",
    "MergeConflict",
    "MergeStatus",
    "classify_object",
    "detect_conflicts",
]
