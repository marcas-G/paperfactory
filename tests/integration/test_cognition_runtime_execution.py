"""INT-M2-M3-001 / INT-M2-M3-002 — M2 ↔ M3 composition.

Integration tests MAY import both cognition and runtime. Production packages
must NOT cross-import.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest

from packages.cognition import (
    OpenAIProjector,
    OutputValidationEngine,
    OutputValidationStatus,
    StructuredOutputCandidate,
)
from packages.cognition.testing import (
    ExampleCognitiveAssessment,
    ExampleCognitiveAssessmentValidator,
    InMemoryCognitiveResultStore,
    InMemoryOutputContractRegistry,
    InMemoryOutputValidationResultStore,
    InMemoryStructuredOutputValidatorRegistry,
)
from packages.domain.ids import (
    ActionId,
    BranchId,
    CognitiveResultId,
    ContextBundleId,
    OutputCandidateId,
    OutputContractId,
    OutputSchemaId,
    OutputValidationId,
    ProjectId,
    PromptPackageId,
    PromptRequestId,
    ProviderExecutionRequestId,
)
from packages.runtime import (
    ModelIdentifier,
    ProviderExecutionRequest,
    ProviderIdentifier,
    RuntimeInputRef,
    RuntimeRunManager,
    RuntimeSessionManager,
)
from packages.runtime.testing import (
    FakeProviderExecutor,
    InMemoryExecutionAttemptStore,
    InMemoryProviderExecutionRequestStore,
    InMemoryProviderExecutionResponseStore,
    InMemoryRuntimeEventSink,
    InMemoryRuntimeRunStore,
    InMemoryRuntimeSessionStore,
)

PROJECT = ProjectId("P1")
BRANCH = BranchId("B1")
ACTION = ActionId("A1")
REVISION = 7
TZ = datetime(2026, 1, 1, tzinfo=UTC)


@pytest.fixture
def runtime_stack():
    sess_store = InMemoryRuntimeSessionStore()
    run_store = InMemoryRuntimeRunStore()
    att_store = InMemoryExecutionAttemptStore()
    sink = InMemoryRuntimeEventSink()
    import itertools
    c = itertools.count
    sm = RuntimeSessionManager(
        sess_store, run_store, sink,
        session_id_factory=lambda: f"s-{next(c(1))}",
        event_id_factory=lambda: f"e-{next(c(100))}",
        now=lambda: TZ,
    )
    rm = RuntimeRunManager(
        sess_store, run_store, att_store, sink,
        run_id_factory=lambda: f"r-{next(c(1))}",
        attempt_id_factory=lambda: f"a-{next(c(1))}",
        event_id_factory=lambda: f"e-{next(c(200))}",
        now=lambda: TZ,
    )
    return sm, rm, sink


def _build_prompt_package():
    """Build a minimal PromptPackage with output contract."""
    from packages.cognition import PromptPackage

    return PromptPackage(
        package_id=PromptPackageId("pkg-1"),
        request_id=PromptRequestId("pr-1"),
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        context_bundle_id=ContextBundleId("b-1"),
        output_contract_id=OutputContractId("example-assessment"),
        output_contract_version=1,
        prompt_policy_id="default", prompt_policy_version=1,
        assembler_version="a/0.1",
        segments=(), template_refs=(), source_refs=(),
        created_at=TZ,
    )


def _setup_output_validation():
    from packages.cognition import OutputContract, OutputSchemaRef

    cr = InMemoryOutputContractRegistry()
    cr.register(OutputContract(
        contract_id=OutputContractId("example-assessment"), version=1,
        schema_ref=OutputSchemaRef(OutputSchemaId("example-assessment"), 1),
        strict=True, description="test",
    ))
    vr = InMemoryStructuredOutputValidatorRegistry()
    vr.register(ExampleCognitiveAssessmentValidator())
    vs = InMemoryOutputValidationResultStore()
    rs = InMemoryCognitiveResultStore()
    import itertools
    _v = itertools.count(1)
    _r = itertools.count(1)
    engine = OutputValidationEngine(
        cr, vr, vs, rs,
        validation_id_factory=lambda: OutputValidationId(f"v-{next(_v)}"),
        result_id_factory=lambda: CognitiveResultId(f"cr-{next(_r)}"),
        now=lambda: TZ,
    )
    return engine, vs, rs


def test_int_m2_m3_001_valid_composition(runtime_stack):
    """M2 projection → M3 execution → M2 output validation = VALID."""
    from packages.runtime.execution import RuntimeExecutionCoordinator

    sm, rm, sink = runtime_stack
    pkg = _build_prompt_package()
    projection = OpenAIProjector().project(pkg)

    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    inp = RuntimeInputRef(source_type="prompt_package", source_id="pkg-1", version="1")
    run = rm.create_run(session_id=session.session_id, input_ref=inp)
    rm.mark_ready(run.run_id)
    run_started, att = rm.start_run(run.run_id)

    req = ProviderExecutionRequest(
        request_id=ProviderExecutionRequestId("req-1"),
        session_id=session.session_id,
        run_id=run.run_id,
        attempt_id=att.attempt_id,
        project_id=PROJECT, branch_id=BRANCH,
        provider=ProviderIdentifier(name="fake"),
        model=ModelIdentifier(name="fake-v1"),
        input_ref=inp,
        projected_input=projection,
        created_at=TZ,
    )
    fake = FakeProviderExecutor([FakeProviderExecutor.success(
        {"judgement": "CONTRADICT", "confidence": 0.93, "reason_codes": ["COUNTEREXAMPLE_FOUND"]},
    )])
    coord = RuntimeExecutionCoordinator(
        rm,
        InMemoryProviderExecutionRequestStore(),
        InMemoryProviderExecutionResponseStore(),
        sink,
        event_id_factory=lambda: "e-x",
        now=lambda: TZ,
    )
    final_run, outcome = asyncio.run(coord.execute(req, fake))
    assert final_run.status.value == "SUCCEEDED"

    # M2 output validation on raw output
    engine, vs, rs = _setup_output_validation()
    response = outcome.response
    candidate = StructuredOutputCandidate(
        candidate_id=OutputCandidateId("c-1"),
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        prompt_package_id=pkg.package_id,
        output_contract_id=OutputContractId("example-assessment"),
        output_contract_version=1,
        payload=response.raw_output,
        created_at=TZ,
    )
    result = engine.validate(candidate, pkg, REVISION)
    assert result.status is OutputValidationStatus.VALID
    envelope = rs.list_for_project(PROJECT, BRANCH)[0]
    assert isinstance(envelope.payload, ExampleCognitiveAssessment)
    assert envelope.payload.judgement == "CONTRADICT"  # type: ignore[union-attr]


def test_int_m2_m3_002_invalid_output_but_run_succeeded(runtime_stack):
    """Provider success + cognitive INVALID = Run stays SUCCEEDED."""
    from packages.runtime.execution import RuntimeExecutionCoordinator

    sm, rm, sink = runtime_stack
    pkg = _build_prompt_package()
    projection = OpenAIProjector().project(pkg)

    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    inp = RuntimeInputRef(source_type="prompt_package", source_id="pkg-1", version="1")
    run = rm.create_run(session_id=session.session_id, input_ref=inp)
    rm.mark_ready(run.run_id)
    run_started, att = rm.start_run(run.run_id)

    req = ProviderExecutionRequest(
        request_id=ProviderExecutionRequestId("req-2"),
        session_id=session.session_id,
        run_id=run.run_id,
        attempt_id=att.attempt_id,
        project_id=PROJECT, branch_id=BRANCH,
        provider=ProviderIdentifier(name="fake"),
        model=ModelIdentifier(name="fake-v1"),
        input_ref=inp,
        projected_input=projection,
        created_at=TZ,
    )
    fake = FakeProviderExecutor([FakeProviderExecutor.success(
        {"judgement": "BAD_VALUE", "confidence": 9},
    )])
    coord = RuntimeExecutionCoordinator(
        rm,
        InMemoryProviderExecutionRequestStore(),
        InMemoryProviderExecutionResponseStore(),
        sink,
        event_id_factory=lambda: "e-y",
        now=lambda: TZ,
    )
    final_run, outcome = asyncio.run(coord.execute(req, fake))
    assert final_run.status.value == "SUCCEEDED"

    # M2 output validation = INVALID
    engine, vs, rs = _setup_output_validation()
    response = outcome.response
    candidate = StructuredOutputCandidate(
        candidate_id=OutputCandidateId("c-2"),
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        prompt_package_id=pkg.package_id,
        output_contract_id=OutputContractId("example-assessment"),
        output_contract_version=1,
        payload=response.raw_output,
        created_at=TZ,
    )
    result = engine.validate(candidate, pkg, REVISION)
    assert result.status is OutputValidationStatus.INVALID
    assert rs.list_for_project(PROJECT, BRANCH) == []

    # Runtime Run is STILL SUCCEEDED — not retroactively FAILED
    assert rm.get_run(run.run_id).status.value == "SUCCEEDED"
