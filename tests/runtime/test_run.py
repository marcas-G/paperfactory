"""RUN-014..031, RUN-034..046, RUN-053..060 — run lifecycle, attempts, waiting."""
from __future__ import annotations

import pytest

from packages.runtime import (
    AttemptStatus,
    IllegalRunTransitionError,
    RunStatus,
    RuntimeFailure,
    RuntimeFailureCategory,
    RuntimeOutputRef,
    RunWaitReason,
)

from .conftest import INPUT_REF


def _ready_and_start(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    return run_mgr.start_run(created_run.run_id)


def test_run_014_create_created(run_mgr, open_session):
    run = run_mgr.create_run(
        session_id=open_session.session_id, input_ref=INPUT_REF,
    )
    assert run.status is RunStatus.CREATED


def test_run_015_created_to_ready(run_mgr, created_run):
    updated = run_mgr.mark_ready(created_run.run_id)
    assert updated.status is RunStatus.READY


def test_run_016_ready_to_running(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, att = run_mgr.start_run(created_run.run_id)
    assert run.status is RunStatus.RUNNING


def test_run_017_running_to_waiting(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    updated = run_mgr.pause_run(
        run.run_id, reason=RunWaitReason.EXTERNAL_DEPENDENCY,
    )
    assert updated.status is RunStatus.WAITING


def test_run_018_waiting_to_running(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.pause_run(run.run_id, reason=RunWaitReason.MANUAL_PAUSE)
    updated = run_mgr.resume_run(run.run_id)
    assert updated.status is RunStatus.RUNNING


def test_run_019_running_to_succeeded(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    out_ref = RuntimeOutputRef(
        artifact_type="cognitive_result", artifact_id="r1", version="1",
    )
    updated_run, att = run_mgr.succeed_run(run.run_id, output_ref=out_ref)
    assert updated_run.status is RunStatus.SUCCEEDED


def test_run_020_running_to_failed(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    failure = RuntimeFailure(
        category=RuntimeFailureCategory.NETWORK, code="CONN_RESET",
        message="connection reset", transient=True,
    )
    updated_run, att = run_mgr.fail_run(run.run_id, failure=failure)
    assert updated_run.status is RunStatus.FAILED


def test_run_021_ready_cancel(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    updated = run_mgr.cancel_run(created_run.run_id)
    assert updated.status is RunStatus.CANCELLED


def test_run_022_running_cancel(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    updated = run_mgr.cancel_run(run.run_id)
    assert updated.status is RunStatus.CANCELLED


def test_run_023_waiting_cancel(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.pause_run(run.run_id, reason=RunWaitReason.MANUAL_PAUSE)
    updated = run_mgr.cancel_run(run.run_id)
    assert updated.status is RunStatus.CANCELLED


def test_run_024_running_timeout(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    updated_run, att = run_mgr.timeout_run(run.run_id)
    assert updated_run.status is RunStatus.TIMED_OUT


def test_run_025_waiting_timeout(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.pause_run(run.run_id, reason=RunWaitReason.MANUAL_PAUSE)
    updated_run, _ = run_mgr.timeout_run(run.run_id)
    assert updated_run.status is RunStatus.TIMED_OUT


def test_run_026_created_skip_ready_rejected(run_mgr, created_run):
    with pytest.raises(IllegalRunTransitionError):
        run_mgr.start_run(created_run.run_id)


def test_run_028_succeeded_no_revive(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.succeed_run(run.run_id)
    with pytest.raises(IllegalRunTransitionError):
        run_mgr.start_run(run.run_id)


def test_run_032_created_no_attempt(run_mgr, created_run):
    assert run_mgr.list_attempts(created_run.run_id) == []


def test_run_034_start_creates_attempt_1(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, att = run_mgr.start_run(created_run.run_id)
    assert att.attempt_number == 1
    assert att.status is AttemptStatus.RUNNING


def test_run_035_attempt_count_1(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    updated = run_mgr.get_run(created_run.run_id)
    assert updated.attempt_count == 1


def test_run_036_pause_no_attempt_end(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.pause_run(run.run_id, reason=RunWaitReason.MANUAL_PAUSE)
    atts = run_mgr.list_attempts(run.run_id)
    assert atts[0].status is AttemptStatus.RUNNING


def test_run_037_resume_no_new_attempt(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.pause_run(run.run_id, reason=RunWaitReason.MANUAL_PAUSE)
    run_mgr.resume_run(run.run_id)
    assert len(run_mgr.list_attempts(run.run_id)) == 1


def test_run_038_success_attempt_succeeded(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    _, att = run_mgr.succeed_run(run.run_id)
    assert att.status is AttemptStatus.SUCCEEDED


def test_run_039_fail_attempt_failed(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    _, att = run_mgr.fail_run(run.run_id, failure=RuntimeFailure(
        category=RuntimeFailureCategory.NETWORK, code="X", message="m",
    ))
    assert att.status is AttemptStatus.FAILED


def test_run_040_running_cancel_attempt_cancelled(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.cancel_run(run.run_id)
    atts = run_mgr.list_attempts(run.run_id)
    assert atts[0].status is AttemptStatus.CANCELLED


def test_run_041_timeout_attempt_timed_out(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    _, att = run_mgr.timeout_run(run.run_id)
    assert att.status is AttemptStatus.TIMED_OUT


def test_run_042_attempt_number_ge_1(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    _, att = run_mgr.start_run(created_run.run_id)
    assert att.attempt_number >= 1


def test_run_053_pause_needs_reason(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    with pytest.raises(IllegalRunTransitionError):
        run_mgr.pause_run(run.run_id, reason=None)  # type: ignore[arg-type]


def test_run_054_waiting_has_reason(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    updated = run_mgr.pause_run(
        run.run_id, reason=RunWaitReason.EXTERNAL_DEPENDENCY,
    )
    assert updated.wait_reason is RunWaitReason.EXTERNAL_DEPENDENCY


def test_run_055_resume_no_reason(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.pause_run(run.run_id, reason=RunWaitReason.MANUAL_PAUSE)
    updated = run_mgr.resume_run(run.run_id)
    assert updated.wait_reason is None


def test_run_057_success_output_ref(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    out = RuntimeOutputRef(
        artifact_type="result", artifact_id="r1", version="1",
    )
    updated_run, updated_att = run_mgr.succeed_run(run.run_id, output_ref=out)
    assert updated_run.output_ref == out
    assert updated_att.output_ref == out


def test_run_094_create_no_auto_ready(run_mgr, created_run):
    updated = run_mgr.get_run(created_run.run_id)
    assert updated.status is RunStatus.CREATED


def test_run_095_ready_no_auto_running(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    assert run_mgr.get_run(created_run.run_id).status is RunStatus.READY


def test_run_096_transient_no_retry(run_mgr, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.fail_run(run.run_id, failure=RuntimeFailure(
        category=RuntimeFailureCategory.NETWORK, code="X",
        message="m", transient=True,
    ))
    # Only 1 attempt exists
    assert len(run_mgr.list_attempts(run.run_id)) == 1
    assert run_mgr.get_run(run.run_id).status is RunStatus.FAILED
