"""In-memory runtime adapters — test/dev only (STEP-011 §27..30).

NOT production persistence. save() rejects duplicates; update() rejects
missing IDs — never silent upsert.
"""

from __future__ import annotations

from ..domain.ids import ExecutionAttemptId, RuntimeRunId, RuntimeSessionId
from .contracts import ExecutionAttempt, RuntimeRun, RuntimeSession
from .errors import DuplicateRuntimeObjectError, RuntimeObjectNotFoundError
from .events import RuntimeEvent


class InMemoryRuntimeSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[RuntimeSessionId, RuntimeSession] = {}

    def save(self, session: RuntimeSession) -> None:
        if session.session_id in self._sessions:
            raise DuplicateRuntimeObjectError(f"session already saved: {session.session_id}")
        self._sessions[session.session_id] = session

    def get(self, session_id: RuntimeSessionId) -> RuntimeSession:
        return self._sessions[session_id]

    def list_for_project(self, project_id, branch_id):  # type: ignore[no-untyped-def]
        return [
            s for s in self._sessions.values()
            if s.project_id == project_id and s.branch_id == branch_id
        ]

    def update(self, session: RuntimeSession) -> None:
        if session.session_id not in self._sessions:
            raise RuntimeObjectNotFoundError(f"session not found: {session.session_id}")
        self._sessions[session.session_id] = session


class InMemoryRuntimeRunStore:
    def __init__(self) -> None:
        self._runs: dict[RuntimeRunId, RuntimeRun] = {}

    def save(self, run: RuntimeRun) -> None:
        if run.run_id in self._runs:
            raise DuplicateRuntimeObjectError(f"run already saved: {run.run_id}")
        self._runs[run.run_id] = run

    def get(self, run_id: RuntimeRunId) -> RuntimeRun:
        return self._runs[run_id]

    def list_for_session(self, session_id: RuntimeSessionId) -> list[RuntimeRun]:
        return [r for r in self._runs.values() if r.session_id == session_id]

    def update(self, run: RuntimeRun) -> None:
        if run.run_id not in self._runs:
            raise RuntimeObjectNotFoundError(f"run not found: {run.run_id}")
        self._runs[run.run_id] = run


class InMemoryExecutionAttemptStore:
    def __init__(self) -> None:
        self._attempts: dict[ExecutionAttemptId, ExecutionAttempt] = {}

    def save(self, attempt: ExecutionAttempt) -> None:
        if attempt.attempt_id in self._attempts:
            raise DuplicateRuntimeObjectError(f"attempt already saved: {attempt.attempt_id}")
        self._attempts[attempt.attempt_id] = attempt

    def get(self, attempt_id):  # type: ignore[no-untyped-def]
        return self._attempts[attempt_id]

    def list_for_run(self, run_id: RuntimeRunId) -> list[ExecutionAttempt]:
        return [a for a in self._attempts.values() if a.run_id == run_id]

    def update(self, attempt: ExecutionAttempt) -> None:
        if attempt.attempt_id not in self._attempts:
            raise RuntimeObjectNotFoundError(f"attempt not found: {attempt.attempt_id}")
        self._attempts[attempt.attempt_id] = attempt


class InMemoryRuntimeEventSink:
    def __init__(self) -> None:
        self._events: list[RuntimeEvent] = []

    def append(self, event: RuntimeEvent) -> None:
        self._events.append(event)

    def list_for_session(self, session_id: RuntimeSessionId) -> list[RuntimeEvent]:
        return [e for e in self._events if e.session_id == session_id]

    def list_for_run(self, run_id: RuntimeRunId) -> list[RuntimeEvent]:
        return [e for e in self._events if e.run_id == run_id]


__all__ = [
    "FakeProviderExecutor",
    "InMemoryExecutionAttemptStore",
    "InMemoryRuntimeEventSink",
    "InMemoryRuntimeRunStore",
    "InMemoryRuntimeSessionStore",
    "InMemoryProviderExecutionRequestStore",
    "InMemoryProviderExecutionResponseStore",
]


