"""M3-AGT-001 / M3-AGT-002 — full Agent Binding execution end-to-end.

These compose the entire STEP-013 chain:

    ModelExecutionProfile + AgentDefinition
        -> AgentBindingManager.bind_agent (Run CREATED)
        -> mark_ready -> start_run
        -> AgentProviderExecutionRequestFactory.build
        -> RuntimeExecutionCoordinator.execute (FakeProviderExecutor)
        -> Run SUCCEEDED

plus version-pinning proof (M3-AGT-002).
"""
from __future__ import annotations

import asyncio
import itertools
from datetime import UTC, datetime

from packages.domain.ids import (
    AgentId,
    BranchId,
    ModelExecutionProfileId,
    ProjectId,
    ProviderExecutionRequestId,
)
from packages.runtime import (
    AgentBindingManager,
    AgentDefinition,
    AgentProviderExecutionRequestFactory,
    ModelExecutionProfile,
    ModelExecutionProfileRef,
    ModelIdentifier,
    ProviderIdentifier,
    RuntimeEventType,
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
FAKE_MODEL_V1 = ModelIdentifier(name="fake-model-v1")
FAKE_MODEL_V2 = ModelIdentifier(name="fake-model-v2")


class _Counter:
    _global = itertools.count(1)

    def __init__(self, prefix: str) -> None:
        self._prefix = prefix

    def __call__(self) -> str:
        return f"{self._prefix}-{next(_Counter._global)}"


def _build_stack():
    sess_store = InMemoryRuntimeSessionStore()
    run_store = InMemoryRuntimeRunStore()
    att_store = InMemoryExecutionAttemptStore()
    sink = InMemoryRuntimeEventSink()

    def clock() -> datetime:
        return TZ

    sm = RuntimeSessionManager(
        sess_store, run_store, sink,
        session_id_factory=_Counter("sess"), event_id_factory=_Counter("evt"),
        now=clock)
    rm = RuntimeRunManager(
        sess_store, run_store, att_store, sink,
        run_id_factory=_Counter("run"), attempt_id_factory=_Counter("att"),
        event_id_factory=_Counter("evt"), now=clock)
    return sm, rm, sink, sess_store, run_store, att_store, clock


def _m3_agt_001_stack():
    sm, rm, sink, sess_store, run_store, att_store, clock = _build_stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()

    profile = ModelExecutionProfile(
        profile_id=ModelExecutionProfileId("profile-A"), version="v1",
        name="profile-A v1", description="d",
        provider=FAKE_PROVIDER, model=FAKE_MODEL_V1)
    profile_reg.register(profile)
    agent = AgentDefinition(
        agent_id=AgentId("agent-A"), version="v3",
        name="agent-A v3", description="d",
        allowed_execution_profiles=(ModelExecutionProfileRef(
            ModelExecutionProfileId("profile-A"), "v1"),))
    agent_reg.register(agent)

    mgr = AgentBindingManager(
        sess_store, run_store, agent_reg, profile_reg, binding_store, sink,
        binding_id_factory=_Counter("bind"), event_id_factory=_Counter("evt"),
        now=clock)
    coord = RuntimeExecutionCoordinator(
        rm,
        InMemoryProviderExecutionRequestStore(),
        InMemoryProviderExecutionResponseStore(),
        sink,
        response_id_factory=_Counter("resp"),
        artifact_id_factory=_Counter("art"),
        event_id_factory=_Counter("evt"),
        now=clock,
    )
    factory = AgentProviderExecutionRequestFactory(att_store)
    return (sm, rm, sink, mgr, factory, coord, profile_reg, agent_reg,
            binding_store, att_store, clock)


def test_m3_agt_001_full_agent_binding_execution():
    """Full bind -> ready -> start -> factory -> coordinator -> SUCCEEDED."""
    (sm, rm, sink, mgr, factory, coord, profile_reg, agent_reg,
     binding_store, att_store, clock) = _m3_agt_001_stack()

    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)

    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v3",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    # Run remains CREATED; no attempt created
    assert rm.get_run(run.run_id).status.value == "CREATED"
    assert rm.get_run(run.run_id).attempt_count == 0
    assert att_store.list_for_run(run.run_id) == []

    rm.mark_ready(run.run_id)
    started_run, att = rm.start_run(run.run_id)
    assert started_run.status.value == "RUNNING"

    request = factory.build(
        binding=binding, session=session, run=started_run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input={"segments": ["s1"]}, created_at=TZ,
    )
    # provider/model/input_ref sourced exclusively from Binding/Run
    assert request.provider == FAKE_PROVIDER
    assert request.model == FAKE_MODEL_V1
    assert request.input_ref == INPUT_REF

    fake = FakeProviderExecutor([FakeProviderExecutor.success(
        {"judgement": "CONTRADICT", "confidence": 0.9})])
    final_run, outcome = asyncio.run(coord.execute(request, fake))
    assert final_run.status.value == "SUCCEEDED"
    assert outcome.status.value == "SUCCEEDED"
    assert len(fake.calls) == 1  # exactly one provider call; no retry

    # Binding completely unchanged after execution
    assert binding_store.get_for_run(run.run_id) == binding

    # Full runtime event sequence includes AGENT_BOUND and the full execution chain
    types = [e.event_type for e in sink.list_for_run(run.run_id)]
    assert RuntimeEventType.AGENT_BOUND in types
    for expected in [
        RuntimeEventType.AGENT_BOUND,
        RuntimeEventType.RUN_READY,
        RuntimeEventType.RUN_STARTED,
        RuntimeEventType.ATTEMPT_STARTED,
        RuntimeEventType.PROVIDER_EXECUTION_STARTED,
        RuntimeEventType.PROVIDER_EXECUTION_SUCCEEDED,
        RuntimeEventType.ATTEMPT_SUCCEEDED,
        RuntimeEventType.RUN_SUCCEEDED,
    ]:
        assert expected in types, f"missing event {expected}"

    # No automatic model selection happened: the fake was called with the
    # binding's provider/model, not any "latest"/"default".
    called = fake.calls[0]
    assert called.provider == FAKE_PROVIDER
    assert called.model == FAKE_MODEL_V1


