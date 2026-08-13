"""In-memory cognitive adapters — test/dev only.

NOT Domain objects, NOT production persistence adapters. They exist so the
cognitive kernel can be exercised end-to-end without a database (STEP-006 §31,
STEP-007 §8/§37, ADR-003). Production code MUST NOT depend on them; only tests
and dev harnesses import from here.
"""

from __future__ import annotations

from ..domain.ids import (
    BranchId,
    ContextBundleId,
    ContextItemId,
    ProjectId,
    RetrievalResolutionId,
)
from .context import ContextBundle, ContextItem, ContextScope
from .errors import CognitionError
from .retrieval import RetrievalResolution


class InMemoryContextBundleStore:
    """In-memory ContextBundleStore adapter (test/dev only)."""

    def __init__(self) -> None:
        self._bundles: dict[ContextBundleId, ContextBundle] = {}

    def save(self, bundle: ContextBundle) -> None:
        if bundle.bundle_id in self._bundles:
            raise CognitionError(f"bundle already saved: {bundle.bundle_id}")
        self._bundles[bundle.bundle_id] = bundle

    def get(self, bundle_id: ContextBundleId) -> ContextBundle:
        return self._bundles[bundle_id]

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[ContextBundle]:
        return [
            b
            for b in self._bundles.values()
            if b.project_id == project_id and b.branch_id == branch_id
        ]


class InMemoryContextCatalog:
    """In-memory ContextCatalog adapter (test/dev only).

    A read-only, enumerable catalog. Duplicate ContextItemId on add is rejected
    (STEP-007 §31). ``list_items`` returns all SYSTEM items plus PROJECT items
    of that project plus BRANCH items of that branch.
    """

    def __init__(self) -> None:
        self._items: dict[ContextItemId, ContextItem] = {}

    def add(self, item: ContextItem) -> None:
        if item.item_id in self._items:
            raise CognitionError(f"catalog item already exists: {item.item_id}")
        self._items[item.item_id] = item

    def get(self, item_id: ContextItemId) -> ContextItem:
        return self._items[item_id]

    def list_items(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[ContextItem]:
        visible: list[ContextItem] = []
        for item in self._items.values():
            if item.scope is ContextScope.SYSTEM:
                visible.append(item)
            elif item.scope is ContextScope.PROJECT and item.project_id == project_id:
                visible.append(item)
            elif (
                item.scope is ContextScope.BRANCH
                and item.project_id == project_id
                and item.branch_id == branch_id
            ):
                visible.append(item)
        return visible


class InMemoryRetrievalResolutionStore:
    """In-memory RetrievalResolutionStore adapter (test/dev only)."""

    def __init__(self) -> None:
        self._records: dict[RetrievalResolutionId, RetrievalResolution] = {}

    def save(self, resolution: RetrievalResolution) -> None:
        if resolution.resolution_id in self._records:
            raise CognitionError(
                f"resolution already saved: {resolution.resolution_id}"
            )
        self._records[resolution.resolution_id] = resolution

    def get(self, resolution_id: RetrievalResolutionId) -> RetrievalResolution:
        return self._records[resolution_id]

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[RetrievalResolution]:
        return [
            r
            for r in self._records.values()
            if r.project_id == project_id and r.branch_id == branch_id
        ]


__all__ = [
    "InMemoryContextBundleStore",
    "InMemoryContextCatalog",
    "InMemoryRetrievalResolutionStore",
]
