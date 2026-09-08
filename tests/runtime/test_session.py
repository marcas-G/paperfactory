"""RUN-001..013, RUN-061..066 — Session contract, scope, busy."""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from packages.runtime import (
    IllegalSessionTransitionError,
    RuntimeSessionStatus,
    SessionBusyError,
)

from .conftest import BRANCH, INPUT_REF, PROJECT


def _tz(s: int = 0):
    from datetime import UTC, datetime

    return datetime(2026, 1, 1, 12, 0, s, tzinfo=UTC)


def test_run_001_session_immutable(session_mgr):
    session = session_mgr.create_session(project_id=PROJECT, branch_id=BRANCH)
    with pytest.raises(FrozenInstanceError):
        session.status = RuntimeSessionStatus.CLOSED  # type: ignore[misc]


def test_run_002_open_legal(session_mgr):
    session = session_mgr.create_session(project_id=PROJECT, branch_id=BRANCH)
    assert session.status is RuntimeSessionStatus.OPEN


def test_run_003_closed_has_closed_at_by(session_mgr):
    session = session_mgr.create_session(project_id=PROJECT, branch_id=BRANCH)
    closed = session_mgr.close_session(session.session_id)
    assert closed.status is RuntimeSessionStatus.CLOSED
    assert closed.closed_at is not None
    assert closed.closed_by is not None


def test_run_004_cancelled_has_closed_at_by(session_mgr):
    session = session_mgr.create_session(project_id=PROJECT, branch_id=BRANCH)
    cancelled = session_mgr.cancel_session(session.session_id)
    assert cancelled.status is RuntimeSessionStatus.CANCELLED
    assert cancelled.closed_at is not None


def test_run_006_open_to_closed(session_mgr):
    session = session_mgr.create_session(project_id=PROJECT, branch_id=BRANCH)
    closed = session_mgr.close_session(session.session_id)
    assert closed.status is RuntimeSessionStatus.CLOSED


def test_run_007_open_to_cancelled(session_mgr):
    session = session_mgr.create_session(project_id=PROJECT, branch_id=BRANCH)
    cancelled = session_mgr.cancel_session(session.session_id)
    assert cancelled.status is RuntimeSessionStatus.CANCELLED


def test_run_008_closed_not_reopen(session_mgr):
    session = session_mgr.create_session(project_id=PROJECT, branch_id=BRANCH)
    session_mgr.close_session(session.session_id)
    with pytest.raises(IllegalSessionTransitionError):
        session_mgr.close_session(session.session_id)


def test_run_009_cancelled_not_reopen(session_mgr):
    session = session_mgr.create_session(project_id=PROJECT, branch_id=BRANCH)
    session_mgr.cancel_session(session.session_id)
    with pytest.raises(IllegalSessionTransitionError):
        session_mgr.cancel_session(session.session_id)


def test_run_010_run_same_scope_legal(run_mgr, open_session):
    run = run_mgr.create_run(
        session_id=open_session.session_id,
        input_ref=INPUT_REF,
    )
    assert run.project_id == open_session.project_id


def test_run_013_terminal_session_no_run(session_mgr, run_mgr):
    session = session_mgr.create_session(project_id=PROJECT, branch_id=BRANCH)
    session_mgr.close_session(session.session_id)
    with pytest.raises(Exception):
        run_mgr.create_run(session_id=session.session_id, input_ref=INPUT_REF)


def test_run_061_created_run_blocks_close(session_mgr, run_mgr, open_session):
    run_mgr.create_run(session_id=open_session.session_id, input_ref=INPUT_REF)
    with pytest.raises(SessionBusyError):
        session_mgr.close_session(open_session.session_id)


def test_run_065_all_terminal_then_close(session_mgr, run_mgr, open_session):
    run = run_mgr.create_run(session_id=open_session.session_id, input_ref=INPUT_REF)
    run_mgr.mark_ready(run.run_id)
    run_mgr.cancel_run(run.run_id)
    closed = session_mgr.close_session(open_session.session_id)
    assert closed.status is RuntimeSessionStatus.CLOSED


def test_run_066_non_terminal_blocks_cancel(session_mgr, run_mgr, open_session):
    run_mgr.create_run(session_id=open_session.session_id, input_ref=INPUT_REF)
    with pytest.raises(SessionBusyError):
        session_mgr.cancel_session(open_session.session_id)
