"""Provider execution contracts (STEP-012).

The first real execution boundary in M3. Runtime treats provider input and
output as OPAQUE values — it does NOT import cognition, does NOT validate
cognitive output, and does NOT interpret research semantics.

Key invariant: Provider execution success ≠ Cognitive output validity.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Protocol, runtime_checkable

from ..domain.ids import (
    BranchId,
    ExecutionAttemptId,
    ProjectId,
    ProviderExecutionRequestId,
    ProviderExecutionResponseId,
    RuntimeArtifactId,
    RuntimeRunId,
    RuntimeSessionId,
)
from .contracts import RuntimeFailure, RuntimeInputRef


# =========================================================================
# Identifiers
# =========================================================================
@dataclass(frozen=True)
class ProviderIdentifier:
    """Runtime provider identity (not a closed enum — STEP-012 §6)."""

    name: str

    def __post_init__(self) -> None:
        if not self.name:
            raise ValueError("provider name must be non-empty")


@dataclass(frozen=True)
class ModelIdentifier:
    """Runtime model identity (STEP-012 §7). No model selection here."""

    name: str

    def __post_init__(self) -> None:
        if not self.name:
            raise ValueError("model name must be non-empty")


@dataclass(frozen=True)
class ProviderUsage:
    """Provider resource usage (STEP-012 §12). Units, not tokens."""

    input_units: int = 0
    output_units: int = 0

    def __post_init__(self) -> None:
        if self.input_units < 0:
            raise ValueError("input_units must be >= 0")
        if self.output_units < 0:
            raise ValueError("output_units must be >= 0")


# =========================================================================
# Request
# =========================================================================
@dataclass(frozen=True)
class ProviderExecutionRequest:
    """An immutable provider execution request (STEP-012 §9).

    ``projected_input: object`` is the explicit external boundary — Runtime
    does NOT interpret what it contains.
    """

    request_id: ProviderExecutionRequestId
    session_id: RuntimeSessionId
    run_id: RuntimeRunId
    attempt_id: ExecutionAttemptId

    project_id: ProjectId
    branch_id: BranchId

    provider: ProviderIdentifier
    model: ModelIdentifier

    input_ref: RuntimeInputRef
    projected_input: object

    created_at: datetime
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.created_at.tzinfo is None or self.created_at.utcoffset() is None:
            raise ValueError("created_at must be timezone-aware")


# =========================================================================
# Response
# =========================================================================
@dataclass(frozen=True)
class ProviderExecutionResponse:
    """An immutable provider execution response (STEP-012 §13).

    ``raw_output: object`` is UNTRUSTED PROVIDER OUTPUT. Runtime does NOT
    validate it against any OutputContract.
    """

    response_id: ProviderExecutionResponseId
    artifact_id: RuntimeArtifactId
    request_id: ProviderExecutionRequestId

    session_id: RuntimeSessionId
    run_id: RuntimeRunId
    attempt_id: ExecutionAttemptId

    project_id: ProjectId
    branch_id: BranchId

    provider: ProviderIdentifier
    model: ModelIdentifier

    provider_response_id: str | None = None
    raw_output: object = None
    finish_reason: str | None = None
    usage: ProviderUsage = field(default_factory=ProviderUsage)
    created_at: datetime = field(default_factory=lambda: datetime(1970, 1, 1, tzinfo=UTC))

    def __post_init__(self) -> None:
        if self.created_at.tzinfo is None or self.created_at.utcoffset() is None:
            raise ValueError("created_at must be timezone-aware")


# =========================================================================
# Outcome
# =========================================================================
class ProviderExecutionOutcomeStatus(StrEnum):
    """Whether provider execution succeeded or failed (STEP-012 §15)."""

    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


@dataclass(frozen=True)
class ProviderExecutionOutcome:
    """The result of one provider execution call (STEP-012 §16).

    Invariants:
        SUCCEEDED → response is not None, failure is None
        FAILED → response is None, failure is not None
    """

    status: ProviderExecutionOutcomeStatus
    response: ProviderExecutionResponse | None = None
    failure: RuntimeFailure | None = None

    def __post_init__(self) -> None:
        if self.status is ProviderExecutionOutcomeStatus.SUCCEEDED:
            if self.response is None:
                raise ValueError("SUCCEEDED outcome requires response")
            if self.failure is not None:
                raise ValueError("SUCCEEDED outcome must not have failure")
        else:
            if self.response is not None:
                raise ValueError("FAILED outcome must not have response")
            if self.failure is None:
                raise ValueError("FAILED outcome requires failure")


# =========================================================================
# Port
# =========================================================================
@runtime_checkable
class ProviderExecutionPort(Protocol):
    """Async I/O port for provider execution (STEP-012 §19).

    Lifecycle managers remain synchronous. Only this port is async — it is
    the external I/O boundary.
    """

    async def execute(
        self, request: ProviderExecutionRequest
    ) -> ProviderExecutionOutcome:
        ...


__all__ = [
    "ModelIdentifier",
    "ProviderExecutionOutcome",
    "ProviderExecutionOutcomeStatus",
    "ProviderExecutionPort",
    "ProviderExecutionRequest",
    "ProviderExecutionResponse",
    "ProviderIdentifier",
    "ProviderUsage",
]
