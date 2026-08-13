"""ContextBundleStore port — Persistence adapter interface for bundles.

The Cognitive layer depends on this ``Protocol``, never on a concrete
persistence implementation (RULE-07). The in-memory adapter lives in
``packages/cognition/testing.py`` for tests/dev (STEP-006 §31). A real adapter
(behind the persistence plane) implements this later; both satisfy the same
port, so swapping the store is an adapter change, not a rewrite.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..domain.ids import BranchId, ContextBundleId, ProjectId
from .context import ContextBundle


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


__all__ = ["ContextBundleStore"]
