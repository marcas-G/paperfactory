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
    AgentId,
    BranchId,
    CognitiveResultId,
    ContextBundleId,
    ModelExecutionConfigId,
    ModelExecutionProfileId,
    ModelSelectionPolicyId,
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


# =========================================================================
# INT-M2-M3-AGT-001 / INT-M2-M3-AGT-002 — Agent Binding composition (STEP-013)
#
# Integration tests MAY import both cognition and runtime. Production packages
# must NOT cross-import. These tests route the M2 PromptPackage through an
# AgentExecutionBinding (AgentProviderExecutionRequestFactory) before reaching
# the existing provider execution path.
# =========================================================================
def _build_agent_stack(runtime_stack):
    """Given (sm, rm, sink), wire agent registries + manager + factory."""
    import itertools

    from packages.runtime import (
        AgentBindingManager,
        AgentDefinition,
        AgentProviderExecutionRequestFactory,
        ModelCapability,
        ModelExecutionConfig,
        ModelExecutionProfile,
        ModelExecutionProfileRef,
    )
    from packages.runtime.testing import (
        InMemoryAgentDefinitionRegistry,
        InMemoryAgentExecutionBindingStore,
        InMemoryModelExecutionConfigRegistry,
        InMemoryModelExecutionProfileRegistry,
    )
    sm, rm, sink = runtime_stack
    c = itertools.count(5000)
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()

    profile = ModelExecutionProfile(
        profile_id=ModelExecutionProfileId("openai-profile"), version="v1",
        name="openai fake profile", description="d",
        provider=ProviderIdentifier(name="openai"),
        model=ModelIdentifier(name="fake-openai-model"),
        capabilities=frozenset({ModelCapability.TEXT_GENERATION,
                                ModelCapability.STRUCTURED_OUTPUT}),
    )
    profile_reg.register(profile)
    config_reg.register(ModelExecutionConfig(
        config_id=ModelExecutionConfigId("openai-config"), version="v1",
        name="c", description="d", profile_ref=profile.ref,
        parameter_settings=()))
    agent = AgentDefinition(
        agent_id=AgentId("agent-A"), version="v1",
        name="agent-A v1", description="d",
        allowed_execution_profiles=(ModelExecutionProfileRef(
            ModelExecutionProfileId("openai-profile"), "v1"),))
    agent_reg.register(agent)

    mgr = AgentBindingManager(
        sm._sessions, rm._runs, agent_reg, profile_reg, config_reg, binding_store, sink,
        binding_id_factory=lambda: f"bind-{next(c)}",
        event_id_factory=lambda: f"e-{next(c)}",
        now=lambda: TZ,
    )
    factory = AgentProviderExecutionRequestFactory(rm._attempts)
    return mgr, factory, agent_reg, profile_reg, binding_store


