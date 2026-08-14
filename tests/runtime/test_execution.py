"""EXE-001..087 + M3-EXE-001/002 — provider execution."""
from __future__ import annotations

import asyncio
import inspect
from dataclasses import FrozenInstanceError
from datetime import UTC, datetime

import pytest

from packages.domain.ids import (
    ExecutionAttemptId,
    ProviderExecutionRequestId,
    ProviderExecutionResponseId,
    RuntimeArtifactId,
    RuntimeRunId,
    RuntimeSessionId,
)
from packages.runtime import (
    ModelIdentifier,
    ProviderExecutionOutcome,
    ProviderExecutionOutcomeStatus,
    ProviderExecutionRequest,
    ProviderExecutionResponse,
    ProviderExecutionScopeError,
    ProviderIdentifier,
    ProviderUsage,
    RunStatus,
    RuntimeEventType,
    RuntimeFailure,
    RuntimeFailureCategory,
)

from .conftest import BRANCH, INPUT_REF, PROJECT


# --- helpers ---
def _req(running_run, **kw):  # type: ignore[no-untyped-def]
    run, att = running_run
    base = dict(
        request_id=ProviderExecutionRequestId("req-1"),
        session_id=run.session_id,
        run_id=run.run_id,
        attempt_id=att.attempt_id,
        project_id=run.project_id,
        branch_id=run.branch_id,
        provider=ProviderIdentifier(name="fake"),
        model=ModelIdentifier(name="fake-model-v1"),
        input_ref=run.input_ref,
        projected_input={"messages": []},
        created_at=datetime(2026, 1, 1, 12, 0, tzinfo=UTC),
    )
    base.update(kw)
    return ProviderExecutionRequest(**base)


# --- EXE-001..007 contracts ---
def test_exe_001_provider_id_immutable():
    p = ProviderIdentifier(name="x")
    with pytest.raises(FrozenInstanceError):
        p.name = "y"  # type: ignore[misc]


def test_exe_002_empty_provider_rejected():
    with pytest.raises(ValueError):
        ProviderIdentifier(name="")


def test_exe_003_model_id_immutable():
    m = ModelIdentifier(name="x")
    with pytest.raises(FrozenInstanceError):
        m.name = "y"  # type: ignore[misc]


def test_exe_004_empty_model_rejected():
    with pytest.raises(ValueError):
        ModelIdentifier(name="")


def test_exe_005_usage_immutable():
    u = ProviderUsage()
    with pytest.raises(FrozenInstanceError):
        u.input_units = 1  # type: ignore[misc]


def test_exe_006_negative_input_rejected():
    with pytest.raises(ValueError):
        ProviderUsage(input_units=-1)


def test_exe_007_negative_output_rejected():
    with pytest.raises(ValueError):
        ProviderUsage(output_units=-1)


# --- EXE-008..011 request ---
def test_exe_008_request_immutable(running_run):
    r = _req(running_run)
    with pytest.raises(FrozenInstanceError):
        r.provider = ProviderIdentifier(name="z")  # type: ignore[misc]


def test_exe_009_naive_dt_rejected(running_run):
    run, att = running_run
    with pytest.raises(ValueError):
        ProviderExecutionRequest(
            request_id=ProviderExecutionRequestId("r"),
            session_id=run.session_id, run_id=run.run_id, attempt_id=att.attempt_id,
            project_id=run.project_id, branch_id=run.branch_id,
            provider=ProviderIdentifier(name="x"), model=ModelIdentifier(name="y"),
            input_ref=run.input_ref, projected_input={},
            created_at=datetime(2026, 1, 1),  # naive
        )


def test_exe_010_opaque_projected_input(running_run):
    r = _req(running_run, projected_input=object())
    assert r.projected_input is not None


# --- EXE-018..022 outcome ---
def test_exe_018_succeeded_with_response():
    resp = ProviderExecutionResponse(
        response_id=ProviderExecutionResponseId("r"),
        artifact_id=RuntimeArtifactId("a"),
        request_id=ProviderExecutionRequestId("rq"),
        session_id=RuntimeSessionId("s"), run_id=RuntimeRunId("ru"),
        attempt_id=ExecutionAttemptId("at"),
        project_id=PROJECT, branch_id=BRANCH,
        provider=ProviderIdentifier(name="x"), model=ModelIdentifier(name="y"),
    )
    o = ProviderExecutionOutcome(status=ProviderExecutionOutcomeStatus.SUCCEEDED, response=resp)
    assert o.status is ProviderExecutionOutcomeStatus.SUCCEEDED


