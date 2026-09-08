"""Structured output contracts (STEP-010).

The output side of the Cognitive Control Plane: a versioned OutputContract
declares "what structure is a legal cognitive result", an untrusted
StructuredOutputCandidate carries the raw model output, and a validated
CognitiveResultEnvelope carries the normalized typed result.

Model output is UNTRUSTED until validated against the versioned
OutputContract (STEP-010 §4). Validation does not mutate Research State and
does not authorize anything (STEP-010 §30/§62).

No universal output schema: each cognitive task has its own typed result.
This module provides the schema/validator infrastructure only; the test-only
ExampleCognitiveAssessment lives in ``packages/cognition/testing.py``.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Protocol, runtime_checkable

from ..domain.ids import (
    ActionId,
    BranchId,
    CognitiveResultId,
    OutputCandidateId,
    OutputContractId,
    OutputSchemaId,
    OutputValidationId,
    ProjectId,
    PromptPackageId,
)
from .errors import InvalidOutputContractError, InvalidSchemaValidationOutcomeError
from .provider import ProviderKind


@dataclass(frozen=True)
class OutputSchemaRef:
    """A provider-neutral reference to a logical structured output schema
    (STEP-010 §6). No JSON Schema / Pydantic / OpenAPI here."""

    schema_id: OutputSchemaId
    version: int

    def __post_init__(self) -> None:
        if not self.schema_id:
            raise InvalidOutputContractError("schema_id must be non-empty")
        if self.version < 1:
            raise InvalidOutputContractError("schema version must be >= 1")


@dataclass(frozen=True)
class OutputContract:
    """A versioned declaration of the legal output structure (STEP-010 §7).

    NOT a PromptTemplate, NOT a provider response_format, NOT a concrete model
    class. Just identity + schema ref + strict flag + description.
    """

    contract_id: OutputContractId
    version: int
    schema_ref: OutputSchemaRef
    strict: bool
    description: str
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.contract_id:
            raise InvalidOutputContractError("contract_id must be non-empty")
        if self.version < 1:
            raise InvalidOutputContractError("contract version must be >= 1")
        if not self.description or not self.description.strip():
            raise InvalidOutputContractError("description must be non-empty")


@dataclass(frozen=True)
class StructuredOutputCandidate:
    """An UNTRUSTED raw model output awaiting validation (STEP-010 §15).

    ``payload`` is an external, untrusted object — it must NOT spread into the
    system as ``dict[str, Any]``; it becomes a typed normalized value only
    after validation (STEP-010 §9/§29).
    """

    candidate_id: OutputCandidateId
    project_id: ProjectId | None
    branch_id: BranchId | None
    state_revision: int
    action_id: ActionId | None
    cognitive_mode: str

    prompt_package_id: PromptPackageId

    output_contract_id: OutputContractId
    output_contract_version: int

    payload: object

    provider: ProviderKind | None = None
    model_identifier: str | None = None

    created_at: datetime = field(default_factory=lambda: _EPOCH)

    def __post_init__(self) -> None:
        if self.created_at.tzinfo is None or self.created_at.utcoffset() is None:
            raise InvalidOutputContractError("created_at must be timezone-aware")


@dataclass(frozen=True)
class SchemaValidationIssue:
    """One deterministic validation problem (STEP-010 §11).

    Control code decides on ``code`` / ``path``, NEVER on ``message`` text.
    """

    code: str
    path: tuple = ()
    message: str = ""

    def __post_init__(self) -> None:
        if not self.code or not self.code.strip():
            raise InvalidSchemaValidationOutcomeError("issue code must be non-empty")


@runtime_checkable
class StructuredOutputValidator(Protocol):
    """A schema validator (STEP-010 §9).

    ``schema_ref`` identifies the schema it validates. ``validate`` takes the
    untrusted raw ``payload`` (object) and returns a typed SchemaValidationOutcome.
    """

    schema_ref: OutputSchemaRef

    def validate(
        self,
        payload: object,
        contract: OutputContract,
    ) -> SchemaValidationOutcome: ...


@dataclass(frozen=True)
class SchemaValidationOutcome:
    """A validator's result (STEP-010 §12).

    Invariants:
        valid=True  -> normalized_payload is not None and issues == ()
        valid=False -> normalized_payload is None and issues non-empty
    """

    valid: bool
    normalized_payload: object | None
    issues: tuple[SchemaValidationIssue, ...] = ()

    def __post_init__(self) -> None:
        if self.valid:
            if self.normalized_payload is None:
                raise InvalidSchemaValidationOutcomeError("valid=True requires normalized_payload")
            if self.issues:
                raise InvalidSchemaValidationOutcomeError("valid=True must have no issues")
        else:
            if self.normalized_payload is not None:
                raise InvalidSchemaValidationOutcomeError(
                    "valid=False requires normalized_payload=None"
                )
            if not self.issues:
                raise InvalidSchemaValidationOutcomeError(
                    "valid=False must have at least one issue"
                )


class OutputValidationStatus(StrEnum):
    """Whether a candidate conforms to its OutputContract (STEP-010 §26).

    Only VALID / INVALID — this is "does it conform", NOT a research judgement.
    """

    VALID = "VALID"
    INVALID = "INVALID"


@dataclass(frozen=True)
class OutputValidationResult:
    """The audit record of one validation (STEP-010 §27)."""

    validation_id: OutputValidationId
    candidate_id: OutputCandidateId

    project_id: ProjectId | None
    branch_id: BranchId | None
    state_revision: int

    action_id: ActionId | None
    cognitive_mode: str
    prompt_package_id: PromptPackageId

    output_contract_id: OutputContractId
    output_contract_version: int
    schema_ref: OutputSchemaRef

    status: OutputValidationStatus
    issues: tuple[SchemaValidationIssue, ...]

    cognitive_result_id: CognitiveResultId | None
    validated_at: datetime

    def __post_init__(self) -> None:
        if self.status is OutputValidationStatus.VALID:
            if self.issues:
                raise InvalidSchemaValidationOutcomeError("VALID must have no issues")
            if self.cognitive_result_id is None:
                raise InvalidSchemaValidationOutcomeError("VALID requires result_id")
        else:
            if not self.issues:
                raise InvalidSchemaValidationOutcomeError("INVALID must have issues")
            if self.cognitive_result_id is not None:
                raise InvalidSchemaValidationOutcomeError("INVALID must have no result_id")


@dataclass(frozen=True)
class CognitiveResultEnvelope:
    """A validated, normalized cognitive result (STEP-010 §28).

    ``payload`` is the validator's normalized typed value — NOT the raw
    candidate payload. It is an execution artifact, NOT Research State and NOT
    authorization.
    """

    result_id: CognitiveResultId
    candidate_id: OutputCandidateId
    validation_id: OutputValidationId

    project_id: ProjectId | None
    branch_id: BranchId | None
    state_revision: int

    action_id: ActionId | None
    cognitive_mode: str
    prompt_package_id: PromptPackageId

    output_contract_id: OutputContractId
    output_contract_version: int
    schema_ref: OutputSchemaRef

    payload: object

    provider: ProviderKind | None
    model_identifier: str | None

    validated_at: datetime


# Placeholder tz-aware epoch for the dataclass default only; the validation
# engine always supplies a real timestamp.
_EPOCH: datetime = datetime(1970, 1, 1, tzinfo=UTC)


__all__ = [
    "CognitiveResultEnvelope",
    "OutputContract",
    "OutputSchemaRef",
    "OutputValidationResult",
    "OutputValidationStatus",
    "SchemaValidationIssue",
    "SchemaValidationOutcome",
    "StructuredOutputCandidate",
    "StructuredOutputValidator",
]