def test_int_m2_m3_agt_001_agent_binding_valid_composition(runtime_stack):
    """Full agent-bound execution: M2 projection -> binding -> M3 -> M2 VALID."""
    from packages.runtime import RuntimeEventType, RuntimeExecutionCoordinator
    from packages.runtime.testing import (
        FakeProviderExecutor,
        InMemoryProviderExecutionRequestStore,
        InMemoryProviderExecutionResponseStore,
    )

    sm, rm, sink = runtime_stack
    mgr, factory, agent_reg, profile_reg, binding_store = _build_agent_stack(runtime_stack)

    pkg = _build_prompt_package()
    projection = OpenAIProjector().project(pkg)

    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    inp = RuntimeInputRef(source_type="prompt_package", source_id="pkg-1", version="1")
    run = rm.create_run(session_id=session.session_id, input_ref=inp)

    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("openai-profile"),
        execution_profile_version="v1",
        execution_config_id=ModelExecutionConfigId("openai-config"),
        execution_config_version="v1",
    )
    rm.mark_ready(run.run_id)
    started_run, att = rm.start_run(run.run_id)

    # Factory sources provider/model/input_ref from Binding/Run — caller passes
    # only the projected_input.
    request = factory.build(
        binding=binding, session=session, run=started_run, attempt=att,
        request_id=ProviderExecutionRequestId("req-agt-1"),
        projected_input=projection, created_at=TZ,
    )
    assert request.provider.name == "openai"
    assert request.model.name == "fake-openai-model"
    assert request.input_ref == inp

    fake = FakeProviderExecutor([FakeProviderExecutor.success(
        {"judgement": "CONTRADICT", "confidence": 0.91,
         "reason_codes": ["COUNTEREXAMPLE_FOUND"]})])
    coord = RuntimeExecutionCoordinator(
        rm,
        InMemoryProviderExecutionRequestStore(),
        InMemoryProviderExecutionResponseStore(),
        sink,
        event_id_factory=lambda: "e-agt-1",
        now=lambda: TZ,
    )
    final_run, outcome = asyncio.run(coord.execute(request, fake))
    assert final_run.status.value == "SUCCEEDED"

    # AGENT_BOUND is in the event sequence
    types = [e.event_type for e in sink.list_for_run(run.run_id)]
    assert RuntimeEventType.AGENT_BOUND in types

    # Binding unchanged after execution
    assert binding_store.get_for_run(run.run_id) == binding

    # M2 validation = VALID
    engine, vs, rs = _setup_output_validation()
    response = outcome.response
    candidate = StructuredOutputCandidate(
        candidate_id=OutputCandidateId("c-agt-1"),
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

    # Cross-module import discipline: integration imports both, production does not
    import packages.cognition  # noqa: F401
    import packages.runtime  # noqa: F401

    # AgentDefinition has no cognitive policy
    from packages.runtime import AgentDefinition
    ad_fields = {f.name for f in AgentDefinition.__dataclass_fields__.values()}
    assert "prompt_policy" not in ad_fields
    assert "output_contract" not in ad_fields
    assert "context_policy" not in ad_fields


def test_int_m2_m3_agt_002_invalid_output_but_run_succeeded(runtime_stack):
    """Agent-bound execution: provider success + cognitive INVALID = Run stays
    SUCCEEDED, binding unchanged, no rebind/switch/retry."""
    from packages.runtime import RuntimeExecutionCoordinator
    from packages.runtime.testing import (
        FakeProviderExecutor,
        InMemoryProviderExecutionRequestStore,
        InMemoryProviderExecutionResponseStore,
    )

    sm, rm, sink = runtime_stack
    mgr, factory, agent_reg, profile_reg, binding_store = _build_agent_stack(runtime_stack)

    pkg = _build_prompt_package()
    projection = OpenAIProjector().project(pkg)

    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    inp = RuntimeInputRef(source_type="prompt_package", source_id="pkg-1", version="1")
    run = rm.create_run(session_id=session.session_id, input_ref=inp)

    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("openai-profile"),
        execution_profile_version="v1",
        execution_config_id=ModelExecutionConfigId("openai-config"),
        execution_config_version="v1",
    )
    rm.mark_ready(run.run_id)
    started_run, att = rm.start_run(run.run_id)

    request = factory.build(
        binding=binding, session=session, run=started_run, attempt=att,
        request_id=ProviderExecutionRequestId("req-agt-2"),
        projected_input=projection, created_at=TZ,
    )
    fake = FakeProviderExecutor([FakeProviderExecutor.success(
        {"judgement": "BAD_VALUE", "confidence": 9})])
    coord = RuntimeExecutionCoordinator(
        rm,
        InMemoryProviderExecutionRequestStore(),
        InMemoryProviderExecutionResponseStore(),
        sink,
        event_id_factory=lambda: "e-agt-2",
        now=lambda: TZ,
    )
    final_run, outcome = asyncio.run(coord.execute(request, fake))
    # M3 Run = SUCCEEDED even though cognitive output is invalid
    assert final_run.status.value == "SUCCEEDED"
    assert len(fake.calls) == 1  # no retry, no second attempt

    # M2 validation = INVALID
    engine, vs, rs = _setup_output_validation()
    response = outcome.response
    candidate = StructuredOutputCandidate(
        candidate_id=OutputCandidateId("c-agt-2"),
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

    # Binding unchanged; Run still SUCCEEDED (not retroactively FAILED)
    assert binding_store.get_for_run(run.run_id) == binding
    assert rm.get_run(run.run_id).status.value == "SUCCEEDED"


# =========================================================================
# INT-M2-M3-CFG-001 / INT-M2-M3-SEL-001 — config + selection composition
# (STEP-014). Integration tests MAY import both cognition and runtime.
# =========================================================================
def test_int_m2_m3_cfg_001_config_composition(runtime_stack):
    """M2 projection -> Agent/Profile/Config binding -> M3 execute ->
    M2 output validation VALID; runtime carries canonical parameters."""
    import itertools

    from packages.runtime import (
        AgentBindingManager,
        AgentDefinition,
        AgentProviderExecutionRequestFactory,
        ModelCapability,
        ModelExecutionConfig,
        ModelExecutionProfile,
        ModelParameter,
        ModelParameterSetting,
        RuntimeExecutionCoordinator,
    )
    from packages.runtime.testing import (
        InMemoryAgentDefinitionRegistry,
        InMemoryAgentExecutionBindingStore,
        InMemoryModelExecutionConfigRegistry,
        InMemoryModelExecutionProfileRegistry,
    )

    sm, rm, sink = runtime_stack
    c = itertools.count(8000)
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()

    profile = ModelExecutionProfile(
        profile_id=ModelExecutionProfileId("openai-profile"), version="v1",
        name="p", description="d",
        provider=ProviderIdentifier(name="openai"),
        model=ModelIdentifier(name="fake-openai-model"),
        capabilities=frozenset({ModelCapability.TEXT_GENERATION,
                                ModelCapability.STRUCTURED_OUTPUT}),
        supported_parameters=frozenset({ModelParameter.TEMPERATURE,
                                        ModelParameter.MAX_OUTPUT_UNITS}),
    )
    profile_reg.register(profile)
    settings = (ModelParameterSetting(ModelParameter.TEMPERATURE, 0.3),
                ModelParameterSetting(ModelParameter.MAX_OUTPUT_UNITS, 1024))
    config = ModelExecutionConfig(
        config_id=ModelExecutionConfigId("cfg-1"), version="v1",
        name="c", description="d", profile_ref=profile.ref,
        parameter_settings=settings)
    config_reg.register(config)
    agent = AgentDefinition(
        agent_id=AgentId("agent-A"), version="v1", name="a", description="d",
        allowed_execution_profiles=(profile.ref,))
    agent_reg.register(agent)

    mgr = AgentBindingManager(
        sm._sessions, rm._runs, agent_reg, profile_reg, config_reg, binding_store, sink,
        binding_id_factory=lambda: f"bind-{next(c)}",
        event_id_factory=lambda: f"e-{next(c)}",
        now=lambda: TZ,
    )
    factory = AgentProviderExecutionRequestFactory(rm._attempts)

    pkg = _build_prompt_package()
    projection = OpenAIProjector().project(pkg)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    inp = RuntimeInputRef(source_type="prompt_package", source_id="pkg-1", version="1")
    run = rm.create_run(session_id=session.session_id, input_ref=inp)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("openai-profile"),
        execution_profile_version="v1",
        execution_config_id=ModelExecutionConfigId("cfg-1"),
        execution_config_version="v1",
    )
    rm.mark_ready(run.run_id)
    started_run, att = rm.start_run(run.run_id)
    request = factory.build(
        binding=binding, session=session, run=started_run, attempt=att,
        request_id=ProviderExecutionRequestId("req-cfg-1"),
        projected_input=projection, created_at=TZ,
    )
    assert request.execution_parameters == settings
    fake = FakeProviderExecutor([FakeProviderExecutor.success(
        {"judgement": "CONTRADICT", "confidence": 0.88,
         "reason_codes": ["COUNTEREXAMPLE_FOUND"]})])
    coord = RuntimeExecutionCoordinator(
        rm,
        InMemoryProviderExecutionRequestStore(),
        InMemoryProviderExecutionResponseStore(),
        sink,
        event_id_factory=lambda: "e-cfg-1",
        now=lambda: TZ,
    )
    final_run, outcome = asyncio.run(coord.execute(request, fake))
    assert final_run.status.value == "SUCCEEDED"

    # M2 validation = VALID
    engine, vs, rs = _setup_output_validation()
    candidate = StructuredOutputCandidate(
        candidate_id=OutputCandidateId("c-cfg-1"),
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        prompt_package_id=pkg.package_id,
        output_contract_id=OutputContractId("example-assessment"),
        output_contract_version=1,
        payload=outcome.response.raw_output,
        created_at=TZ,
    )
    result = engine.validate(candidate, pkg, REVISION)
    assert result.status is OutputValidationStatus.VALID
    # cross-module discipline
    import packages.cognition  # noqa: F401
    import packages.runtime  # noqa: F401


