"""InMemoryContextBundleStore — a test/dev ContextBundleStore adapter.

NOT a Domain object, NOT a production persistence adapter. Exists so the
ContextCompiler can be exercised end-to-end without a database (STEP-006 §31,
ADR-003). Production code MUST NOT depend on it; only tests and dev harnesses
import from here.
"""

from __future__ import annotations

from ..domain.ids import BranchId, ContextBundleId, ProjectId
from .context import ContextBundle
from .errors import CognitionError


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


__all__ = ["InMemoryContextBundleStore"]
