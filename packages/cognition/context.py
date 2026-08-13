"""Cognitive context contracts (STEP-006 §6-§10, §18-§20, §28-§30).

These are the immutable, typed projections a cognitive task sees. Crucially:

    * ContextItem is a *projection*, NOT Research State — it is never written
      back to a Research Object.
    * Context inclusion is always EXPLICIT (an item appears in
      required/optional); the compiler never auto-includes (STEP-006 §16).
    * Scope invariants (SYSTEM/PROJECT/BRANCH) are enforced here.
    * ContextBundle keeps item boundaries — it is never a flattened prompt.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum

from ..domain.ids import (
    ActionId,
    BranchId,
    ContextBundleId,
    ContextItemId,
    ContextRequestId,
    ProjectId,
)
from .errors import InvalidContextItemError, InvalidContextRequestError


class ContextLayer(StrEnum):
    """Where an item sits in the layered context (STEP-006 §6)."""

    GLOBAL = "GLOBAL"
    STATE = "STATE"
    TASK = "TASK"


class ContextScope(StrEnum):
    """Binding scope of an item (STEP-006 §7).

    SYSTEM  : project_id = None, branch_id = None
    PROJECT : project_id != None, branch_id = None
    BRANCH  : project_id != None, branch_id != None
    """

    SYSTEM = "SYSTEM"
    PROJECT = "PROJECT"
    BRANCH = "BRANCH"


class ContextProtectionTag(StrEnum):
    """Research-blinding protection tags (STEP-006 §8).

    These flag content that a BlindingPolicy may hide for research integrity
    (e.g. protecting confirmatory results). They are NOT security/permission
    labels.
    """

    FUTURE_RESULT = "FUTURE_RESULT"
    TEST_SET = "TEST_SET"
    CONFIRMATORY_RESULT = "CONFIRMATORY_RESULT"
    REVIEW_OUTCOME = "REVIEW_OUTCOME"


class ExcludedContextReason(StrEnum):
    """Why a candidate item was excluded from the bundle (STEP-006 §18)."""

    FORBIDDEN_BY_REQUEST = "FORBIDDEN_BY_REQUEST"
    BLINDED = "BLINDED"
    PROJECT_SCOPE_MISMATCH = "PROJECT_SCOPE_MISMATCH"
    BRANCH_SCOPE_MISMATCH = "BRANCH_SCOPE_MISMATCH"
    BUDGET_EXCEEDED = "BUDGET_EXCEEDED"
    MISSING_OPTIONAL_ITEM = "MISSING_OPTIONAL_ITEM"


@dataclass(frozen=True)
class ContextSourceRef:
    """Provenance of a ContextItem (STEP-006 §9)."""

    source_type: str
    source_id: str
    version: str

    def __post_init__(self) -> None:
        if not self.source_type:
            raise InvalidContextItemError("source_type must be non-empty")
        if not self.source_id:
            raise InvalidContextItemError("source_id must be non-empty")
        if not self.version:
            raise InvalidContextItemError("version must be non-empty")


@dataclass(frozen=True)
class ContextItem:
    """An immutable cognitive projection of one piece of context.

    Not a Research Object — a projection the compiler assembles into a bundle.
    """

    item_id: ContextItemId
    layer: ContextLayer
    scope: ContextScope

    source_ref: ContextSourceRef
    content: str
    estimated_tokens: int
    priority: int

    project_id: ProjectId | None = None
    branch_id: BranchId | None = None
    protection_tags: frozenset[ContextProtectionTag] = field(default_factory=frozenset)
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        # content
        if not self.content or not self.content.strip():
            raise InvalidContextItemError("content must be non-empty")
        # tokens
        if self.estimated_tokens <= 0:
            raise InvalidContextItemError(
                f"estimated_tokens must be > 0, got {self.estimated_tokens}"
            )
        # priority
        if self.priority < 0 or self.priority > 100:
            raise InvalidContextItemError(
                f"priority must be in [0,100], got {self.priority}"
            )
        # scope invariants (STEP-006 §7)
        if self.scope is ContextScope.SYSTEM:
            if self.project_id is not None or self.branch_id is not None:
                raise InvalidContextItemError(
                    "SYSTEM scope must have project_id=None and branch_id=None"
                )
        elif self.scope is ContextScope.PROJECT:
            if self.project_id is None or self.branch_id is not None:
                raise InvalidContextItemError(
                    "PROJECT scope requires project_id and branch_id=None"
                )
        else:  # BRANCH
            if self.project_id is None or self.branch_id is None:
                raise InvalidContextItemError(
                    "BRANCH scope requires both project_id and branch_id"
                )


@dataclass(frozen=True)
class ContextBudget:
    """Token budget for the bundle content (STEP-006 §13)."""

    max_tokens: int

    def __post_init__(self) -> None:
        if self.max_tokens <= 0:
            raise InvalidContextItemError(
                f"max_tokens must be > 0, got {self.max_tokens}"
            )


@dataclass(frozen=True)
class ExcludedContextItem:
    """A candidate removed during compilation, with a typed reason."""

    item_id: ContextItemId
    reason_code: ExcludedContextReason
    source_ref: ContextSourceRef | None = None


@dataclass(frozen=True)
class ContextBundle:
    """Immutable, auditable compiled context (STEP-006 §28).

    Item boundaries are preserved — this is NOT a flattened prompt.
    """

    bundle_id: ContextBundleId
    request_id: ContextRequestId

    project_id: ProjectId | None
    branch_id: BranchId | None
    state_revision: int

    action_id: ActionId | None
    cognitive_mode: str

    context_policy_id: str
    context_policy_version: int

    blinding_policy_id: str
    blinding_policy_version: int

    compiler_version: str

    items: tuple[ContextItem, ...]
    excluded_items: tuple[ExcludedContextItem, ...]

    total_estimated_tokens: int
    budget_max_tokens: int

    source_refs: tuple[ContextSourceRef, ...]
    created_at: datetime


def is_bundle_current(bundle: ContextBundle, current_state_revision: int) -> bool:
    """A bundle is current only if the state revision is unchanged
    (STEP-006 §30). No auto-refresh."""
    return bundle.state_revision == current_state_revision


@dataclass(frozen=True)
class ContextRequest:
    """An immutable request for a compiled context (STEP-006 §15).

    Binds a specific state revision. required/optional/forbidden id sets must
    each be duplicate-free and mutually disjoint. Context inclusion is always
    explicit (STEP-006 §16): the compiler never auto-includes items that are
    not listed in required/optional.
    """

    request_id: ContextRequestId
    project_id: ProjectId | None
    branch_id: BranchId | None
    state_revision: int
    action_id: ActionId | None
    cognitive_mode: str

    required_item_ids: tuple[ContextItemId, ...] = ()
    optional_item_ids: tuple[ContextItemId, ...] = ()
    forbidden_item_ids: tuple[ContextItemId, ...] = ()

    budget: ContextBudget = field(
        default_factory=lambda: ContextBudget(max_tokens=8192)
    )
    context_policy_id: str = "default"
    context_policy_version: int = 1
    created_at: datetime = field(default_factory=lambda: _EPOCH)

    def __post_init__(self) -> None:
        # duplicate-free within each set
        for name, ids in (
            ("required_item_ids", self.required_item_ids),
            ("optional_item_ids", self.optional_item_ids),
            ("forbidden_item_ids", self.forbidden_item_ids),
        ):
            if len(set(ids)) != len(ids):
                raise InvalidContextRequestError(f"{name} contains duplicates")
        # mutual disjointness
        req, opt, forb = (
            set(self.required_item_ids),
            set(self.optional_item_ids),
            set(self.forbidden_item_ids),
        )
        if req & opt:
            raise InvalidContextRequestError("required and optional overlap")
        if req & forb:
            raise InvalidContextRequestError("required and forbidden overlap")
        if opt & forb:
            raise InvalidContextRequestError("optional and forbidden overlap")
        # created_at must be timezone-aware
        if self.created_at.tzinfo is None or self.created_at.utcoffset() is None:
            raise InvalidContextRequestError("created_at must be timezone-aware")


def is_request_current(request: ContextRequest, current_revision: int) -> bool:
    """A request is current only if the state revision matches
    (STEP-006 §17)."""
    return request.state_revision == current_revision


# Placeholder tz-aware epoch for the dataclass default only; producers and the
# compiler always supply a real timestamp.
_EPOCH: datetime = datetime(1970, 1, 1, tzinfo=UTC)


__all__ = [
    "ContextBudget",
    "ContextBundle",
    "ContextItem",
    "ContextLayer",
    "ContextProtectionTag",
    "ContextRequest",
    "ContextScope",
    "ContextSourceRef",
    "ExcludedContextItem",
    "ExcludedContextReason",
    "is_bundle_current",
    "is_request_current",
]