def test_m3_agt_002_version_pinning():
    """Binding pins exact agent/profile versions; coexisting v2 does not
    auto-upgrade the resolved binding snapshot."""
    sm, rm, sink, sess_store, run_store, att_store, clock = _build_stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()

    # Register v1 AND v2 for both agent and profile
    profile_v1 = ModelExecutionProfile(
        profile_id=ModelExecutionProfileId("profile-A"), version="v1",
        name="p v1", description="d", provider=FAKE_PROVIDER, model=FAKE_MODEL_V1)
    profile_v2 = ModelExecutionProfile(
        profile_id=ModelExecutionProfileId("profile-A"), version="v2",
        name="p v2", description="d", provider=FAKE_PROVIDER, model=FAKE_MODEL_V2)
    profile_reg.register(profile_v1)
    profile_reg.register(profile_v2)

    ref_v1 = ModelExecutionProfileRef(ModelExecutionProfileId("profile-A"), "v1")
    ref_v2 = ModelExecutionProfileRef(ModelExecutionProfileId("profile-A"), "v2")
    agent_v1 = AgentDefinition(
        agent_id=AgentId("agent-A"), version="v1", name="a v1", description="d",
        allowed_execution_profiles=(ref_v1,))
    agent_v2 = AgentDefinition(
        agent_id=AgentId("agent-A"), version="v2", name="a v2", description="d",
        allowed_execution_profiles=(ref_v1, ref_v2))
    agent_reg.register(agent_v1)
    agent_reg.register(agent_v2)

    mgr = AgentBindingManager(
        sess_store, run_store, agent_reg, profile_reg, binding_store, sink,
        binding_id_factory=_Counter("bind"), event_id_factory=_Counter("evt"),
        now=clock)

    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)

    # Explicitly bind the v1 versions even though v2 exists
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )

    # Re-read the binding from the store
    reloaded = binding_store.get_for_run(run.run_id)
    assert reloaded is binding
    assert reloaded.agent_version == "v1"
    assert reloaded.execution_profile_version == "v1"
    assert reloaded.model == FAKE_MODEL_V1  # v1 snapshot, NOT v2

    # Even after we drive the run to completion, the binding stays v1
    rm.mark_ready(run.run_id)
    started_run, att = rm.start_run(run.run_id)
    factory = AgentProviderExecutionRequestFactory(att_store)
    request = factory.build(
        binding=binding, session=session, run=started_run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    assert request.model == FAKE_MODEL_V1  # still v1, no auto-upgrade
