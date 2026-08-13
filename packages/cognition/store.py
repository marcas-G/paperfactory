"""Cognitive persistence ports — adapter interfaces (Ports & Adapters).

The Cognitive layer depends on these ``Protocol``s, never on concrete
persistence (RULE-07). In-memory adapters live in ``packages/cognition/testing.py``
for tests/dev. A real adapter (behind the persistence plane) implements these
later; both satisfy the same port, so swapping is an adapter change.

STEP-007 adds the read-only ContextCatalog and the RetrievalResolutionStore.
A Catalog is NOT a search engine: it returns typed items, no ranking, no
semantic retrieval, no persistence (STEP-007 §8).
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..domain.ids import (
    BranchId,
    ContextBundleId,
    ContextItemId,
    ProjectId,
    RetrievalResolutionId,
)
from .context import ContextBundle, ContextItem
from .retrieval import RetrievalResolution


@runtime_checkable
class ContextBundleStore(Protocol):
    """Abstract store of compiled ContextBundle records."""

    def save(self, bundle: ContextBundle) -> None:
        """Persist a bundle. MUST reject a duplicate bundle id."""
        ...

    def get(self, bundle_id: ContextBundleId) -> ContextBundle:
        """Return the bundle or raise ``KeyError``."""
        ...

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[ContextBundle]:
        ...


@runtime_checkable
class ContextCatalog(Protocol):
    """Read-only, enumerable catalog of ContextItems (STEP-007 §8).

    Returns SYSTEM / PROJECT / BRANCH items; it does NOT enforce final scope
    (the ContextCompiler remains the correctness boundary, STEP-007 §9). No
    search ranking, no semantic retrieval.
    """

    def get(self, item_id: ContextItemId) -> ContextItem:
        """Return the item or raise ``KeyError``."""
        ...

    def list_items(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[ContextItem]:
        """Return items visible to (project, branch): all SYSTEM items, PROJECT
        items of that project, and BRANCH items of that branch."""
        ...


@runtime_checkable
class RetrievalResolutionStore(Protocol):
    """Abstract store of RetrievalResolution records (STEP-007 §37)."""

    def save(self, resolution: RetrievalResolution) -> None:
        """Persist a resolution. MUST reject a duplicate resolution id."""
        ...

    def get(self, resolution_id: RetrievalResolutionId) -> RetrievalResolution:
        ...

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[RetrievalResolution]:
        ...


__all__ = ["ContextBundleStore", "ContextCatalog", "RetrievalResolutionStore"]
