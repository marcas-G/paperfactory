"""ContextCompiler — deterministic context assembly (STEP-006 §24/§26).

Pipeline (fixed order, STEP-006 §26):
    1. request validation (done in ContextRequest.__post_init__)
    2. state revision validation (stale -> raise)
    3. duplicate candidate validation
    4. requested item lookup
    5. scope validation
    6. blinding (before budget; precedence over required inclusion)
    7. required context completeness
    8. deterministic ordering
    9. budget selection (greedy; required first, then optional)
   10. bundle construction + save

It MUST NOT search/retrieve/embed/summarize/call LLM/write prompt/mutate
Research State. Token estimates are CONSUMED from items, not derived.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable

from ..domain.ids import ContextBundleId, ContextItemId
from .clock import TimeProvider, default_id, default_now
from .context import (
    ContextBundle,
    ContextItem,
    ContextLayer,
    ContextRequest,
    ContextScope,
    ExcludedContextItem,
    ExcludedContextReason,
)
from .errors import (
    ContextBudgetExceededError,
    DuplicateContextItemError,
    RequiredContextBlindedError,
    RequiredContextMissingError,
    RequiredContextScopeError,
    StaleContextRequestError,
)
from .policies import BlindingPolicy, ContextPolicy
from .store import ContextBundleStore


def _is_scope_visible(
    item: ContextItem,
    project_id,  # ProjectId | None
    branch_id,  # BranchId | None
) -> bool:
    """STEP-006 §25 visibility rules."""
    if item.scope is ContextScope.SYSTEM:
        return True
    if item.scope is ContextScope.PROJECT:
        return item.project_id == project_id
    # BRANCH
    return item.project_id == project_id and item.branch_id == branch_id


class ContextCompiler:
    """Deterministic compiler: validate -> scope -> blind -> require -> budget."""

    def __init__(
        self,
        store: ContextBundleStore,
        *,
        bundle_id_factory: Callable[[], ContextBundleId] | None = None,
        now: TimeProvider | None = None,
    ) -> None:
        self._store = store
        self._bundle_id_factory: Callable[[], ContextBundleId] = (
            bundle_id_factory or _default_bundle_id
        )
        self._now: TimeProvider = now or default_now

    def compile(
        self,
        request: ContextRequest,
        context_policy: ContextPolicy,
        blinding_policy: BlindingPolicy,
        candidates: Iterable[ContextItem],
        current_state_revision: int,
    ) -> ContextBundle:
        # 2. stale request
        if request.state_revision != current_state_revision:
            raise StaleContextRequestError(
                f"request revision {request.state_revision} != current {current_state_revision}"
            )

        # 3. duplicate candidates + index
        candidate_index: dict[ContextItemId, ContextItem] = {}
        for cand in candidates:
            if cand.item_id in candidate_index:
                raise DuplicateContextItemError(f"duplicate candidate: {cand.item_id}")
            candidate_index[cand.item_id] = cand

        excluded: list[ExcludedContextItem] = []
        included: list[ContextItem] = []

        # 6/7. REQUIRED — completeness, scope, blinding (blinding precedence)
        required_items: list[ContextItem] = []
        for req_id in request.required_item_ids:
            item = candidate_index.get(req_id)
            if item is None:
                raise RequiredContextMissingError(f"required item missing: {req_id}")
            if not _is_scope_visible(item, request.project_id, request.branch_id):
                raise RequiredContextScopeError(f"required item scope mismatch: {req_id}")
            if _is_blinded(item, blinding_policy):
                raise RequiredContextBlindedError(f"required item blinded: {req_id}")
            required_items.append(item)

        # required tokens vs budget
        required_tokens = sum(i.estimated_tokens for i in required_items)
        if required_tokens > request.budget.max_tokens:
            raise ContextBudgetExceededError(
                f"required tokens {required_tokens} > budget {request.budget.max_tokens}"
            )
        included.extend(required_items)

        # 5/6/9. OPTIONAL — scope/blinding exclude, then greedy budget
        optional_items = [
            candidate_index[oid] for oid in request.optional_item_ids if oid in candidate_index
        ]
        # record missing optional items
        for oid in request.optional_item_ids:
            if oid not in candidate_index:
                excluded.append(
                    ExcludedContextItem(
                        item_id=oid, reason_code=ExcludedContextReason.MISSING_OPTIONAL_ITEM
                    )
                )

        ordered_optional = _deterministic_sort(optional_items, context_policy.layer_order)
        running_total = required_tokens
        for item in ordered_optional:
            if not _is_scope_visible(item, request.project_id, request.branch_id):
                reason = (
                    ExcludedContextReason.BRANCH_SCOPE_MISMATCH
                    if item.scope is ContextScope.BRANCH
                    else ExcludedContextReason.PROJECT_SCOPE_MISMATCH
                )
                excluded.append(
                    ExcludedContextItem(
                        item_id=item.item_id,
                        reason_code=reason,
                        source_ref=item.source_ref,
                    )
                )
                continue
            if _is_blinded(item, blinding_policy):
                excluded.append(
                    ExcludedContextItem(
                        item_id=item.item_id,
                        reason_code=ExcludedContextReason.BLINDED,
                        source_ref=item.source_ref,
                    )
                )
                continue
            if running_total + item.estimated_tokens <= request.budget.max_tokens:
                included.append(item)
                running_total += item.estimated_tokens
            else:
                excluded.append(
                    ExcludedContextItem(
                        item_id=item.item_id,
                        reason_code=ExcludedContextReason.BUDGET_EXCEEDED,
                        source_ref=item.source_ref,
                    )
                )

        # 8. deterministic order of the final included set (required first,
        # then optional, each deterministically sorted).
        included_required = _deterministic_sort(required_items, context_policy.layer_order)
        included_optional = [it for it in included if it not in required_items]
        included_optional = _deterministic_sort(included_optional, context_policy.layer_order)
        final_items: tuple[ContextItem, ...] = (*included_required, *included_optional)

        # total tokens must equal sum of included item tokens
        total_tokens = sum(i.estimated_tokens for i in final_items)

        # provenance from included items
        source_refs = tuple(i.source_ref for i in final_items)

        bundle = ContextBundle(
            bundle_id=self._bundle_id_factory(),
            request_id=request.request_id,
            project_id=request.project_id,
            branch_id=request.branch_id,
            state_revision=request.state_revision,
            action_id=request.action_id,
            cognitive_mode=request.cognitive_mode,
            context_policy_id=context_policy.policy_id,
            context_policy_version=context_policy.version,
            blinding_policy_id=blinding_policy.policy_id,
            blinding_policy_version=blinding_policy.version,
            compiler_version=context_policy.compiler_version,
            items=final_items,
            excluded_items=tuple(excluded),
            total_estimated_tokens=total_tokens,
            budget_max_tokens=request.budget.max_tokens,
            source_refs=source_refs,
            created_at=self._now(),
        )
        self._store.save(bundle)
        return bundle


def _is_blinded(item: ContextItem, policy: BlindingPolicy) -> bool:
    """STEP-006 §27: any protection_tag in hidden_tags -> blinded."""
    return any(tag in policy.hidden_tags for tag in item.protection_tags)


def _deterministic_sort(
    items: list[ContextItem], layer_order: tuple[ContextLayer, ...]
) -> list[ContextItem]:
    """Sort by: layer_order index, priority desc, item_id asc (STEP-006 §23)."""
    layer_rank = {layer: idx for idx, layer in enumerate(layer_order)}
    return sorted(
        items,
        key=lambda it: (
            layer_rank[it.layer],
            -it.priority,
            str(it.item_id),
        ),
    )


def _default_bundle_id() -> ContextBundleId:
    return ContextBundleId(default_id())


__all__ = ["ContextCompiler"]
