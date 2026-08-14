"""M3-RUN-001 / M3-RUN-002 — end-to-end runtime lifecycle."""
from packages.runtime import (
    AttemptStatus,
    RunStatus,
    RuntimeEventType,
    RuntimeFailure,
    RuntimeFailureCategory,
    RuntimeOutputRef,
    RunWaitReason,
)

from .conftest import INPUT_REF


def test_m3_run_001_full_lifecycle(session_mgr, run_mgr, event_sink, open_session):
    run = run_mgr.create_run(
        session_id=open_session.session_id, input_ref=INPUT_REF,
    )
    run_mgr.mark_ready(run.run_id)
    run, att1 = run_mgr.start_run(run.run_id)

    assert run.status is RunStatus.RUNNING
    assert att1.status is AttemptStatus.RUNNING

    run_mgr.pause_run(run.run_id, reason=RunWaitReason.EXTERNAL_DEPENDENCY)
    paused = run_mgr.get_run(run.run_id)
    assert paused.status is RunStatus.WAITING
    assert run_mgr.list_attempts(run.run_id)[0].status is AttemptStatus.RUNNING

    run_mgr.resume_run(run.run_id)
    resumed = run_mgr.get_run(run.run_id)
    assert resumed.status is RunStatus.RUNNING
    # same attempt
    assert len(run_mgr.list_attempts(run.run_id)) == 1
    assert run_mgr.list_attempts(run.run_id)[0].attempt_id == att1.attempt_id

    out_ref = RuntimeOutputRef(
        artifact_type="cognitive_result", artifact_id="result-1", version="1",
    )
    final_run, final_att = run_mgr.succeed_run(run.run_id, output_ref=out_ref)
    assert final_run.status is RunStatus.SUCCEEDED
    assert final_att.status is AttemptStatus.SUCCEEDED
    assert final_run.output_ref == out_ref

    events = event_sink.list_for_run(run.run_id)
    types = [e.event_type for e in events]
    expected = [
        RuntimeEventType.RUN_CREATED,
        RuntimeEventType.RUN_READY,
        RuntimeEventType.RUN_STARTED,
        RuntimeEventType.ATTEMPT_STARTED,
        RuntimeEventType.RUN_WAITING,
        RuntimeEventType.RUN_RESUMED,
        RuntimeEventType.ATTEMPT_SUCCEEDED,
        RuntimeEventType.RUN_SUCCEEDED,
    ]
    assert types == expected


def test_m3_run_002_failure(session_mgr, run_mgr, event_sink, open_session):
    run = run_mgr.create_run(
        session_id=open_session.session_id, input_ref=INPUT_REF,
    )
    run_mgr.mark_ready(run.run_id)
    run, _ = run_mgr.start_run(run.run_id)

    failure = RuntimeFailure(
        category=RuntimeFailureCategory.NETWORK,
        code="CONNECTION_RESET", transient=True,
        message="connection reset",
    )
    final_run, final_att = run_mgr.fail_run(run.run_id, failure=failure)

    assert final_run.status is RunStatus.FAILED
    assert final_att.status is AttemptStatus.FAILED
    assert final_run.attempt_count == 1
    assert len(run_mgr.list_attempts(run.run_id)) == 1
