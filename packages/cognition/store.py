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
    CognitiveResultId,
    ContextBundleId,
    ContextItemId,
    OutputContractId,
    OutputSchemaId,
    OutputValidationId,
    ProjectId,
    PromptPackageId,
    PromptTemplateId,
    RetrievalResolutionId,
)
from .context import ContextBundle, ContextItem
from .output import (
    CognitiveResultEnvelope,
    OutputContract,
    OutputValidationResult,
    StructuredOutputValidator,
)
from .prompt import PromptPackage, PromptTemplate
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
    ) -> list[ContextBundle]: ...


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

    def get(self, resolution_id: RetrievalResolutionId) -> RetrievalResolution: ...

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[RetrievalResolution]: ...


@runtime_checkable
class PromptTemplateRegistry(Protocol):
    """Registry of versioned PromptTemplates (STEP-008 §15).

    Not a persistence port — a registry abstraction. ``(template_id, version)``
    is unique; duplicate registration is rejected.
    """

    def register(self, template: PromptTemplate) -> None: ...

    def get(self, template_id: PromptTemplateId, version: int) -> PromptTemplate: ...

    def list_versions(self, template_id: PromptTemplateId) -> list[int]: ...


@runtime_checkable
class PromptPackageStore(Protocol):
    """Abstract store of compiled PromptPackage records (STEP-008 §39)."""

    def save(self, package: PromptPackage) -> None:
        """Persist a package. MUST reject a duplicate package id."""
        ...

    def get(self, package_id: PromptPackageId) -> PromptPackage: ...

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[PromptPackage]: ...


@runtime_checkable
class OutputContractRegistry(Protocol):
    """Registry of versioned OutputContracts (STEP-010 §8).

    ``(contract_id, version)`` is unique; duplicate registration is rejected.
    """

    def register(self, contract: OutputContract) -> None: ...

    def get(self, contract_id: OutputContractId, version: int) -> OutputContract: ...

    def list_versions(self, contract_id: OutputContractId) -> list[int]: ...


@runtime_checkable
class StructuredOutputValidatorRegistry(Protocol):
    """Registry of schema validators (STEP-010 §10).

    ``(schema_id, version)`` is unique; duplicate registration is rejected.
    """

    def register(self, validator: StructuredOutputValidator) -> None: ...

    def get(self, schema_id: OutputSchemaId, version: int) -> StructuredOutputValidator: ...


@runtime_checkable
class OutputValidationResultStore(Protocol):
    """Store of OutputValidationResult records (STEP-010 §34)."""

    def save(self, result: OutputValidationResult) -> None: ...

    def get(self, validation_id: OutputValidationId) -> OutputValidationResult: ...

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[OutputValidationResult]: ...


@runtime_checkable
class CognitiveResultStore(Protocol):
    """Store of CognitiveResultEnvelope records (STEP-010 §34)."""

    def save(self, result: CognitiveResultEnvelope) -> None: ...

    def get(self, result_id: CognitiveResultId) -> CognitiveResultEnvelope: ...

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[CognitiveResultEnvelope]: ...


__all__ = [
    "CognitiveResultStore",
    "ContextBundleStore",
    "ContextCatalog",
    "OutputContractRegistry",
    "OutputValidationResultStore",
    "PromptPackageStore",
    "PromptTemplateRegistry",
    "RetrievalResolutionStore",
    "StructuredOutputValidatorRegistry",
]
