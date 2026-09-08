"""Runtime store ports (STEP-011 §27..30).

Runtime depends on these ``Protocol``s, never on concrete persistence. In-memory
adapters live in ``packages/runtime/testing.py``.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..domain.ids import RuntimeRunId, RuntimeSessionId
from .contracts import ExecutionAttempt, RuntimeRun, RuntimeSession
from .events import RuntimeEvent


@runtime_checkable
class RuntimeSessionStore(Protocol):
    """Abstract store of RuntimeSession records."""

    def save(self, session: RuntimeSession) -> None:
        """Create. MUST reject duplicate session id."""
        ...

    def get(self, session_id: RuntimeSessionId) -> RuntimeSession: ...

    def list_for_project(self, project_id: object, branch_id: object) -> list[RuntimeSession]: ...

    def update(self, session: RuntimeSession) -> None:
        """Replace an existing session. MUST fail if not previously saved."""
        ...


@runtime_checkable
class RuntimeRunStore(Protocol):
    """Abstract store of RuntimeRun records."""

    def save(self, run: RuntimeRun) -> None:
        """Create. MUST reject duplicate run id."""
        ...

    def get(self, run_id: RuntimeRunId) -> RuntimeRun: ...

    def list_for_session(self, session_id: RuntimeSessionId) -> list[RuntimeRun]: ...

    def update(self, run: RuntimeRun) -> None:
        """Replace an existing run. MUST fail if not previously saved."""
        ...


@runtime_checkable
class ExecutionAttemptStore(Protocol):
    """Abstract store of ExecutionAttempt records."""

    def save(self, attempt: ExecutionAttempt) -> None:
        """Create. MUST reject duplicate attempt id."""
        ...

    def get(self, attempt_id: object) -> ExecutionAttempt: ...

    def list_for_run(self, run_id: RuntimeRunId) -> list[ExecutionAttempt]: ...

    def update(self, attempt: ExecutionAttempt) -> None:
        """Replace an existing attempt. MUST fail if not previously saved."""
        ...


@runtime_checkable
class RuntimeEventSink(Protocol):
    """Append-only outlet for RuntimeEvents (STEP-011 §26)."""

    def append(self, event: RuntimeEvent) -> None: ...

    def list_for_session(self, session_id: RuntimeSessionId) -> list[RuntimeEvent]: ...

    def list_for_run(self, run_id: RuntimeRunId) -> list[RuntimeEvent]: ...


__all__ = [
    "ExecutionAttemptStore",
    "ProviderExecutionRequestStore",
    "ProviderExecutionResponseStore",
    "RuntimeEventSink",
    "RuntimeRunStore",
    "RuntimeSessionStore",
]


@runtime_checkable
class ProviderExecutionRequestStore(Protocol):
    """Store of ProviderExecutionRequest records (STEP-012 §23)."""

    def save(self, request) -> None:  # type: ignore[no-untyped-def]
        ...

    def get(self, request_id):  # type: ignore[no-untyped-def]
        ...

    def list_for_run(self, run_id):  # type: ignore[no-untyped-def]
        ...


@runtime_checkable
class ProviderExecutionResponseStore(Protocol):
    """Store of ProviderExecutionResponse records (STEP-012 §24)."""

    def save(self, response) -> None:  # type: ignore[no-untyped-def]
        ...

    def get(self, response_id):  # type: ignore[no-untyped-def]
        ...

    def list_for_run(self, run_id):  # type: ignore[no-untyped-def]
        ...