# =========================================================================
# Provider Execution Stores + Fake Executor
# =========================================================================
class InMemoryProviderExecutionRequestStore:
    def __init__(self) -> None:
        self._records = {}

    def save(self, request) -> None:  # type: ignore[no-untyped-def]
        rid = request.request_id
        if rid in self._records:
            raise DuplicateRuntimeObjectError(f"request already saved: {rid}")
        self._records[rid] = request

    def get(self, request_id):  # type: ignore[no-untyped-def]
        return self._records[request_id]

    def list_for_run(self, run_id):  # type: ignore[no-untyped-def]
        return [r for r in self._records.values() if r.run_id == run_id]


class InMemoryProviderExecutionResponseStore:
    def __init__(self) -> None:
        self._records = {}

    def save(self, response) -> None:  # type: ignore[no-untyped-def]
        rid = response.response_id
        if rid in self._records:
            raise DuplicateRuntimeObjectError(f"response already saved: {rid}")
        self._records[rid] = response

    def get(self, response_id):  # type: ignore[no-untyped-def]
        return self._records[response_id]

    def list_for_run(self, run_id):  # type: ignore[no-untyped-def]
        return [r for r in self._records.values() if r.run_id == run_id]


class _FakeSuccess:
    """Internal marker for FakeProviderExecutor scripted success."""

    def __init__(self, raw_output):  # type: ignore[no-untyped-def]
        self.raw_output = raw_output


class FakeProviderExecutor:
    """Deterministic scripted provider executor (STEP-012 §21).

    Consumes outcomes in order. Raises on exhaustion.
    """

    def __init__(self, outcomes):  # type: ignore[no-untyped-def]
        self._outcomes = list(outcomes)
        self._index = 0
        self.calls: list = []

    async def execute(self, request):  # type: ignore[no-untyped-def]
        from ..domain.ids import (
            ProviderExecutionResponseId,
            RuntimeArtifactId,
        )
        from .provider import (
            ProviderExecutionOutcome,
            ProviderExecutionOutcomeStatus,
            ProviderExecutionResponse,
            ProviderUsage,
        )

        self.calls.append(request)
        if self._index >= len(self._outcomes):
            raise RuntimeError(
                f"FakeProviderExecutor: outcomes exhausted "
                f"(consumed {self._index})"
            )
        item = self._outcomes[self._index]
        self._index += 1

        if isinstance(item, _FakeSuccess):
            resp = ProviderExecutionResponse(
                response_id=ProviderExecutionResponseId(
                    f"resp-{self._index}"
                ),
                artifact_id=RuntimeArtifactId(f"art-{self._index}"),
                request_id=request.request_id,
                session_id=request.session_id,
                run_id=request.run_id,
                attempt_id=request.attempt_id,
                project_id=request.project_id,
                branch_id=request.branch_id,
                provider=request.provider,
                model=request.model,
                raw_output=item.raw_output,
                usage=ProviderUsage(input_units=10, output_units=20),
            )
            return ProviderExecutionOutcome(
                status=ProviderExecutionOutcomeStatus.SUCCEEDED,
                response=resp,
            )
        # Already a proper ProviderExecutionOutcome (FAILED)
        return item

    @staticmethod
    def success(raw_output):  # type: ignore[no-untyped-def]
        """Helper to create a SUCCEEDED outcome marker."""
        return _FakeSuccess(raw_output)

    @staticmethod
    def failure(failure):  # type: ignore[no-untyped-def]
        """Helper to create a FAILED outcome."""
        from .provider import (
            ProviderExecutionOutcome,
            ProviderExecutionOutcomeStatus,
        )
        return ProviderExecutionOutcome(
            status=ProviderExecutionOutcomeStatus.FAILED,
            failure=failure,
        )
