"""Shared fixtures for Agent Runtime tests."""
from __future__ import annotations

import itertools
from datetime import UTC, datetime

import pytest

from packages.domain.ids import BranchId, ProjectId
from packages.runtime import (
    RuntimeInputRef,
    RuntimeRunManager,
    RuntimeSessionManager,
)
from packages.runtime.testing import (
    InMemoryExecutionAttemptStore,
    InMemoryRuntimeEventSink,
    InMemoryRuntimeRunStore,
    InMemoryRuntimeSessionStore,
)

PROJECT = ProjectId("P1")
BRANCH = BranchId("B1")
INPUT_REF = RuntimeInputRef(
    source_type="prompt_package", source_id="pkg-1", version="1",
)


class _Counter:
    def __init__(self, prefix: str) -> None:
        self._n = itertools.count(1)
        self._prefix = prefix

    def __call__(self) -> str:
        return f"{self._prefix}-{next(self._n)}"


@pytest.fixture
def clock():
    """Monotonically-increasing tz-aware clock."""
    _ticks = itertools.count()

    def _now() -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC).replace(
            second=next(_ticks)
        )
    return _now


@pytest.fixture
def session_store():
    return InMemoryRuntimeSessionStore()


@pytest.fixture
def run_store():
    return InMemoryRuntimeRunStore()


@pytest.fixture
def attempt_store():
    return InMemoryExecutionAttemptStore()


@pytest.fixture
def event_sink():
    return InMemoryRuntimeEventSink()


@pytest.fixture
def session_mgr(session_store, run_store, event_sink, clock):
    return RuntimeSessionManager(
        session_store, run_store, event_sink,
        session_id_factory=_Counter("sess"),
        event_id_factory=_Counter("evt"),
        now=clock,
    )


@pytest.fixture
def run_mgr(session_store, run_store, attempt_store, event_sink, clock):
    return RuntimeRunManager(
        session_store, run_store, attempt_store, event_sink,
        run_id_factory=_Counter("run"),
        attempt_id_factory=_Counter("att"),
        event_id_factory=_Counter("evt"),
        now=clock,
    )


@pytest.fixture
def open_session(session_mgr):
    return session_mgr.create_session(
        project_id=PROJECT, branch_id=BRANCH,
    )


@pytest.fixture
def created_run(session_mgr, run_mgr, open_session):
    return run_mgr.create_run(
        session_id=open_session.session_id,
        input_ref=INPUT_REF,
    )


# --- provider execution fixtures ---------------------------------------
@pytest.fixture
def request_store():
    from packages.runtime.testing import InMemoryProviderExecutionRequestStore
    return InMemoryProviderExecutionRequestStore()


@pytest.fixture
def response_store():
    from packages.runtime.testing import InMemoryProviderExecutionResponseStore
    return InMemoryProviderExecutionResponseStore()


@pytest.fixture
def coordinator(run_mgr, request_store, response_store, event_sink, clock):
    import itertools

    from packages.runtime import RuntimeExecutionCoordinator
    _resp = itertools.count(1)
    _art = itertools.count(1)
    _evt = itertools.count(100)
    return RuntimeExecutionCoordinator(
        run_mgr, request_store, response_store, event_sink,
        response_id_factory=lambda: f"resp-{next(_resp)}",
        artifact_id_factory=lambda: f"art-{next(_art)}",
        event_id_factory=lambda: f"evt-{next(_evt)}",
        now=clock,
    )


@pytest.fixture
def running_run(session_mgr, run_mgr, open_session):
    """Create a run, mark ready, start it, return (run, attempt)."""
    from packages.runtime import RuntimeInputRef
    inp = RuntimeInputRef(source_type="prompt_package", source_id="pkg-1", version="1")
    run = run_mgr.create_run(session_id=open_session.session_id, input_ref=inp)
    run_mgr.mark_ready(run.run_id)
    return run_mgr.start_run(run.run_id)
