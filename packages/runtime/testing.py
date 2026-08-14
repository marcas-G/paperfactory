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
    "InMemoryExecutionAttemptStore",
    "InMemoryRuntimeEventSink",
    "InMemoryRuntimeRunStore",
    "InMemoryRuntimeSessionStore",
]
