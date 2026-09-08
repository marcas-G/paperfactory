"""Agent Runtime core contracts (STEP-011).

Defines the immutable Runtime model: Session → Run → Attempt lifecycle,
failure taxonomy, input/output refs, and wait reasons. Runtime does NOT
understand research semantics or cognitive content — it only manages
execution lifecycle, audit, and state transitions.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import StrEnum

from ..domain.enums import ActorType
from ..domain.ids import (
    BranchId,
    ExecutionAttemptId,
    ProjectId,
    RuntimeRunId,
    RuntimeSessionId,
)
from .errors import (
    IllegalAttemptTransitionError,
    IllegalRunTransitionError,
    IllegalSessionTransitionError,
    RuntimeInvariantViolationError,
)


# =========================================================================
# Enums
# =========================================================================
class RuntimeSessionStatus(StrEnum):
    """Session lifecycle states (STEP-011 §7)."""

    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class RunStatus(StrEnum):
    """Run lifecycle states (STEP-011 §12)."""

    CREATED = "CREATED"
    READY = "READY"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMED_OUT = "TIMED_OUT"


class AttemptStatus(StrEnum):
    """Attempt lifecycle states (STEP-011 §19)."""

    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMED_OUT = "TIMED_OUT"


class RunWaitReason(StrEnum):
    """Why a Run is waiting (STEP-011 §14)."""

    MANUAL_PAUSE = "MANUAL_PAUSE"
    EXTERNAL_DEPENDENCY = "EXTERNAL_DEPENDENCY"


class RuntimeFailureCategory(StrEnum):
    """Classification of runtime failures (STEP-011 §16)."""

    NETWORK = "NETWORK"
    RATE_LIMIT = "RATE_LIMIT"
    TIMEOUT = "TIMEOUT"
    RESOURCE = "RESOURCE"
    PROVIDER = "PROVIDER"
    TOOL = "TOOL"
    INTERNAL = "INTERNAL"


# =========================================================================
# Transition maps
# =========================================================================
SESSION_TRANSITIONS: dict[RuntimeSessionStatus, frozenset[RuntimeSessionStatus]] = {
    RuntimeSessionStatus.OPEN: frozenset(
        {
            RuntimeSessionStatus.CLOSED,
            RuntimeSessionStatus.CANCELLED,
        }
    ),
    RuntimeSessionStatus.CLOSED: frozenset(),
    RuntimeSessionStatus.CANCELLED: frozenset(),
}

RUN_TRANSITIONS: dict[RunStatus, frozenset[RunStatus]] = {
    RunStatus.CREATED: frozenset({RunStatus.READY}),
    RunStatus.READY: frozenset({RunStatus.RUNNING, RunStatus.CANCELLED}),
    RunStatus.RUNNING: frozenset(
        {
            RunStatus.WAITING,
            RunStatus.SUCCEEDED,
            RunStatus.FAILED,
            RunStatus.CANCELLED,
            RunStatus.TIMED_OUT,
        }
    ),
    RunStatus.WAITING: frozenset(
        {
            RunStatus.RUNNING,
            RunStatus.CANCELLED,
            RunStatus.TIMED_OUT,
        }
    ),
    RunStatus.SUCCEEDED: frozenset(),
    RunStatus.FAILED: frozenset(),
    RunStatus.CANCELLED: frozenset(),
    RunStatus.TIMED_OUT: frozenset(),
}

ATTEMPT_TRANSITIONS: dict[AttemptStatus, frozenset[AttemptStatus]] = {
    AttemptStatus.RUNNING: frozenset(
        {
            AttemptStatus.SUCCEEDED,
            AttemptStatus.FAILED,
            AttemptStatus.CANCELLED,
            AttemptStatus.TIMED_OUT,
        }
    ),
    AttemptStatus.SUCCEEDED: frozenset(),
    AttemptStatus.FAILED: frozenset(),
    AttemptStatus.CANCELLED: frozenset(),
    AttemptStatus.TIMED_OUT: frozenset(),
}

SESSION_TERMINAL = frozenset({RuntimeSessionStatus.CLOSED, RuntimeSessionStatus.CANCELLED})
RUN_TERMINAL = frozenset(
    {
        RunStatus.SUCCEEDED,
        RunStatus.FAILED,
        RunStatus.CANCELLED,
        RunStatus.TIMED_OUT,
    }
)
RUN_NON_TERMINAL = frozenset(
    {
        RunStatus.CREATED,
        RunStatus.READY,
        RunStatus.RUNNING,
        RunStatus.WAITING,
    }
)
ATTEMPT_TERMINAL = frozenset(
    {
        AttemptStatus.SUCCEEDED,
        AttemptStatus.FAILED,
        AttemptStatus.CANCELLED,
        AttemptStatus.TIMED_OUT,
    }
)


# =========================================================================
# Refs
# =========================================================================
@dataclass(frozen=True)
class RuntimeInputRef:
    """Opaque reference to a runtime input artifact (STEP-011 §10)."""

    source_type: str
    source_id: str
    version: str

    def __post_init__(self) -> None:
        for name, val in (
            ("source_type", self.source_type),
            ("source_id", self.source_id),
            ("version", self.version),
        ):
            if not val:
                raise ValueError(f"RuntimeInputRef {name} must be non-empty")


@dataclass(frozen=True)
class RuntimeOutputRef:
    """Opaque reference to a runtime output artifact (STEP-011 §11)."""

    artifact_type: str
    artifact_id: str
    version: str

    def __post_init__(self) -> None:
        for name, val in (
            ("artifact_type", self.artifact_type),
            ("artifact_id", self.artifact_id),
            ("version", self.version),
        ):
            if not val:
                raise ValueError(f"RuntimeOutputRef {name} must be non-empty")


# =========================================================================
# Failure
# =========================================================================
@dataclass(frozen=True)
class RuntimeFailure:
    """Classification of a runtime execution failure (STEP-011 §17).

    ``transient`` is only a hint for a FUTURE retry policy — the Runtime Core
    does NOT automatically retry (§22/§58).
    """

    category: RuntimeFailureCategory
    code: str
    message: str
    transient: bool = False
    details: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.code:
            raise ValueError("RuntimeFailure code must be non-empty")
        if not self.message:
            raise ValueError("RuntimeFailure message must be non-empty")


# =========================================================================
# Session
# =========================================================================
@dataclass(frozen=True)
class RuntimeSession:
    """An immutable RuntimeSession (STEP-011 §8).

    Scopes runs to a single (project_id, branch_id). Does NOT hold
    ResearchState / ContextBundle / PromptPackage / chat history.
    """

    session_id: RuntimeSessionId
    project_id: ProjectId
    branch_id: BranchId
    status: RuntimeSessionStatus
    created_by: ActorType
    created_at: datetime

    closed_by: ActorType | None = None
    closed_at: datetime | None = None
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.status is RuntimeSessionStatus.OPEN:
            if self.closed_by is not None or self.closed_at is not None:
                raise RuntimeInvariantViolationError(
                    "OPEN session must have closed_by=None and closed_at=None"
                )
        else:
            if self.closed_by is None or self.closed_at is None:
                raise RuntimeInvariantViolationError(
                    f"{self.status.value} session must have closed_by and closed_at"
                )
        _check_tz(self.created_at, "created_at")
        if self.closed_at is not None:
            _check_tz(self.closed_at, "closed_at")

    def with_status(
        self,
        new_status: RuntimeSessionStatus,
        *,
        closed_by: ActorType,
        closed_at: datetime,
    ) -> RuntimeSession:
        _assert_transition(
            "session", SESSION_TRANSITIONS, self.status, new_status, IllegalSessionTransitionError
        )
        return replace(self, status=new_status, closed_by=closed_by, closed_at=closed_at)

    def is_terminal(self) -> bool:
        return self.status in SESSION_TERMINAL


# =========================================================================
# Run
# =========================================================================
@dataclass(frozen=True)
class RuntimeRun:
    """An immutable RuntimeRun (STEP-011 §15)."""

    run_id: RuntimeRunId
    session_id: RuntimeSessionId
    project_id: ProjectId
    branch_id: BranchId
    status: RunStatus
    input_ref: RuntimeInputRef

    created_by: ActorType
    created_at: datetime

    started_at: datetime | None = None
    completed_at: datetime | None = None
    wait_reason: RunWaitReason | None = None
    output_ref: RuntimeOutputRef | None = None
    failure: RuntimeFailure | None = None
    attempt_count: int = 0
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.attempt_count < 0:
            raise RuntimeInvariantViolationError("attempt_count must be >= 0")
        for name, val in (("created_at", self.created_at),):
            _check_tz(val, name)
        if self.started_at is not None:
            _check_tz(self.started_at, "started_at")
        if self.completed_at is not None:
            _check_tz(self.completed_at, "completed_at")
        _validate_run_invariants(self)

    def with_status(
        self,
        new_status: RunStatus,
        *,
        now: datetime,
        wait_reason: RunWaitReason | None = None,
        output_ref: RuntimeOutputRef | None = None,
        failure: RuntimeFailure | None = None,
    ) -> RuntimeRun:
        _assert_transition(
            "run", RUN_TRANSITIONS, self.status, new_status, IllegalRunTransitionError
        )
        started_at = self.started_at
        completed_at = self.completed_at
        new_wait_reason = wait_reason
        new_output = output_ref or self.output_ref
        new_failure = failure

        if new_status is RunStatus.RUNNING and started_at is None:
            started_at = now
        if new_status in RUN_TERMINAL:
            completed_at = now
            new_wait_reason = None
        if new_status is RunStatus.WAITING and new_wait_reason is None:
            raise IllegalRunTransitionError("WAITING requires wait_reason")
        if new_status is RunStatus.RUNNING:
            new_wait_reason = None

        return replace(
            self,
            status=new_status,
            started_at=started_at,
            completed_at=completed_at,
            wait_reason=new_wait_reason,
            output_ref=new_output,
            failure=new_failure,
        )

    def is_terminal(self) -> bool:
        return self.status in RUN_TERMINAL


# =========================================================================
# Attempt
# =========================================================================
@dataclass(frozen=True)
class ExecutionAttempt:
    """An immutable ExecutionAttempt (STEP-011 §20)."""

    attempt_id: ExecutionAttemptId
    run_id: RuntimeRunId
    attempt_number: int
    status: AttemptStatus
    started_at: datetime

    completed_at: datetime | None = None
    output_ref: RuntimeOutputRef | None = None
    failure: RuntimeFailure | None = None
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.attempt_number < 1:
            raise RuntimeInvariantViolationError("attempt_number must be >= 1")
        _check_tz(self.started_at, "started_at")
        if self.completed_at is not None:
            _check_tz(self.completed_at, "completed_at")
        _validate_attempt_invariants(self)

    def with_status(
        self,
        new_status: AttemptStatus,
        *,
        now: datetime,
        output_ref: RuntimeOutputRef | None = None,
        failure: RuntimeFailure | None = None,
    ) -> ExecutionAttempt:
        _assert_transition(
            "attempt", ATTEMPT_TRANSITIONS, self.status, new_status, IllegalAttemptTransitionError
        )
        completed = self.completed_at
        if new_status in ATTEMPT_TERMINAL:
            completed = now
        return replace(
            self,
            status=new_status,
            completed_at=completed,
            output_ref=output_ref or self.output_ref,
            failure=failure,
        )

    def is_terminal(self) -> bool:
        return self.status in ATTEMPT_TERMINAL


# =========================================================================
# Helpers
# =========================================================================
def _check_tz(dt: datetime, name: str) -> None:
    if dt.tzinfo is None or dt.utcoffset() is None:
        raise RuntimeInvariantViolationError(f"{name} must be timezone-aware")


def _assert_transition(label, table, current, target, exc_cls) -> None:  # type: ignore[no-untyped-def]
    allowed = table.get(current, frozenset())
    if target not in allowed:
        raise exc_cls(f"illegal {label} transition: {current.value} -> {target.value}")


def _validate_run_invariants(run: RuntimeRun) -> None:
    s = run.status
    if s in (RunStatus.CREATED, RunStatus.READY):
        if run.started_at is not None or run.completed_at is not None:
            raise RuntimeInvariantViolationError(
                f"{s.value} run must have started_at=None and completed_at=None"
            )
    elif s is RunStatus.RUNNING:
        if run.started_at is None or run.completed_at is not None:
            raise RuntimeInvariantViolationError(
                "RUNNING run: started_at required, completed_at=None"
            )
        if run.failure is not None:
            raise RuntimeInvariantViolationError("RUNNING run must not have failure")
    elif s is RunStatus.WAITING:
        if run.started_at is None or run.completed_at is not None:
            raise RuntimeInvariantViolationError(
                "WAITING run: started_at required, completed_at=None"
            )
        if run.wait_reason is None:
            raise RuntimeInvariantViolationError("WAITING run requires wait_reason")
    elif s is RunStatus.SUCCEEDED:
        if run.completed_at is None or run.failure is not None:
            raise RuntimeInvariantViolationError(
                "SUCCEEDED run: completed_at required, failure=None"
            )
    elif s is RunStatus.FAILED:
        if run.completed_at is None or run.failure is None:
            raise RuntimeInvariantViolationError("FAILED run: completed_at and failure required")
    elif s in (RunStatus.CANCELLED, RunStatus.TIMED_OUT):
        if run.completed_at is None:
            raise RuntimeInvariantViolationError(f"{s.value} run: completed_at required")
    if s in RUN_TERMINAL and run.wait_reason is not None:
        raise RuntimeInvariantViolationError(f"{s.value} run must have wait_reason=None")


def _validate_attempt_invariants(att: ExecutionAttempt) -> None:
    s = att.status
    if s is AttemptStatus.RUNNING:
        if att.completed_at is not None or att.failure is not None:
            raise RuntimeInvariantViolationError("RUNNING attempt: completed_at=None, failure=None")
    elif s is AttemptStatus.SUCCEEDED:
        if att.completed_at is None or att.failure is not None:
            raise RuntimeInvariantViolationError(
                "SUCCEEDED attempt: completed_at required, failure=None"
            )
    elif s is AttemptStatus.FAILED:
        if att.completed_at is None or att.failure is None:
            raise RuntimeInvariantViolationError(
                "FAILED attempt: completed_at and failure required"
            )
    elif s in (AttemptStatus.CANCELLED, AttemptStatus.TIMED_OUT):
        if att.completed_at is None:
            raise RuntimeInvariantViolationError(f"{s.value} attempt: completed_at required")


__all__ = [
    "ATTEMPT_TERMINAL",
    "ATTEMPT_TRANSITIONS",
    "AttemptStatus",
    "ExecutionAttempt",
    "RUN_NON_TERMINAL",
    "RUN_TERMINAL",
    "RUN_TRANSITIONS",
    "RunStatus",
    "RunWaitReason",
    "RuntimeFailure",
    "RuntimeFailureCategory",
    "RuntimeInputRef",
    "RuntimeOutputRef",
    "RuntimeRun",
    "RuntimeSession",
    "RuntimeSessionStatus",
    "SESSION_TERMINAL",
    "SESSION_TRANSITIONS",
]
