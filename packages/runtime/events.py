"""Runtime events — execution facts, NOT Research Domain Events (STEP-011 §23..25).

RuntimeEvent records what happened in the execution lifecycle. It is placed in
``packages.runtime`` and MUST NOT inherit DomainEvent or use ControlEventSink.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from ..domain.enums import ActorType
from ..domain.ids import (
    BranchId,
    ExecutionAttemptId,
    ProjectId,
    RuntimeEventId,
    RuntimeRunId,
    RuntimeSessionId,
)


class RuntimeEventType(StrEnum):
    """Runtime execution event types (STEP-011 §23)."""

    SESSION_CREATED = "SESSION_CREATED"
    SESSION_CLOSED = "SESSION_CLOSED"
    SESSION_CANCELLED = "SESSION_CANCELLED"

    RUN_CREATED = "RUN_CREATED"
    RUN_READY = "RUN_READY"
    RUN_STARTED = "RUN_STARTED"
    RUN_WAITING = "RUN_WAITING"
    RUN_RESUMED = "RUN_RESUMED"
    RUN_SUCCEEDED = "RUN_SUCCEEDED"
    RUN_FAILED = "RUN_FAILED"
    RUN_CANCELLED = "RUN_CANCELLED"
    RUN_TIMED_OUT = "RUN_TIMED_OUT"

    ATTEMPT_STARTED = "ATTEMPT_STARTED"
    ATTEMPT_SUCCEEDED = "ATTEMPT_SUCCEEDED"
    ATTEMPT_FAILED = "ATTEMPT_FAILED"
    ATTEMPT_CANCELLED = "ATTEMPT_CANCELLED"
    ATTEMPT_TIMED_OUT = "ATTEMPT_TIMED_OUT"

    PROVIDER_EXECUTION_STARTED = "PROVIDER_EXECUTION_STARTED"
    PROVIDER_EXECUTION_SUCCEEDED = "PROVIDER_EXECUTION_SUCCEEDED"
    PROVIDER_EXECUTION_FAILED = "PROVIDER_EXECUTION_FAILED"


@dataclass(frozen=True)
class RuntimeEvent:
    """An immutable execution-fact record (STEP-011 §24).

    NEVER contains Research State transition / GateResult / Hypothesis state.
    """

    event_id: RuntimeEventId
    event_type: RuntimeEventType

    session_id: RuntimeSessionId
    run_id: RuntimeRunId | None = None
    attempt_id: ExecutionAttemptId | None = None

    project_id: ProjectId | None = None
    branch_id: BranchId | None = None

    actor: ActorType = ActorType.SYSTEM

    occurred_at: datetime = field(default_factory=lambda: datetime.fromtimestamp(0))
    previous_status: str | None = None
    new_status: str | None = None

    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.occurred_at.tzinfo is None or self.occurred_at.utcoffset() is None:
            raise ValueError("occurred_at must be timezone-aware")


__all__ = ["RuntimeEvent", "RuntimeEventType"]
