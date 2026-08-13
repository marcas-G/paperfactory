"""In-memory cognitive adapters — test/dev only.

NOT Domain objects, NOT production persistence adapters. They exist so the
cognitive kernel can be exercised end-to-end without a database (STEP-006 §31,
STEP-007 §8/§37, ADR-003). Production code MUST NOT depend on them; only tests
and dev harnesses import from here.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import cast

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
from .context import ContextBundle, ContextItem, ContextScope
from .errors import CognitionError, DuplicateOutputContractError
from .output import (
    CognitiveResultEnvelope,
    OutputContract,
    OutputSchemaRef,
    OutputValidationResult,
    SchemaValidationIssue,
    SchemaValidationOutcome,
    StructuredOutputValidator,
)
from .prompt import PromptPackage, PromptTemplate
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


class InMemoryPromptTemplateRegistry:
    """In-memory PromptTemplateRegistry adapter (test/dev only).

    ``(template_id, version)`` is unique; duplicate registration is rejected.
    """

    def __init__(self) -> None:
        self._templates: dict[tuple[PromptTemplateId, int], PromptTemplate] = {}

    def register(self, template: PromptTemplate) -> None:
        key = (template.template_id, template.version)
        if key in self._templates:
            raise CognitionError(
                f"template already registered: {template.template_id}@v{template.version}"
            )
        self._templates[key] = template

    def get(self, template_id: PromptTemplateId, version: int) -> PromptTemplate:
        return self._templates[(template_id, version)]

    def list_versions(self, template_id: PromptTemplateId) -> list[int]:
        return sorted(v for (tid, v) in self._templates if tid == template_id)


class InMemoryPromptPackageStore:
    """In-memory PromptPackageStore adapter (test/dev only)."""

    def __init__(self) -> None:
        self._packages: dict[PromptPackageId, PromptPackage] = {}

    def save(self, package: PromptPackage) -> None:
        if package.package_id in self._packages:
            raise CognitionError(f"package already saved: {package.package_id}")
        self._packages[package.package_id] = package

    def get(self, package_id: PromptPackageId) -> PromptPackage:
        return self._packages[package_id]

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[PromptPackage]:
        return [
            p
            for p in self._packages.values()
            if p.project_id == project_id and p.branch_id == branch_id
        ]


class InMemoryOutputContractRegistry:
    """In-memory OutputContractRegistry adapter (test/dev only)."""

    def __init__(self) -> None:
        self._contracts: dict[tuple[OutputContractId, int], OutputContract] = {}

    def register(self, contract: OutputContract) -> None:
        key = (contract.contract_id, contract.version)
        if key in self._contracts:
            raise DuplicateOutputContractError(
                f"contract already registered: {contract.contract_id}@v{contract.version}"
            )
        self._contracts[key] = contract

    def get(self, contract_id: OutputContractId, version: int) -> OutputContract:
        return self._contracts[(contract_id, version)]

    def list_versions(self, contract_id: OutputContractId) -> list[int]:
        return sorted(v for (cid, v) in self._contracts if cid == contract_id)


class InMemoryStructuredOutputValidatorRegistry:
    """In-memory StructuredOutputValidatorRegistry adapter (test/dev only)."""

    def __init__(self) -> None:
        self._validators: dict[tuple[OutputSchemaId, int], StructuredOutputValidator] = {}

    def register(self, validator: StructuredOutputValidator) -> None:
        key = (validator.schema_ref.schema_id, validator.schema_ref.version)
        if key in self._validators:
            raise CognitionError(
                f"validator already registered: "
                f"{validator.schema_ref.schema_id}@v{validator.schema_ref.version}"
            )
        self._validators[key] = validator

    def get(self, schema_id: OutputSchemaId, version: int) -> StructuredOutputValidator:
        return self._validators[(schema_id, version)]


class InMemoryOutputValidationResultStore:
    """In-memory OutputValidationResultStore adapter (test/dev only)."""

    def __init__(self) -> None:
        self._results: dict[OutputValidationId, OutputValidationResult] = {}

    def save(self, result: OutputValidationResult) -> None:
        if result.validation_id in self._results:
            raise CognitionError(f"validation already saved: {result.validation_id}")
        self._results[result.validation_id] = result

    def get(self, validation_id: OutputValidationId) -> OutputValidationResult:
        return self._results[validation_id]

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[OutputValidationResult]:
        return [
            r
            for r in self._results.values()
            if r.project_id == project_id and r.branch_id == branch_id
        ]


class InMemoryCognitiveResultStore:
    """In-memory CognitiveResultStore adapter (test/dev only)."""

    def __init__(self) -> None:
        self._results: dict[CognitiveResultId, CognitiveResultEnvelope] = {}

    def save(self, result: CognitiveResultEnvelope) -> None:
        if result.result_id in self._results:
            raise CognitionError(f"cognitive result already saved: {result.result_id}")
        self._results[result.result_id] = result

    def get(self, result_id: CognitiveResultId) -> CognitiveResultEnvelope:
        return self._results[result_id]

    def list_for_project(
        self, project_id: ProjectId | None, branch_id: BranchId | None
    ) -> list[CognitiveResultEnvelope]:
        return [
            r
            for r in self._results.values()
            if r.project_id == project_id and r.branch_id == branch_id
        ]


# =========================================================================
# Test-only example schema + validator (STEP-010 §40/§41)
# =========================================================================


@dataclass(frozen=True)
class ExampleCognitiveAssessment:
    """Neutral test-only result type. NOT a production cognition contract."""

    judgement: str
    confidence: float
    reason_codes: tuple[str, ...] = ()


_JUDGEMENTS = frozenset({"SUPPORT", "CONTRADICT", "INCONCLUSIVE"})


class ExampleCognitiveAssessmentValidator:
    """Test-only validator for ExampleCognitiveAssessment.

    Rules: judgement in {SUPPORT, CONTRADICT, INCONCLUSIVE};
    0 <= confidence <= 1; reason_codes is a tuple of non-empty strings.
    strict=True rejects unknown fields; strict=False ignores them (but the
    normalized payload never includes them). Issue order is fixed by schema
    traversal order (judgement, confidence, reason_codes).
    """

    schema_ref = OutputSchemaRef(OutputSchemaId("example-assessment"), 1)

    def validate(
        self, payload: object, contract: OutputContract
    ) -> SchemaValidationOutcome:
        issues: list[SchemaValidationIssue] = []
        if not isinstance(payload, Mapping):
            return SchemaValidationOutcome(
                valid=False,
                normalized_payload=None,
                issues=(
                    SchemaValidationIssue("NOT_OBJECT", (), "payload must be a mapping"),
                ),
            )
        data: Mapping = payload
        known = {"judgement", "confidence", "reason_codes"}
        if contract.strict:
            for key in data:
                if key not in known:
                    issues.append(
                        SchemaValidationIssue("UNKNOWN_FIELD", (key,), "unknown field")
                    )

        judgement = cast(object, data.get("judgement"))
        if judgement not in _JUDGEMENTS:
            issues.append(
                SchemaValidationIssue("INVALID_JUDGEMENT", ("judgement",), "bad judgement")
            )

        confidence = cast(object, data.get("confidence"))
        if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
            issues.append(
                SchemaValidationIssue(
                    "INVALID_CONFIDENCE_TYPE",
                    ("confidence",),
                    "confidence must be a number",
                )
            )
        elif confidence < 0.0 or confidence > 1.0:
            issues.append(
                SchemaValidationIssue(
                    "CONFIDENCE_OUT_OF_RANGE",
                    ("confidence",),
                    "confidence out of range",
                )
            )

        reason_codes = cast(object, data.get("reason_codes"))
        if not isinstance(reason_codes, (list, tuple)):
            issues.append(
                SchemaValidationIssue(
                    "INVALID_REASON_CODES",
                    ("reason_codes",),
                    "reason_codes must be a list",
                )
            )
        else:
            for idx, code in enumerate(reason_codes):
                if not isinstance(code, str) or not code:
                    issues.append(
                        SchemaValidationIssue(
                            "EMPTY_REASON_CODE",
                            ("reason_codes", idx),
                            "reason code must be non-empty",
                        )
                    )

        if issues:
            return SchemaValidationOutcome(
                valid=False, normalized_payload=None, issues=tuple(issues)
            )

        # Narrowed for type checkers; guaranteed by the validation above.
        assert isinstance(judgement, str)
        assert isinstance(confidence, (int, float)) and not isinstance(confidence, bool)
        assert isinstance(reason_codes, (list, tuple))

        normalized = ExampleCognitiveAssessment(
            judgement=judgement,
            confidence=float(confidence),
            reason_codes=tuple(str(c) for c in reason_codes),
        )
        return SchemaValidationOutcome(valid=True, normalized_payload=normalized, issues=())


__all__ = [
    "ExampleCognitiveAssessment",
    "ExampleCognitiveAssessmentValidator",
    "InMemoryCognitiveResultStore",
    "InMemoryContextBundleStore",
    "InMemoryContextCatalog",
    "InMemoryOutputContractRegistry",
    "InMemoryOutputValidationResultStore",
    "InMemoryPromptPackageStore",
    "InMemoryPromptTemplateRegistry",
    "InMemoryRetrievalResolutionStore",
    "InMemoryStructuredOutputValidatorRegistry",
]