def test_int_m2_m3_sel_001_selection_then_explicit_bind(runtime_stack):
    """Selection Recommendation -> explicit caller Config + bind -> binding.
    Selection does NOT auto-bind and does NOT auto-select Config."""
    import itertools

    from packages.runtime import (
        AgentBindingManager,
        AgentDefinition,
        ModelCapability,
        ModelExecutionConfig,
        ModelExecutionProfile,
        ModelExecutionProfileRef,
        ModelParameter,
        ModelParameterSetting,
        ModelSelectionEngine,
        ModelSelectionPolicy,
        ModelSelectionRequirement,
        ModelSelectionSignals,
        ModelSelectionStatus,
        ModelSelectionWeights,
    )
    from packages.runtime.testing import (
        InMemoryAgentDefinitionRegistry,
        InMemoryAgentExecutionBindingStore,
        InMemoryModelExecutionConfigRegistry,
        InMemoryModelExecutionProfileRegistry,
        InMemoryModelSelectionRecommendationStore,
    )

    sm, rm, sink = runtime_stack
    c = itertools.count(9000)
    agent_reg = InMemoryAgentDefinitionRegistry()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    rec_store = InMemoryModelSelectionRecommendationStore()
    binding_store = InMemoryAgentExecutionBindingStore()

    ref = ModelExecutionProfileRef(ModelExecutionProfileId("openai-profile"), "v1")
    profile = ModelExecutionProfile(
        profile_id=ref.profile_id, version="v1", name="p", description="d",
        provider=ProviderIdentifier(name="openai"),
        model=ModelIdentifier(name="fake-openai-model"),
        capabilities=frozenset({ModelCapability.TEXT_GENERATION,
                                ModelCapability.STRUCTURED_OUTPUT}),
        supported_parameters=frozenset({ModelParameter.TEMPERATURE}),
    )
    profile_reg.register(profile)
    agent = AgentDefinition(
        agent_id=AgentId("agent-A"), version="v1", name="a", description="d",
        allowed_execution_profiles=(ref,))
    agent_reg.register(agent)

    eng = ModelSelectionEngine(agent_reg, profile_reg, rec_store,
        evaluation_id_factory=lambda: f"ev-{next(c)}", now=lambda: TZ)
    rec = eng.evaluate(
        agent_id=AgentId("agent-A"),  # resolve the real agent definition
        agent_version="v1",
        policy=ModelSelectionPolicy(
            policy_id=ModelSelectionPolicyId("pol"), version="v1",
            weights=ModelSelectionWeights(0.5, 0.2, 0.2, 0.1)),
        requirement=ModelSelectionRequirement(
            required_capabilities=frozenset({ModelCapability.STRUCTURED_OUTPUT}),
            required_parameters=frozenset(),
            allowed_providers=frozenset(),
            forbidden_profiles=frozenset()),
        signals={ref: ModelSelectionSignals(0.9, 0.7, 0.6, 0.8, True)})
    assert rec.status is ModelSelectionStatus.RECOMMENDED
    selected = rec.selected_profile_ref
    assert selected == ref

    # No binding yet
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    inp = RuntimeInputRef(source_type="prompt_package", source_id="pkg-1", version="1")
    run = rm.create_run(session_id=session.session_id, input_ref=inp)
    assert binding_store.get_for_run(run.run_id) is None

    # caller explicitly selects Config + binds
    config = ModelExecutionConfig(
        config_id=ModelExecutionConfigId("cfg-sel"), version="v1",
        name="c", description="d", profile_ref=selected,
        parameter_settings=(ModelParameterSetting(ModelParameter.TEMPERATURE, 0.2),))
    config_reg.register(config)
    mgr = AgentBindingManager(
        sm._sessions, rm._runs, agent_reg, profile_reg, config_reg, binding_store, sink,
        binding_id_factory=lambda: f"bind-{next(c)}",
        event_id_factory=lambda: f"e-{next(c)}",
        now=lambda: TZ,
    )
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=selected.profile_id,
        execution_profile_version=selected.version,
        execution_config_id=ModelExecutionConfigId("cfg-sel"),
        execution_config_version="v1")
    assert binding_store.get_for_run(run.run_id) is binding
    # exact-version pinning proven
    assert binding.execution_config_version == "v1"
    assert binding.resolved_parameter_settings[0].value == 0.2
