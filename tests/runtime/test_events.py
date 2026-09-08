"""RUN-067..082, RUN-090 — runtime events, separation."""

from __future__ import annotations

from packages.domain.events import ControlEventType
from packages.runtime import RuntimeEventType
from packages.runtime.events import RuntimeEvent as RE
from packages.runtime.events import RuntimeEventType as RET


def test_run_067_session_created(session_mgr, event_sink, open_session):
    types = [e.event_type for e in event_sink.list_for_session(open_session.session_id)]
    assert RuntimeEventType.SESSION_CREATED in types


def test_run_068_session_closed(session_mgr, event_sink, open_session):
    session_mgr.close_session(open_session.session_id)
    types = [e.event_type for e in event_sink.list_for_session(open_session.session_id)]
    assert RuntimeEventType.SESSION_CLOSED in types


def test_run_070_run_created(run_mgr, event_sink, open_session, created_run):
    types = [e.event_type for e in event_sink.list_for_run(created_run.run_id)]
    assert RuntimeEventType.RUN_CREATED in types


def test_run_071_run_ready(run_mgr, event_sink, created_run):
    run_mgr.mark_ready(created_run.run_id)
    types = [e.event_type for e in event_sink.list_for_run(created_run.run_id)]
    assert RuntimeEventType.RUN_READY in types


def test_run_072_run_started_attempt_started(run_mgr, event_sink, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run_mgr.start_run(created_run.run_id)
    types = [e.event_type for e in event_sink.list_for_run(created_run.run_id)]
    assert RuntimeEventType.RUN_STARTED in types
    assert RuntimeEventType.ATTEMPT_STARTED in types


def test_run_075_run_succeeded_attempt_succeeded(run_mgr, event_sink, created_run):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.succeed_run(run.run_id)
    types = [e.event_type for e in event_sink.list_for_run(run.run_id)]
    assert RuntimeEventType.RUN_SUCCEEDED in types
    assert RuntimeEventType.ATTEMPT_SUCCEEDED in types


def test_run_076_run_failed_attempt_failed(run_mgr, event_sink, created_run):
    from packages.runtime import RuntimeFailure, RuntimeFailureCategory

    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    run_mgr.fail_run(
        run.run_id,
        failure=RuntimeFailure(
            category=RuntimeFailureCategory.NETWORK,
            code="X",
            message="m",
        ),
    )
    types = [e.event_type for e in event_sink.list_for_run(run.run_id)]
    assert RuntimeEventType.RUN_FAILED in types
    assert RuntimeEventType.ATTEMPT_FAILED in types


def test_run_079_runtime_event_not_domain_event():
    # RuntimeEvent is a separate frozen dataclass, not DomainEvent
    from packages.domain.events import DomainEvent

    assert RE is not DomainEvent


def test_run_080_runtime_event_type_not_control_event_type():
    assert RET is not ControlEventType
    # They are different enums with different values
    rt_values = {e.value for e in RET}
    ct_values = {e.value for e in ControlEventType}
    assert rt_values.isdisjoint(ct_values)


def test_run_090_event_sink_lists_by_session_and_run(
    run_mgr,
    created_run,
    event_sink,
    open_session,
):
    run_mgr.mark_ready(created_run.run_id)
    run, _ = run_mgr.start_run(created_run.run_id)
    session_events = event_sink.list_for_session(open_session.session_id)
    run_events = event_sink.list_for_run(run.run_id)
    assert len(session_events) >= len(run_events)
    assert all(e.session_id == open_session.session_id for e in session_events)
    assert all(e.run_id == run.run_id for e in run_events)
