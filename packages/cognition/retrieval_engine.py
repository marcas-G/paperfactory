"""RetrievalResolver — deterministic requirement resolution (STEP-007 §26).

Strict pipeline:
    validate requirements (duplicate ids, contract checks)
    -> order requirements (priority desc, id asc)
    -> for each requirement:
         enumerate catalog (scope-visible)
         metadata-match (item_type / layer / scope / labels)
         deterministic item sort (priority desc, layer_order, item_id asc)
         dedup (FIRST_REQUIREMENT_WINS) + forbidden exclusion
         apply maximum_count (REQUIREMENT_LIMIT audit)
         check minimum_count (required -> FAIL; optional -> audit)
    -> build immutable RetrievalResolution + save

It MUST NOT compile a ContextBundle, apply BlindingPolicy/ContextBudget, call
an LLM, or mutate Research State. Only ``ContextItem.priority`` is used as an
item ranking signal (no retrieval score / similarity).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

from ..domain.ids import (
    ActionId,
    BranchId,
    ContextItemId,
    ProjectId,
    RetrievalResolutionId,
)
from .clock import TimeProvider, default_id, default_now
from .context import ContextItem, ContextLayer, ContextScope
from .errors import (
    DuplicateRetrievalRequirementError,
    RequiredRetrievalRequirementUnsatisfiedError,
)
from .policies import ContextPolicy
from .retrieval import (
    RequirementResolution,
    RetrievalExclusion,
    RetrievalExclusionReason,
    RetrievalPolicy,
    RetrievalRequirement,
    RetrievalResolution,
)
from .store import ContextCatalog, RetrievalResolutionStore


class RetrievalResolver:
    """Deterministic, metadata-based requirement resolver."""

    def __init__(
        self,
        catalog: ContextCatalog,
        resolution_store: RetrievalResolutionStore,
        *,
        resolution_id_factory: Callable[[], RetrievalResolutionId] | None = None,
        now: TimeProvider | None = None,
    ) -> None:
        self._catalog = catalog
        self._store = resolution_store
        self._resolution_id_factory: Callable[[], RetrievalResolutionId] = (
            resolution_id_factory or _default_resolution_id
        )
        self._now: TimeProvider = now or default_now

    @property
    def catalog(self) -> ContextCatalog:
        """Read access to the catalog this resolver resolves against.

        Public since STEP-016: the composition root enumerates candidate
        context items through the same catalog the resolver uses — one
        source of truth, no private reach-through (closes the STEP-015
        ``_catalog`` access gap).
        """
        return self._catalog

    def resolve(
        self,
        *,
        project_id: ProjectId | None,
        branch_id: BranchId | None,
        state_revision: int,
        action_id: ActionId | None,
        cognitive_mode: str,
        requirements: Sequence[RetrievalRequirement],
        retrieval_policy: RetrievalPolicy,
        context_policy: ContextPolicy,
        forbidden_item_ids: tuple[ContextItemId, ...] = (),
    ) -> RetrievalResolution:
        # 1. duplicate requirement ids
        seen_req: set[object] = set()
        for req in requirements:
            if req.requirement_id in seen_req:
                raise DuplicateRetrievalRequirementError(
                    f"duplicate requirement_id: {req.requirement_id}"
                )
            seen_req.add(req.requirement_id)

        forbidden = set(forbidden_item_ids)
        layer_rank = {layer: idx for idx, layer in enumerate(context_policy.layer_order)}

        # 2. order requirements: priority desc, requirement_id asc
        ordered_reqs = sorted(
            requirements,
            key=lambda r: (-r.priority, str(r.requirement_id)),
        )

        already_selected: set[ContextItemId] = set()
        requirement_resolutions: list[RequirementResolution] = []
        required_ids: list[ContextItemId] = []
        optional_ids: list[ContextItemId] = []

        for req in ordered_reqs:
            matched = self._match_items(req, project_id, branch_id)
            # deterministic order within a requirement
            matched_sorted = _sort_items(matched, layer_rank)

            matched_ids = tuple(it.item_id for it in matched_sorted)
            selected: list[ContextItem] = []
            exclusions: list[RetrievalExclusion] = []
            truncated: list[ContextItemId] = []

            for item in matched_sorted:
                if item.item_id in already_selected:
                    exclusions.append(
                        RetrievalExclusion(
                            reason_code=RetrievalExclusionReason.ALREADY_SELECTED,
                            requirement_id=req.requirement_id,
                            item_id=item.item_id,
                        )
                    )
                    continue
                if item.item_id in forbidden:
                    exclusions.append(
                        RetrievalExclusion(
                            reason_code=RetrievalExclusionReason.FORBIDDEN_ITEM,
                            requirement_id=req.requirement_id,
                            item_id=item.item_id,
                        )
                    )
                    continue
                if len(selected) >= req.maximum_count:
                    # beyond the limit — audited as REQUIREMENT_LIMIT
                    truncated.append(item.item_id)
                    continue
                selected.append(item)
                already_selected.add(item.item_id)

            for tid in truncated:
                exclusions.append(
                    RetrievalExclusion(
                        reason_code=RetrievalExclusionReason.REQUIREMENT_LIMIT,
                        requirement_id=req.requirement_id,
                        item_id=tid,
                    )
                )

            selected_ids = tuple(it.item_id for it in selected)
            satisfied = len(selected) >= req.minimum_count

            # minimum_count enforcement
            if not satisfied and req.required:
                raise RequiredRetrievalRequirementUnsatisfiedError(
                    requirement_id=str(req.requirement_id),
                    minimum_count=req.minimum_count,
                    actual_count=len(selected),
                )
            if not satisfied and not req.required:
                exclusions.append(
                    RetrievalExclusion(
                        reason_code=RetrievalExclusionReason.UNSATISFIED_OPTIONAL_REQUIREMENT,
                        requirement_id=req.requirement_id,
                        details={
                            "minimum_count": req.minimum_count,
                            "actual_count": len(selected),
                        },
                    )
                )

            requirement_resolutions.append(
                RequirementResolution(
                    requirement_id=req.requirement_id,
                    required=req.required,
                    matched_item_ids=matched_ids,
                    selected_item_ids=selected_ids,
                    minimum_count=req.minimum_count,
                    maximum_count=req.maximum_count,
                    satisfied=satisfied,
                    exclusions=tuple(exclusions),
                )
            )

            if req.required:
                required_ids.extend(selected_ids)
            else:
                optional_ids.extend(selected_ids)

        resolution = RetrievalResolution(
            resolution_id=self._resolution_id_factory(),
            project_id=project_id,
            branch_id=branch_id,
            state_revision=state_revision,
            action_id=action_id,
            cognitive_mode=cognitive_mode,
            retrieval_policy_id=retrieval_policy.policy_id,
            retrieval_policy_version=retrieval_policy.version,
            resolver_version=retrieval_policy.resolver_version,
            requirement_resolutions=tuple(requirement_resolutions),
            required_item_ids=tuple(required_ids),
            optional_item_ids=tuple(optional_ids),
            forbidden_item_ids=tuple(forbidden_item_ids),
            created_at=self._now(),
        )
        self._store.save(resolution)
        return resolution

    # -------------------------------------------------------------------
    def _match_items(
        self,
        req: RetrievalRequirement,
        project_id: ProjectId | None,
        branch_id: BranchId | None,
    ) -> list[ContextItem]:
        matched: list[ContextItem] = []
        for item in self._catalog.list_items(project_id, branch_id):
            if item.item_type not in req.item_types:
                continue
            if item.layer not in req.layers:
                continue
            if item.scope not in req.scopes:
                continue
            if not _scope_visible(item, project_id, branch_id):
                continue
            if not _labels_match(item, req):
                continue
            matched.append(item)
        return matched


def _labels_match(item: ContextItem, req: RetrievalRequirement) -> bool:
    """STEP-007 §11 exact label matching (no fuzzy, no case-folding)."""
    labels = item.labels
    if not req.required_labels.issubset(labels):
        return False
    if req.any_labels and req.any_labels.isdisjoint(labels):
        return False
    if not req.excluded_labels.isdisjoint(labels):
        return False
    return True


def _scope_visible(
    item: ContextItem,
    project_id: ProjectId | None,
    branch_id: BranchId | None,
) -> bool:
    """STEP-007 §13: requirement scope membership AND request visibility."""
    if item.scope is ContextScope.SYSTEM:
        return True
    if item.scope is ContextScope.PROJECT:
        return item.project_id == project_id
    return item.project_id == project_id and item.branch_id == branch_id


def _sort_items(items: list[ContextItem], layer_rank: dict[ContextLayer, int]) -> list[ContextItem]:
    """Deterministic item order: priority desc, layer_order index, item_id asc."""
    return sorted(
        items,
        key=lambda it: (-it.priority, layer_rank[it.layer], str(it.item_id)),
    )


def _default_resolution_id() -> RetrievalResolutionId:
    return RetrievalResolutionId(default_id())


__all__ = ["RetrievalResolver"]
