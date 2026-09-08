"""EXE-001..087 + M3-EXE-001/002 — provider execution."""

from __future__ import annotations

import asyncio
import inspect
from dataclasses import FrozenInstanceError
from datetime import UTC, datetime

import pytest

from packages.domain.ids import (
    BranchId,
    ExecutionAttemptId,
    ProjectId,
    ProviderExecutionRequestId,
    ProviderExecutionResponseId,
    RuntimeArtifactId,
    RuntimeRunId,
    RuntimeSessionId,
)
from packages.runtime import (
    ModelIdentifier,
    ProviderExecutionInputMismatchError,
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
    RuntimeInputRef,
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
            session_id=run.session_id,
            run_id=run.run_id,
            attempt_id=att.attempt_id,
            project_id=run.project_id,
            branch_id=run.branch_id,
            provider=ProviderIdentifier(name="x"),
            model=ModelIdentifier(name="y"),
            input_ref=run.input_ref,
            projected_input={},
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
        session_id=RuntimeSessionId("s"),
        run_id=RuntimeRunId("ru"),
        attempt_id=ExecutionAttemptId("at"),
        project_id=PROJECT,
        branch_id=BRANCH,
        provider=ProviderIdentifier(name="x"),
        model=ModelIdentifier(name="y"),
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
    req = _req((run, type("A", (), {"attempt_id": ExecutionAttemptId("a")})()), run_id=run.run_id)
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
def test_exe_039_047_success(coordinator, running_run, request_store, response_store, event_sink):
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
        category=RuntimeFailureCategory.RATE_LIMIT,
        code="RATE_LIMITED",
        message="rate limited",
        transient=True,
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
def test_exe_055_060_exception(coordinator, running_run, event_sink, run_mgr):
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
def test_exe_072_075_no_retry(coordinator, running_run, run_mgr):
    from packages.runtime.testing import FakeProviderExecutor

    failure = RuntimeFailure(
        category=RuntimeFailureCategory.NETWORK,
        code="X",
        message="m",
        transient=True,
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
        session_id=RuntimeSessionId("s"),
        run_id=RuntimeRunId("r"),
        attempt_id=ExecutionAttemptId("a"),
        project_id=PROJECT,
        branch_id=BRANCH,
        provider=ProviderIdentifier(name="x"),
        model=ModelIdentifier(name="y"),
        input_ref=INPUT_REF,
        projected_input={},
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
    assert types.index(RuntimeEventType.PROVIDER_EXECUTION_STARTED) < types.index(
        RuntimeEventType.PROVIDER_EXECUTION_SUCCEEDED
    )
    assert types.index(RuntimeEventType.PROVIDER_EXECUTION_SUCCEEDED) < types.index(
        RuntimeEventType.RUN_SUCCEEDED
    )


# --- M3-EXE-002 failure e2e ---
def test_m3_exe_002_failure_e2e(coordinator, running_run, event_sink, run_mgr):
    from packages.runtime.testing import FakeProviderExecutor

    run, att = running_run
    failure = RuntimeFailure(
        category=RuntimeFailureCategory.RATE_LIMIT,
        code="RATE_LIMITED",
        message="rate limited",
        transient=True,
    )
    executor = FakeProviderExecutor([FakeProviderExecutor.failure(failure)])
    req = _req(running_run)
    final_run, outcome = asyncio.run(coordinator.execute(req, executor))

    assert final_run.status is RunStatus.FAILED
    assert final_run.attempt_count == 1
    assert len(run_mgr.list_attempts(run.run_id)) == 1
    types = [e.event_type for e in event_sink.list_for_run(run.run_id)]
    assert RuntimeEventType.PROVIDER_EXECUTION_FAILED in types


# =========================================================================
# EXE-011..017 — Response contracts
# =========================================================================
def test_exe_012_response_immutable(running_run):
    from packages.domain.ids import (
        ProviderExecutionRequestId,
        ProviderExecutionResponseId,
        RuntimeArtifactId,
    )
    from packages.runtime import ProviderExecutionResponse

    run, att = running_run
    resp = ProviderExecutionResponse(
        response_id=ProviderExecutionResponseId("r"),
        artifact_id=RuntimeArtifactId("a"),
        request_id=ProviderExecutionRequestId("rq"),
        session_id=run.session_id,
        run_id=run.run_id,
        attempt_id=att.attempt_id,
        project_id=run.project_id,
        branch_id=run.branch_id,
        provider=ProviderIdentifier(name="x"),
        model=ModelIdentifier(name="y"),
    )
    with pytest.raises(FrozenInstanceError):
        resp.raw_output = {}  # type: ignore[misc]


def test_exe_013_response_naive_dt_rejected(running_run):
    from packages.domain.ids import (
        ProviderExecutionRequestId,
        ProviderExecutionResponseId,
        RuntimeArtifactId,
    )
    from packages.runtime import ProviderExecutionResponse

    run, att = running_run
    with pytest.raises(ValueError):
        ProviderExecutionResponse(
            response_id=ProviderExecutionResponseId("r"),
            artifact_id=RuntimeArtifactId("a"),
            request_id=ProviderExecutionRequestId("rq"),
            session_id=run.session_id,
            run_id=run.run_id,
            attempt_id=att.attempt_id,
            project_id=run.project_id,
            branch_id=run.branch_id,
            provider=ProviderIdentifier(name="x"),
            model=ModelIdentifier(name="y"),
            created_at=datetime(2026, 1, 1),  # naive
        )


def test_exe_014_raw_output_can_be_mapping(running_run):
    from packages.domain.ids import (
        ProviderExecutionRequestId,
        ProviderExecutionResponseId,
        RuntimeArtifactId,
    )
    from packages.runtime import ProviderExecutionResponse

    run, att = running_run
    resp = ProviderExecutionResponse(
        response_id=ProviderExecutionResponseId("r"),
        artifact_id=RuntimeArtifactId("a"),
        request_id=ProviderExecutionRequestId("rq"),
        session_id=run.session_id,
        run_id=run.run_id,
        attempt_id=att.attempt_id,
        project_id=run.project_id,
        branch_id=run.branch_id,
        provider=ProviderIdentifier(name="x"),
        model=ModelIdentifier(name="y"),
        raw_output={"key": "val"},
    )
    assert resp.raw_output == {"key": "val"}


def test_exe_015_response_saves_provider_model(running_run):
    from packages.domain.ids import (
        ProviderExecutionRequestId,
        ProviderExecutionResponseId,
        RuntimeArtifactId,
    )
    from packages.runtime import ProviderExecutionResponse

    run, att = running_run
    resp = ProviderExecutionResponse(
        response_id=ProviderExecutionResponseId("r"),
        artifact_id=RuntimeArtifactId("a"),
        request_id=ProviderExecutionRequestId("rq"),
        session_id=run.session_id,
        run_id=run.run_id,
        attempt_id=att.attempt_id,
        project_id=run.project_id,
        branch_id=run.branch_id,
        provider=ProviderIdentifier(name="openai"),
        model=ModelIdentifier(name="gpt-4"),
    )
    assert resp.provider.name == "openai"
    assert resp.model.name == "gpt-4"


def test_exe_016_response_saves_usage(running_run):
    from packages.domain.ids import (
        ProviderExecutionRequestId,
        ProviderExecutionResponseId,
        RuntimeArtifactId,
    )
    from packages.runtime import ProviderExecutionResponse

    run, att = running_run
    usage = ProviderUsage(input_units=100, output_units=200)
    resp = ProviderExecutionResponse(
        response_id=ProviderExecutionResponseId("r"),
        artifact_id=RuntimeArtifactId("a"),
        request_id=ProviderExecutionRequestId("rq"),
        session_id=run.session_id,
        run_id=run.run_id,
        attempt_id=att.attempt_id,
        project_id=run.project_id,
        branch_id=run.branch_id,
        provider=ProviderIdentifier(name="x"),
        model=ModelIdentifier(name="y"),
        usage=usage,
    )
    assert resp.usage.input_units == 100
    assert resp.usage.output_units == 200


def test_exe_017_runtime_does_not_validate_raw_output(running_run):
    """Raw output can be any object - runtime doesn't schema-validate."""
    from packages.domain.ids import (
        ProviderExecutionRequestId,
        ProviderExecutionResponseId,
        RuntimeArtifactId,
    )
    from packages.runtime import ProviderExecutionResponse

    run, att = running_run
    # Passing completely arbitrary data - should NOT raise
    resp = ProviderExecutionResponse(
        response_id=ProviderExecutionResponseId("r"),
        artifact_id=RuntimeArtifactId("a"),
        request_id=ProviderExecutionRequestId("rq"),
        session_id=run.session_id,
        run_id=run.run_id,
        attempt_id=att.attempt_id,
        project_id=run.project_id,
        branch_id=run.branch_id,
        provider=ProviderIdentifier(name="x"),
        model=ModelIdentifier(name="y"),
        raw_output={"judgement": "COMPLETELY_INVALID", "confidence": 999},
    )
    assert resp.raw_output["judgement"] == "COMPLETELY_INVALID"


# =========================================================================
# EXE-023..030 — Scope validation (each mismatch independently)
# =========================================================================
def test_exe_024_session_mismatch_rejected(coordinator, running_run):
    from packages.runtime.testing import FakeProviderExecutor

    run, att = running_run
    req = _req(running_run, session_id=RuntimeSessionId("WRONG"))
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    with pytest.raises(ProviderExecutionScopeError):
        asyncio.run(coordinator.execute(req, executor))
    assert len(executor.calls) == 0


def test_exe_025_run_mismatch_rejected(coordinator, running_run):
    from packages.runtime.testing import FakeProviderExecutor

    req = _req(running_run, run_id=RuntimeRunId("WRONG"))
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    with pytest.raises(Exception):
        asyncio.run(coordinator.execute(req, executor))
    assert len(executor.calls) == 0


def test_exe_027_project_mismatch_rejected(coordinator, running_run):
    from packages.runtime.testing import FakeProviderExecutor

    req = _req(running_run, project_id=ProjectId("WRONG"))
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    with pytest.raises(ProviderExecutionScopeError):
        asyncio.run(coordinator.execute(req, executor))
    assert len(executor.calls) == 0


def test_exe_028_branch_mismatch_rejected(coordinator, running_run):
    from packages.runtime.testing import FakeProviderExecutor

    req = _req(running_run, branch_id=BranchId("WRONG"))
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    with pytest.raises(ProviderExecutionScopeError):
        asyncio.run(coordinator.execute(req, executor))
    assert len(executor.calls) == 0


def test_exe_026_attempt_mismatch_rejected(coordinator, running_run):
    from packages.runtime.testing import FakeProviderExecutor

    req = _req(running_run, attempt_id=ExecutionAttemptId("WRONG"))
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    with pytest.raises(ProviderExecutionScopeError):
        asyncio.run(coordinator.execute(req, executor))
    assert len(executor.calls) == 0


# =========================================================================
# EXE-031..032 — InputRef binding
# =========================================================================
def test_exe_032_input_ref_mismatch_rejected(coordinator, running_run):
    from packages.runtime.testing import FakeProviderExecutor

    wrong_ref = RuntimeInputRef(
        source_type="other",
        source_id="other",
        version="0",
    )
    req = _req(running_run, input_ref=wrong_ref)
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    with pytest.raises(ProviderExecutionInputMismatchError):
        asyncio.run(coordinator.execute(req, executor))
    assert len(executor.calls) == 0


# =========================================================================
# EXE-033..037 — Fake executor detailed behavior
# =========================================================================
def test_exe_033_scripted_success_returns_success():
    from packages.runtime import ProviderExecutionOutcomeStatus
    from packages.runtime.testing import FakeProviderExecutor

    fake = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    from packages.domain.ids import ProviderExecutionRequestId

    req = ProviderExecutionRequest(
        request_id=ProviderExecutionRequestId("r"),
        session_id=RuntimeSessionId("s"),
        run_id=RuntimeRunId("ru"),
        attempt_id=ExecutionAttemptId("a"),
        project_id=PROJECT,
        branch_id=BRANCH,
        provider=ProviderIdentifier(name="fake"),
        model=ModelIdentifier(name="m"),
        input_ref=INPUT_REF,
        projected_input={},
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    outcome = asyncio.run(fake.execute(req))
    assert outcome.status is ProviderExecutionOutcomeStatus.SUCCEEDED


def test_exe_034_scripted_failure_returns_failure():
    from packages.runtime import ProviderExecutionOutcomeStatus
    from packages.runtime.testing import FakeProviderExecutor

    failure = RuntimeFailure(
        category=RuntimeFailureCategory.NETWORK,
        code="X",
        message="m",
    )
    fake = FakeProviderExecutor([FakeProviderExecutor.failure(failure)])
    from packages.domain.ids import ProviderExecutionRequestId

    req = ProviderExecutionRequest(
        request_id=ProviderExecutionRequestId("r"),
        session_id=RuntimeSessionId("s"),
        run_id=RuntimeRunId("ru"),
        attempt_id=ExecutionAttemptId("a"),
        project_id=PROJECT,
        branch_id=BRANCH,
        provider=ProviderIdentifier(name="fake"),
        model=ModelIdentifier(name="m"),
        input_ref=INPUT_REF,
        projected_input={},
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    outcome = asyncio.run(fake.execute(req))
    assert outcome.status is ProviderExecutionOutcomeStatus.FAILED


def test_exe_035_calls_recorded():
    from packages.runtime.testing import FakeProviderExecutor

    fake = FakeProviderExecutor(
        [
            FakeProviderExecutor.success({"x": 1}),
            FakeProviderExecutor.failure(
                RuntimeFailure(
                    category=RuntimeFailureCategory.NETWORK,
                    code="X",
                    message="m",
                )
            ),
        ]
    )
    from packages.domain.ids import ProviderExecutionRequestId

    req = ProviderExecutionRequest(
        request_id=ProviderExecutionRequestId("r"),
        session_id=RuntimeSessionId("s"),
        run_id=RuntimeRunId("ru"),
        attempt_id=ExecutionAttemptId("a"),
        project_id=PROJECT,
        branch_id=BRANCH,
        provider=ProviderIdentifier(name="fake"),
        model=ModelIdentifier(name="m"),
        input_ref=INPUT_REF,
        projected_input={},
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    asyncio.run(fake.execute(req))
    asyncio.run(fake.execute(req))
    assert len(fake.calls) == 2


def test_exe_036_outcomes_consumed_in_order():
    from packages.runtime.testing import FakeProviderExecutor

    fake = FakeProviderExecutor(
        [
            FakeProviderExecutor.success({"first": True}),
            FakeProviderExecutor.success({"second": True}),
        ]
    )
    from packages.domain.ids import ProviderExecutionRequestId

    req = ProviderExecutionRequest(
        request_id=ProviderExecutionRequestId("r"),
        session_id=RuntimeSessionId("s"),
        run_id=RuntimeRunId("ru"),
        attempt_id=ExecutionAttemptId("a"),
        project_id=PROJECT,
        branch_id=BRANCH,
        provider=ProviderIdentifier(name="fake"),
        model=ModelIdentifier(name="m"),
        input_ref=INPUT_REF,
        projected_input={},
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    o1 = asyncio.run(fake.execute(req))
    o2 = asyncio.run(fake.execute(req))
    assert o1.response.raw_output == {"first": True}  # type: ignore[union-attr]
    assert o2.response.raw_output == {"second": True}  # type: ignore[union-attr]


def test_exe_037_exhaustion_raises():
    from packages.runtime.testing import FakeProviderExecutor

    fake = FakeProviderExecutor([])
    from packages.domain.ids import ProviderExecutionRequestId

    req = ProviderExecutionRequest(
        request_id=ProviderExecutionRequestId("r"),
        session_id=RuntimeSessionId("s"),
        run_id=RuntimeRunId("ru"),
        attempt_id=ExecutionAttemptId("a"),
        project_id=PROJECT,
        branch_id=BRANCH,
        provider=ProviderIdentifier(name="fake"),
        model=ModelIdentifier(name="m"),
        input_ref=INPUT_REF,
        projected_input={},
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    with pytest.raises(RuntimeError, match="exhausted"):
        asyncio.run(fake.execute(req))


# =========================================================================
# EXE-040 — Request saved before provider call
# =========================================================================
def test_exe_040_request_saved_before_provider_call(
    coordinator,
    running_run,
    request_store,
):
    from packages.runtime.testing import FakeProviderExecutor

    run, att = running_run
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    req = _req(running_run)
    asyncio.run(coordinator.execute(req, executor))
    # Request must be in store (saved before call)
    saved = request_store.list_for_run(run.run_id)
    assert len(saved) == 1
    assert saved[0].request_id == req.request_id


# =========================================================================
# EXE-061..065 — Persistence failure injection
# =========================================================================
def test_exe_061_062_request_store_failure(
    run_mgr,
    running_run,
    response_store,
    event_sink,
    clock,
):
    """Request store save failure → no provider call, no STARTED event."""
    from packages.runtime import RuntimeExecutionCoordinator
    from packages.runtime.testing import FakeProviderExecutor

    class FailingRequestStore:
        def save(self, req):  # type: ignore[no-untyped-def]
            raise RuntimeError("request store boom")

        def get(self, rid):  # type: ignore[no-untyped-def]
            raise KeyError

        def list_for_run(self, rid):  # type: ignore[no-untyped-def]
            return []

    coord = RuntimeExecutionCoordinator(
        run_mgr,
        FailingRequestStore(),
        response_store,
        event_sink,
        now=clock,
    )
    run, att = running_run
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    req = _req(running_run)
    with pytest.raises(Exception):
        asyncio.run(coord.execute(req, executor))
    assert len(executor.calls) == 0  # EXE-061


def test_exe_063_065_response_store_failure(
    run_mgr,
    running_run,
    request_store,
    event_sink,
    clock,
):
    """Response store save failure → Run FAILED, not SUCCEEDED."""
    from packages.runtime import RuntimeExecutionCoordinator
    from packages.runtime.testing import FakeProviderExecutor

    class FailingResponseStore:
        def save(self, resp):  # type: ignore[no-untyped-def]
            raise RuntimeError("response store boom")

        def get(self, rid):  # type: ignore[no-untyped-def]
            raise KeyError

        def list_for_run(self, rid):  # type: ignore[no-untyped-def]
            return []

    coord = RuntimeExecutionCoordinator(
        run_mgr,
        request_store,
        FailingResponseStore(),
        event_sink,
        now=clock,
    )
    run, att = running_run
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    req = _req(running_run)
    final_run, outcome = asyncio.run(coord.execute(req, executor))

    assert final_run.status is RunStatus.FAILED  # EXE-063
    assert outcome.failure is not None  # EXE-064/065
    assert outcome.failure.code == "PROVIDER_RESPONSE_PERSIST_FAILED"  # EXE-065


# =========================================================================
# EXE-067..069 — Event ordering
# =========================================================================
def test_exe_067_success_event_ordering(
    coordinator,
    running_run,
    event_sink,
):
    from packages.runtime.testing import FakeProviderExecutor

    run, att = running_run
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    req = _req(running_run)
    asyncio.run(coordinator.execute(req, executor))

    types = [e.event_type for e in event_sink.list_for_run(run.run_id)]
    # Filter to provider + run terminal events
    relevant = [
        t
        for t in types
        if t.value.startswith("PROVIDER_") or t.value in ("ATTEMPT_SUCCEEDED", "RUN_SUCCEEDED")
    ]
    assert relevant == [
        RuntimeEventType.PROVIDER_EXECUTION_STARTED,
        RuntimeEventType.PROVIDER_EXECUTION_SUCCEEDED,
        RuntimeEventType.ATTEMPT_SUCCEEDED,
        RuntimeEventType.RUN_SUCCEEDED,
    ]


def test_exe_068_failure_event_ordering(
    coordinator,
    running_run,
    event_sink,
):
    from packages.runtime.testing import FakeProviderExecutor

    run, att = running_run
    failure = RuntimeFailure(
        category=RuntimeFailureCategory.RATE_LIMIT,
        code="RATE_LIMITED",
        message="rate limited",
    )
    executor = FakeProviderExecutor([FakeProviderExecutor.failure(failure)])
    req = _req(running_run)
    asyncio.run(coordinator.execute(req, executor))

    types = [e.event_type for e in event_sink.list_for_run(run.run_id)]
    relevant = [
        t
        for t in types
        if t.value.startswith("PROVIDER_") or t.value in ("ATTEMPT_FAILED", "RUN_FAILED")
    ]
    assert relevant == [
        RuntimeEventType.PROVIDER_EXECUTION_STARTED,
        RuntimeEventType.PROVIDER_EXECUTION_FAILED,
        RuntimeEventType.ATTEMPT_FAILED,
        RuntimeEventType.RUN_FAILED,
    ]


def test_exe_069_exception_event_ordering(
    coordinator,
    running_run,
    event_sink,
):
    class BoomExecutor:
        async def execute(self, request):  # type: ignore[no-untyped-def]
            raise RuntimeError("boom")

    run, att = running_run
    req = _req(running_run)
    asyncio.run(coordinator.execute(req, BoomExecutor()))

    types = [e.event_type for e in event_sink.list_for_run(run.run_id)]
    relevant = [
        t
        for t in types
        if t.value.startswith("PROVIDER_") or t.value in ("ATTEMPT_FAILED", "RUN_FAILED")
    ]
    assert relevant == [
        RuntimeEventType.PROVIDER_EXECUTION_STARTED,
        RuntimeEventType.PROVIDER_EXECUTION_FAILED,
        RuntimeEventType.ATTEMPT_FAILED,
        RuntimeEventType.RUN_FAILED,
    ]


# =========================================================================
# EXE-070 — Event metadata has provider/model/request_id
# =========================================================================
def test_exe_070_event_metadata_has_provider_model_request(
    coordinator,
    running_run,
    event_sink,
):
    from packages.runtime.testing import FakeProviderExecutor

    run, att = running_run
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    req = _req(running_run)
    asyncio.run(coordinator.execute(req, executor))

    started = next(
        e
        for e in event_sink.list_for_run(run.run_id)
        if e.event_type is RuntimeEventType.PROVIDER_EXECUTION_STARTED
    )
    assert started.metadata["provider"] == "fake"
    assert started.metadata["model"] == "fake-model-v1"
    assert started.metadata["request_id"] == "req-1"


# =========================================================================
# EXE-046..047 — OutputRef points to response artifact
# =========================================================================
def test_exe_046_047_output_ref_points_to_response(
    coordinator,
    running_run,
    response_store,
    run_mgr,
):
    from packages.runtime.testing import FakeProviderExecutor

    run, att = running_run
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    req = _req(running_run)
    final_run, outcome = asyncio.run(coordinator.execute(req, executor))

    assert final_run.output_ref is not None
    assert final_run.output_ref.artifact_type == "provider_response"

    # The artifact_id must match the response's artifact_id
    response = outcome.response
    assert response is not None  # type: ignore[union-attr]
    assert str(response.artifact_id) == final_run.output_ref.artifact_id

    # Attempt also has the same output_ref
    attempts = run_mgr.list_attempts(run.run_id)
    assert attempts[-1].output_ref == final_run.output_ref


# =========================================================================
# EXE-080 — list_for_run on stores
# =========================================================================
def test_exe_080_list_for_run(
    coordinator,
    running_run,
    request_store,
    response_store,
):
    from packages.runtime.testing import FakeProviderExecutor

    run, att = running_run
    executor = FakeProviderExecutor([FakeProviderExecutor.success({"x": 1})])
    req = _req(running_run)
    asyncio.run(coordinator.execute(req, executor))

    assert len(request_store.list_for_run(run.run_id)) == 1
    assert len(response_store.list_for_run(run.run_id)) == 1


# =========================================================================
# EXE-081..087 — Architecture boundary via AST
# =========================================================================
def test_exe_081_087_runtime_no_forbidden_imports():
    import ast
    from pathlib import Path

    from packages.runtime import provider as _prov

    runtime_root = Path(_prov.__file__).parent
    forbidden = {
        "cognition",
        "control",
        "openai",
        "anthropic",
        "pydantic_ai",
        "temporalio",
        "requests",
        "httpx",
    }
    violations = []
    for py in sorted(runtime_root.rglob("*.py")):
        tree = ast.parse(py.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    top = alias.name.split(".")[0]
                    if top in forbidden:
                        violations.append(f"{py}: import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    top = node.module.split(".")[0]
                    if top in forbidden:
                        violations.append(f"{py}: from {node.module}")
    assert not violations, "runtime has forbidden imports:\n" + "\n".join(violations)
