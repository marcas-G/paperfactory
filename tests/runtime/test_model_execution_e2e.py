"""M3-CFG-001 / M3-CFG-002 — exact model execution config binding, end-to-end."""
from __future__ import annotations

import asyncio
import itertools
from datetime import UTC, datetime

from packages.domain.ids import (
    AgentId,
    BranchId,
    ModelExecutionConfigId,
    ModelExecutionProfileId,
    ProjectId,
    ProviderExecutionRequestId,
)
from packages.runtime import (
    AgentBindingManager,
    AgentDefinition,
    AgentProviderExecutionRequestFactory,
    ModelCapability,
    ModelExecutionConfig,
    ModelExecutionProfile,
    ModelIdentifier,
    ModelParameter,
    ModelParameterSetting,
    ProviderIdentifier,
    RuntimeExecutionCoordinator,
    RuntimeInputRef,
    RuntimeRunManager,
    RuntimeSessionManager,
)
from packages.runtime.testing import (
    FakeProviderExecutor,
    InMemoryAgentDefinitionRegistry,
    InMemoryAgentExecutionBindingStore,
    InMemoryExecutionAttemptStore,
    InMemoryModelExecutionConfigRegistry,
    InMemoryModelExecutionProfileRegistry,
    InMemoryProviderExecutionRequestStore,
    InMemoryProviderExecutionResponseStore,
    InMemoryRuntimeEventSink,
    InMemoryRuntimeRunStore,
    InMemoryRuntimeSessionStore,
)

PROJECT = ProjectId("P1")
BRANCH = BranchId("B1")
TZ = datetime(2026, 1, 1, tzinfo=UTC)
INPUT_REF = RuntimeInputRef(source_type="prompt_package", source_id="pkg-1", version="1")
FAKE_PROVIDER = ProviderIdentifier(name="fake")
FAKE_MODEL = ModelIdentifier(name="fake-model")
CAPS = frozenset({ModelCapability.TEXT_GENERATION, ModelCapability.STRUCTURED_OUTPUT})
PARAMS = frozenset({ModelParameter.TEMPERATURE, ModelParameter.MAX_OUTPUT_UNITS})


class Counter:
    _g = itertools.count(1)

    def __init__(self, prefix):
        self._p = prefix

    def __call__(self):
        return f"{self._p}-{next(Counter._g)}"


def _stack():
    sess_store = InMemoryRuntimeSessionStore()
    run_store = InMemoryRuntimeRunStore()
    att_store = InMemoryExecutionAttemptStore()
    sink = InMemoryRuntimeEventSink()

    def now():
        return TZ

    sm = RuntimeSessionManager(sess_store, run_store, sink,
        session_id_factory=Counter("s"), event_id_factory=Counter("e"), now=now)
    rm = RuntimeRunManager(sess_store, run_store, att_store, sink,
        run_id_factory=Counter("r"), attempt_id_factory=Counter("a"),
        event_id_factory=Counter("e"), now=now)
    return sm, rm, sink, sess_store, run_store, att_store, now


def test_m3_cfg_001_exact_configuration_binding():
    """Full bind with exact Config -> request carries exact params -> success."""
    sm, rm, sink, sess_store, run_store, att_store, now = _stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()

    profile = ModelExecutionProfile(
        profile_id=ModelExecutionProfileId("P"), version="v1",
        name="P", description="d", provider=FAKE_PROVIDER, model=FAKE_MODEL,
        capabilities=CAPS, supported_parameters=PARAMS)
    profile_reg.register(profile)
    settings = (ModelParameterSetting(ModelParameter.TEMPERATURE, 0.2),
                ModelParameterSetting(ModelParameter.MAX_OUTPUT_UNITS, 2048))
    config = ModelExecutionConfig(
        config_id=ModelExecutionConfigId("C"), version="v3",
        name="C", description="d", profile_ref=profile.ref,
        parameter_settings=settings)
    config_reg.register(config)
    agent = AgentDefinition(
        agent_id=AgentId("A"), version="v2", name="A", description="d",
        allowed_execution_profiles=(profile.ref,))
    agent_reg.register(agent)

    mgr = AgentBindingManager(sess_store, run_store, agent_reg, profile_reg,
        config_reg, binding_store, sink,
        binding_id_factory=Counter("b"), event_id_factory=Counter("e"), now=now)

    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("A"), agent_version="v2",
        execution_profile_id=ModelExecutionProfileId("P"),
        execution_profile_version="v1",
        execution_config_id=ModelExecutionConfigId("C"),
        execution_config_version="v3")

    # Binding pins Agent/Profile/Config versions + parameter snapshot
    assert binding.agent_version == "v2"
    assert binding.execution_profile_version == "v1"
    assert binding.execution_config_version == "v3"
    assert binding.resolved_parameter_settings == settings

    rm.mark_ready(run.run_id)
    started_run, att = rm.start_run(run.run_id)
    factory = AgentProviderExecutionRequestFactory(att_store)
    request = factory.build(
        binding=binding, session=session, run=started_run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input={"s": 1}, created_at=TZ)
    # execution_parameters exactly match the binding snapshot
    assert request.execution_parameters == settings

    fake = FakeProviderExecutor([FakeProviderExecutor.success({"ok": True})])
    coord = RuntimeExecutionCoordinator(
        rm, InMemoryProviderExecutionRequestStore(),
        InMemoryProviderExecutionResponseStore(), sink,
        response_id_factory=Counter("resp"), artifact_id_factory=Counter("art"),
        event_id_factory=Counter("e"), now=now)
    final_run, outcome = asyncio.run(coord.execute(request, fake))
    assert final_run.status.value == "SUCCEEDED"
    assert len(fake.calls) == 1  # exactly one call, no retry
    # Runtime did not translate provider params — fake saw canonical settings
    assert fake.calls[0].execution_parameters == settings


def test_m3_cfg_002_config_version_pinning():
    """Binding pins exact Config version; coexisting v2 does not upgrade it."""
    sm, rm, sink, sess_store, run_store, att_store, now = _stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()

    profile = ModelExecutionProfile(
        profile_id=ModelExecutionProfileId("P"), version="v1",
        name="P", description="d", provider=FAKE_PROVIDER, model=FAKE_MODEL,
        capabilities=CAPS, supported_parameters=PARAMS)
    profile_reg.register(profile)
    config_v1 = ModelExecutionConfig(
        config_id=ModelExecutionConfigId("C"), version="v1",
        name="C", description="d", profile_ref=profile.ref,
        parameter_settings=(ModelParameterSetting(ModelParameter.TEMPERATURE, 0.1),))
    config_v2 = ModelExecutionConfig(
        config_id=ModelExecutionConfigId("C"), version="v2",
        name="C", description="d", profile_ref=profile.ref,
        parameter_settings=(ModelParameterSetting(ModelParameter.TEMPERATURE, 0.9),))
    config_reg.register(config_v1)
    config_reg.register(config_v2)
    agent = AgentDefinition(
        agent_id=AgentId("A"), version="v1", name="A", description="d",
        allowed_execution_profiles=(profile.ref,))
    agent_reg.register(agent)

    mgr = AgentBindingManager(sess_store, run_store, agent_reg, profile_reg,
        config_reg, binding_store, sink,
        binding_id_factory=Counter("b"), event_id_factory=Counter("e"), now=now)

    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("P"),
        execution_profile_version="v1",
        execution_config_id=ModelExecutionConfigId("C"),
        execution_config_version="v1")  # explicit v1

    assert binding.execution_config_version == "v1"
    assert binding.resolved_parameter_settings[0].value == 0.1  # NOT v2's 0.9