def test_exe_019_succeeded_with_failure_rejected():
    f = RuntimeFailure(category=RuntimeFailureCategory.NETWORK, code="x", message="m")
    with pytest.raises(ValueError):
        ProviderExecutionOutcome(status=ProviderExecutionOutcomeStatus.SUCCEEDED, failure=f)


def test_exe_020_failed_with_failure():
    f = RuntimeFailure(category=RuntimeFailureCategory.NETWORK, code="x", message="m")
    o = ProviderExecutionOutcome(status=ProviderExecutionOutcomeStatus.FAILED, failure=f)
    assert o.failure is not None


def test_exe_021_failed_with_response_rejected():
    with pytest.raises(ValueError):
        ProviderExecutionOutcome(status=ProviderExecutionOutcomeStatus.FAILED, response=object())  # type: ignore[arg-type]


def test_exe_022_failed_no_failure_rejected():
    with pytest.raises(ValueError):
        ProviderExecutionOutcome(status=ProviderExecutionOutcomeStatus.FAILED)


# --- EXE-023..032 scope ---
def test_exe_029_run_not_running_rejected(coordinator, run_mgr, open_session):
    """CREATED run cannot execute provider."""
    from packages.runtime.testing import FakeProviderExecutor
    run = run_mgr.create_run(session_id=open_session.session_id, input_ref=INPUT_REF)
    req = _req((run, type("A", (), {"attempt_id": ExecutionAttemptId("a")})()),
               run_id=run.run_id)
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    with pytest.raises(ProviderExecutionScopeError):
        asyncio.run(coordinator.execute(req, executor))


# --- EXE-033..038 fake executor ---
def test_exe_038_fake_no_network():
    from packages.runtime.testing import FakeProviderExecutor
    src = inspect.getsource(FakeProviderExecutor)
    for f in ("requests", "httpx", "socket", "openai", "anthropic"):
        assert f not in src


# --- EXE-039..047 success coordinator ---
def test_exe_039_047_success(
    coordinator, running_run, request_store, response_store, event_sink
):
    from packages.runtime.testing import FakeProviderExecutor
    run, att = running_run
    raw = {"judgement": "SUPPORT", "confidence": 0.88, "reason_codes": ["E1"]}
    executor = FakeProviderExecutor([FakeProviderExecutor.success(raw)])
    req = _req(running_run, projected_input=raw)
    final_run, outcome = asyncio.run(coordinator.execute(req, executor))

    assert len(executor.calls) == 1  # EXE-041
    assert outcome.status is ProviderExecutionOutcomeStatus.SUCCEEDED
    assert final_run.status is RunStatus.SUCCEEDED  # EXE-044
    assert request_store.list_for_run(run.run_id)  # EXE-039
    assert response_store.list_for_run(run.run_id)  # EXE-042
    types = [e.event_type for e in event_sink.list_for_run(run.run_id)]
    assert RuntimeEventType.PROVIDER_EXECUTION_STARTED in types  # EXE-040
    assert RuntimeEventType.PROVIDER_EXECUTION_SUCCEEDED in types  # EXE-043


# --- EXE-048..054 provider failure ---
def test_exe_048_054_failure(
    coordinator, running_run, request_store, response_store, event_sink, run_mgr
):
    from packages.runtime.testing import FakeProviderExecutor
    run, att = running_run
    failure = RuntimeFailure(
        category=RuntimeFailureCategory.RATE_LIMIT, code="RATE_LIMITED",
        message="rate limited", transient=True,
    )
    executor = FakeProviderExecutor([FakeProviderExecutor.failure(failure)])
    req = _req(running_run)
    final_run, outcome = asyncio.run(coordinator.execute(req, executor))

    assert outcome.status is ProviderExecutionOutcomeStatus.FAILED
    assert final_run.status is RunStatus.FAILED  # EXE-050
    assert len(executor.calls) == 1
    assert response_store.list_for_run(run.run_id) == []  # EXE-053
    assert len(run_mgr.list_attempts(run.run_id)) == 1  # EXE-054


# --- EXE-055..060 unexpected exception ---
def test_exe_055_060_exception(
    coordinator, running_run, event_sink, run_mgr
):
    class BoomExecutor:
        async def execute(self, request):  # type: ignore[no-untyped-def]
            raise RuntimeError("unexpected boom")

    run, att = running_run
    req = _req(running_run)
    final_run, outcome = asyncio.run(coordinator.execute(req, BoomExecutor()))

    assert outcome.status is ProviderExecutionOutcomeStatus.FAILED
    assert outcome.failure.category is RuntimeFailureCategory.INTERNAL
    assert outcome.failure.code == "PROVIDER_EXECUTOR_EXCEPTION"
    assert final_run.status is RunStatus.FAILED
    assert len(run_mgr.list_attempts(run.run_id)) == 1


