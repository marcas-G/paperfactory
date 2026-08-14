"""RUN-083..089 — store semantics."""
from datetime import UTC, datetime

import pytest

from packages.domain.enums import ActorType
from packages.domain.ids import ExecutionAttemptId, RuntimeRunId, RuntimeSessionId
from packages.runtime import (
    AttemptStatus,
    DuplicateRuntimeObjectError,
    ExecutionAttempt,
    RunStatus,
    RuntimeObjectNotFoundError,
    RuntimeRun,
    RuntimeSession,
    RuntimeSessionStatus,
)

from .conftest import BRANCH, INPUT_REF, PROJECT

_TZ = datetime(2026, 1, 1, tzinfo=UTC)


def _make_session():
    return RuntimeSession(
        session_id=RuntimeSessionId("s1"), project_id=PROJECT, branch_id=BRANCH,
        status=RuntimeSessionStatus.OPEN, created_by=ActorType.SYSTEM, created_at=_TZ,
    )


def _make_run(session_id=RuntimeSessionId("s1")):
    return RuntimeRun(
        run_id=RuntimeRunId("r1"), session_id=session_id,
        project_id=PROJECT, branch_id=BRANCH,
        status=RunStatus.CREATED, input_ref=INPUT_REF,
        created_by=ActorType.SYSTEM, created_at=_TZ,
    )


def _make_attempt(run_id=RuntimeRunId("r1")):
    return ExecutionAttempt(
        attempt_id=ExecutionAttemptId("a1"), run_id=run_id,
        attempt_number=1, status=AttemptStatus.RUNNING, started_at=_TZ,
    )


def test_run_083_session_store_round_trip(session_store):
    s = _make_session()
    session_store.save(s)
    assert session_store.get(s.session_id) is s


def test_run_084_duplicate_session_save(session_store):
    s = _make_session()
    session_store.save(s)
    with pytest.raises(DuplicateRuntimeObjectError):
        session_store.save(s)


def test_run_085_run_store_round_trip(run_store):
    r = _make_run()
    run_store.save(r)
    assert run_store.get(r.run_id) is r


def test_run_086_duplicate_run_save(run_store):
    r = _make_run()
    run_store.save(r)
    with pytest.raises(DuplicateRuntimeObjectError):
        run_store.save(r)


def test_run_087_attempt_store_round_trip(attempt_store):
    a = _make_attempt()
    attempt_store.save(a)
    assert attempt_store.get(a.attempt_id) is a


def test_run_088_duplicate_attempt_save(attempt_store):
    a = _make_attempt()
    attempt_store.save(a)
    with pytest.raises(DuplicateRuntimeObjectError):
        attempt_store.save(a)


def test_run_089_update_missing_rejected(session_store):
    s = _make_session()
    with pytest.raises(RuntimeObjectNotFoundError):
        session_store.update(s)
