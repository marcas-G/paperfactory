"""Context retrieval contracts — deterministic requirement resolution
(STEP-007).

Three deliberately separate stages (STEP-007 §3):
    A. Requirement Declaration — what kinds of info does this task need?
    B. Retrieval Resolution    — which catalog items satisfy those needs?
    C. Context Compilation     — how do items pass scope/blinding/budget?

This module is stage A's declarations + stage B's result contract. The
resolver lives in ``retrieval_engine.py``; stage C is the STEP-006 compiler.

Retrieval here is METADATA-BASED and DETERMINISTIC: explicit label sets,
item types, layers, scopes. No embedding / vector / BM25 / search engine /
LLM query expansion (STEP-007 §4).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from ..domain.ids import (
    ActionId,
    BranchId,
    ContextItemId,
    ContextRequestId,
    ProjectId,
    RetrievalPolicyId,
    RetrievalRequirementId,
    RetrievalResolutionId,
)
from .context import (
    ContextBudget,
    ContextItemType,
    ContextLayer,
    ContextRequest,
    ContextScope,
)
from .errors import InvalidRetrievalRequirementError
from .policies import ContextPolicy


class RetrievalDeduplicationStrategy(StrEnum):
    """How an item that matches multiple requirements is assigned
    (STEP-007 §15). First version: FIRST_REQUIREMENT_WINS only."""

    FIRST_REQUIREMENT_WINS = "FIRST_REQUIREMENT_WINS"


class RetrievalExclusionReason(StrEnum):
    """Why an item/requirement was excluded during resolution
    (STEP-007 §21). Only auditable, resolution-affecting exclusions are
    recorded — not every catalog non-match."""

    REQUIREMENT_LIMIT = "REQUIREMENT_LIMIT"
    FORBIDDEN_ITEM = "FORBIDDEN_ITEM"
    ALREADY_SELECTED = "ALREADY_SELECTED"
    UNSATISFIED_OPTIONAL_REQUIREMENT = "UNSATISFIED_OPTIONAL_REQUIREMENT"


# Resolver algorithm version for this STEP-007 kernel.
RESOLVER_VERSION = "retrieval-resolver/0.1"


@dataclass(frozen=True)
class RetrievalRequirement:
    """One declared context need (STEP-007 §10).

    A catalog item matches iff:
        item_type in item_types
        AND layer in layers
        AND scope in scopes
        AND required_labels ⊆ item.labels
        AND (any_labels empty OR any_labels ∩ item.labels != empty)
        AND excluded_labels ∩ item.labels == empty
        AND scope-visible against the request project/branch
    """

    requirement_id: RetrievalRequirementId
    item_types: frozenset[ContextItemType]
    layers: frozenset[ContextLayer]
    scopes: frozenset[ContextScope]

    required: bool
    minimum_count: int
    maximum_count: int
    priority: int

    required_labels: frozenset[str] = field(default_factory=frozenset)
    any_labels: frozenset[str] = field(default_factory=frozenset)
    excluded_labels: frozenset[str] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        if not self.item_types:
            raise InvalidRetrievalRequirementError("item_types must be non-empty")
        if not self.layers:
            raise InvalidRetrievalRequirementError("layers must be non-empty")
        if not self.scopes:
            raise InvalidRetrievalRequirementError("scopes must be non-empty")
        if self.minimum_count < 0:
            raise InvalidRetrievalRequirementError(
                f"minimum_count must be >= 0, got {self.minimum_count}"
            )
        if self.maximum_count <= 0:
            raise InvalidRetrievalRequirementError(
                f"maximum_count must be > 0, got {self.maximum_count}"
            )
        if self.minimum_count > self.maximum_count:
            raise InvalidRetrievalRequirementError(
                f"minimum_count {self.minimum_count} > maximum_count "
                f"{self.maximum_count}"
            )
        if self.priority < 0 or self.priority > 100:
            raise InvalidRetrievalRequirementError(
                f"priority must be in [0,100], got {self.priority}"
            )


@dataclass(frozen=True)
class RetrievalPolicy:
    """Versioned, deterministic retrieval policy (STEP-007 §14)."""

    policy_id: RetrievalPolicyId
    version: int
    deduplication_strategy: RetrievalDeduplicationStrategy = (
        RetrievalDeduplicationStrategy.FIRST_REQUIREMENT_WINS
    )
    resolver_version: str = RESOLVER_VERSION

    def __post_init__(self) -> None:
        if not self.policy_id:
            raise InvalidRetrievalRequirementError("policy_id must be non-empty")
        if self.version < 1:
            raise InvalidRetrievalRequirementError("version must be >= 1")


@dataclass(frozen=True)
class RetrievalExclusion:
    """An auditable exclusion during resolution (STEP-007 §22)."""

    reason_code: RetrievalExclusionReason
    requirement_id: RetrievalRequirementId
    item_id: ContextItemId | None = None
    details: Mapping[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class RequirementResolution:
    """Per-requirement resolution result (STEP-007 §23)."""

    requirement_id: RetrievalRequirementId
    required: bool
    matched_item_ids: tuple[ContextItemId, ...]
    selected_item_ids: tuple[ContextItemId, ...]
    minimum_count: int
    maximum_count: int
    satisfied: bool
    exclusions: tuple[RetrievalExclusion, ...] = ()


@dataclass(frozen=True)
class RetrievalResolution:
    """The full, immutable result of one retrieval resolution (STEP-007 §24).

    Converts to a STEP-006 ``ContextRequest`` via ``to_context_request`` — it
    does NOT compile a bundle and does NOT apply blinding/budget.
    """

    resolution_id: RetrievalResolutionId
    project_id: ProjectId | None
    branch_id: BranchId | None
    state_revision: int
    action_id: ActionId | None
    cognitive_mode: str

    retrieval_policy_id: RetrievalPolicyId
    retrieval_policy_version: int
    resolver_version: str

    requirement_resolutions: tuple[RequirementResolution, ...]
    required_item_ids: tuple[ContextItemId, ...]
    optional_item_ids: tuple[ContextItemId, ...]
    forbidden_item_ids: tuple[ContextItemId, ...]
    created_at: datetime

    def to_context_request(
        self,
        *,
        request_id: ContextRequestId,
        context_policy: ContextPolicy,
        budget: ContextBudget,
        forbidden_item_ids: tuple[ContextItemId, ...] | None = None,
        created_at: datetime | None = None,
    ) -> ContextRequest:
        """Project this resolution into a STEP-006 ContextRequest.

        ``forbidden_item_ids`` defaults to the resolution's forbidden set but
        may be overridden/extended by the caller (STEP-007 §25).
        """
        return ContextRequest(
            request_id=request_id,
            project_id=self.project_id,
            branch_id=self.branch_id,
            state_revision=self.state_revision,
            action_id=self.action_id,
            cognitive_mode=self.cognitive_mode,
            required_item_ids=self.required_item_ids,
            optional_item_ids=self.optional_item_ids,
            forbidden_item_ids=(
                forbidden_item_ids
                if forbidden_item_ids is not None
                else self.forbidden_item_ids
            ),
            budget=budget,
            context_policy_id=context_policy.policy_id,
            context_policy_version=context_policy.version,
            created_at=created_at or self.created_at,
        )


__all__ = [
    "RESOLVER_VERSION",
    "RequirementResolution",
    "RetrievalDeduplicationStrategy",
    "RetrievalExclusion",
    "RetrievalExclusionReason",
    "RetrievalPolicy",
    "RetrievalRequirement",
    "RetrievalResolution",
]