# --- EXE-072..075 no retry ---
def test_exe_072_075_no_retry(
    coordinator, running_run, run_mgr
):
    from packages.runtime.testing import FakeProviderExecutor
    failure = RuntimeFailure(
        category=RuntimeFailureCategory.NETWORK, code="X",
        message="m", transient=True,
    )
    executor = FakeProviderExecutor([FakeProviderExecutor.failure(failure)])
    req = _req(running_run)
    final_run, _ = asyncio.run(coordinator.execute(req, executor))
    assert len(executor.calls) == 1  # EXE-072
    assert final_run.attempt_count == 1  # EXE-073
    assert len(run_mgr.list_attempts(final_run.run_id)) == 1  # EXE-074


# --- EXE-076..080 stores ---
def test_exe_076_080_stores(request_store, response_store):
    from packages.runtime import ProviderExecutionRequest
    req = ProviderExecutionRequest(
        request_id=ProviderExecutionRequestId("t1"),
        session_id=RuntimeSessionId("s"), run_id=RuntimeRunId("r"),
        attempt_id=ExecutionAttemptId("a"),
        project_id=PROJECT, branch_id=BRANCH,
        provider=ProviderIdentifier(name="x"), model=ModelIdentifier(name="y"),
        input_ref=INPUT_REF, projected_input={},
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    request_store.save(req)
    assert request_store.get(req.request_id) is req
    with pytest.raises(Exception):
        request_store.save(req)


# --- EXE-066 new event types exist ---
def test_exe_066_provider_event_types():
    vals = {e.value for e in RuntimeEventType}
    assert "PROVIDER_EXECUTION_STARTED" in vals
    assert "PROVIDER_EXECUTION_SUCCEEDED" in vals
    assert "PROVIDER_EXECUTION_FAILED" in vals


# --- EXE-071 raw_output not in event ---
def test_exe_071_no_raw_in_event(coordinator, running_run, event_sink):
    from packages.runtime.testing import FakeProviderExecutor
    run, att = running_run
    raw = {"secret": "value"}
    executor = FakeProviderExecutor([FakeProviderExecutor.success(raw)])
    req = _req(running_run, projected_input=raw)
    asyncio.run(coordinator.execute(req, executor))
    for e in event_sink.list_for_run(run.run_id):
        assert "secret" not in str(e.metadata)


# --- M3-EXE-001 full e2e ---
def test_m3_exe_001_success_e2e(
    coordinator, running_run, request_store, response_store, event_sink
):
    from packages.runtime.testing import FakeProviderExecutor
    run, att = running_run
    raw = {"judgement": "SUPPORT", "confidence": 0.88, "reason_codes": ["E1"]}
    executor = FakeProviderExecutor([FakeProviderExecutor.success(raw)])
    req = _req(running_run)
    final_run, outcome = asyncio.run(coordinator.execute(req, executor))

    assert final_run.status is RunStatus.SUCCEEDED
    assert outcome.response is not None
    assert outcome.response.raw_output == raw
    assert len(executor.calls) == 1

    types = [e.event_type for e in event_sink.list_for_run(run.run_id)]
    assert types.index(
        RuntimeEventType.PROVIDER_EXECUTION_STARTED
    ) < types.index(RuntimeEventType.PROVIDER_EXECUTION_SUCCEEDED)
    assert types.index(
        RuntimeEventType.PROVIDER_EXECUTION_SUCCEEDED
    ) < types.index(RuntimeEventType.RUN_SUCCEEDED)


# --- M3-EXE-002 failure e2e ---
def test_m3_exe_002_failure_e2e(
    coordinator, running_run, event_sink, run_mgr
):
    from packages.runtime.testing import FakeProviderExecutor
    run, att = running_run
    failure = RuntimeFailure(
        category=RuntimeFailureCategory.RATE_LIMIT, code="RATE_LIMITED",
        message="rate limited", transient=True,
    )
    executor = FakeProviderExecutor([FakeProviderExecutor.failure(failure)])
    req = _req(running_run)
    final_run, outcome = asyncio.run(coordinator.execute(req, executor))

    assert final_run.status is RunStatus.FAILED
    assert final_run.attempt_count == 1
    assert len(run_mgr.list_attempts(run.run_id)) == 1
    types = [e.event_type for e in event_sink.list_for_run(run.run_id)]
    assert RuntimeEventType.PROVIDER_EXECUTION_FAILED in types
