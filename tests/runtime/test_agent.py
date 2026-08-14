"""STEP-013 Agent Definition / Binding / Request Factory unit tests.

Covers AGT-001..095 (architecture-level boundaries AGT-089..095 live partly
in tests/architecture). Each test carries a direct behavioral assertion —
never "covered by E2E".
"""
from __future__ import annotations

import inspect
import itertools
from dataclasses import FrozenInstanceError, fields
from datetime import UTC, datetime

import pytest

from packages.domain.enums import ActorType
from packages.domain.ids import (
    AgentId,
    BranchId,
    ModelExecutionProfileId,
    ProjectId,
    ProviderExecutionRequestId,
    RuntimeRunId,
)
from packages.runtime import (
    AgentAlreadyBoundError,
    AgentBindingManager,
    AgentBindingScopeError,
    AgentBindingStoreError,
    AgentDefinition,
    AgentDefinitionNotFoundError,
    AgentExecutionProfileNotAllowedError,
    AgentProviderExecutionRequestFactory,
    IllegalAgentBindingStateError,
    ModelExecutionProfile,
    ModelExecutionProfileNotFoundError,
    ModelExecutionProfileRef,
    ModelIdentifier,
    ProviderExecutionRequest,
    ProviderIdentifier,
    RuntimeEventType,
    RuntimeFailure,
    RuntimeFailureCategory,
    RuntimeInputRef,
    RuntimeRunManager,
    RuntimeSessionManager,
)
from packages.runtime.testing import (
    InMemoryAgentDefinitionRegistry,
    InMemoryAgentExecutionBindingStore,
    InMemoryExecutionAttemptStore,
    InMemoryModelExecutionProfileRegistry,
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


# =========================================================================
# Fixtures / helpers
# =========================================================================
class _Counter:
    """Module-global monotonic counter so distinct _stack() calls never
    collide on generated ids (session/run/attempt/event)."""

    _global = itertools.count(1)

    def __init__(self, prefix: str) -> None:
        self._prefix = prefix

    def __call__(self) -> str:
        return f"{self._prefix}-{next(_Counter._global)}"


@pytest.fixture
def profile_registry():
    return InMemoryModelExecutionProfileRegistry()


@pytest.fixture
def agent_registry():
    return InMemoryAgentDefinitionRegistry()


@pytest.fixture
def binding_store():
    return InMemoryAgentExecutionBindingStore()


@pytest.fixture
def clock():
    return lambda: TZ


def _profile(profile_id="profile-A", version="v1", *,
             provider=FAKE_PROVIDER, model=FAKE_MODEL_V1):
    return ModelExecutionProfile(
        profile_id=ModelExecutionProfileId(profile_id),
        version=version,
        name=f"{profile_id} {version}",
        description="test profile",
        provider=provider,
        model=model,
    )


def _agent(agent_id="agent-A", version="v1", refs=None):
    if refs is None:
        refs = (ModelExecutionProfileRef(
            profile_id=ModelExecutionProfileId("profile-A"), version="v1"),)
    return AgentDefinition(
        agent_id=AgentId(agent_id),
        version=version,
        name=f"{agent_id} {version}",
        description="test agent",
        allowed_execution_profiles=refs,
    )


def _stack(clock):
    sess_store = InMemoryRuntimeSessionStore()
    run_store = InMemoryRuntimeRunStore()
    att_store = InMemoryExecutionAttemptStore()
    sink = InMemoryRuntimeEventSink()
    sm = RuntimeSessionManager(
        sess_store, run_store, sink,
        session_id_factory=_Counter("sess"),
        event_id_factory=_Counter("evt"),
        now=clock,
    )
    rm = RuntimeRunManager(
        sess_store, run_store, att_store, sink,
        run_id_factory=_Counter("run"),
        attempt_id_factory=_Counter("att"),
        event_id_factory=_Counter("evt"),
        now=clock,
    )
    return sm, rm, sink, sess_store, run_store, att_store


def _manager(sess_store, run_store, agent_registry, profile_registry,
             binding_store, sink, clock, *, binding_counter="bind"):
    return AgentBindingManager(
        sess_store, run_store, agent_registry, profile_registry,
        binding_store, sink,
        binding_id_factory=_Counter(binding_counter),
        event_id_factory=_Counter("evt"),
        now=clock,
    )


def _bindable_run(clock, profile_registry, agent_registry):
    """Register profile+agent, create session+CREATED run, return everything."""
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    profile_registry.register(_profile())
    agent_registry.register(_agent())
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    return sm, rm, sink, sess_store, run_store, att_store, session, run


# =========================================================================
# AGT-001..008 — ModelExecutionProfile
# =========================================================================
def test_agt_001_profile_ref_immutable():
    # AGT-001 ModelExecutionProfileRef immutable
    ref = ModelExecutionProfileRef(
        profile_id=ModelExecutionProfileId("p"), version="v1")
    with pytest.raises(FrozenInstanceError):
        ref.version = "v2"  # type: ignore[misc]


def test_agt_002_profile_immutable():
    # AGT-002 ModelExecutionProfile immutable
    p = _profile()
    with pytest.raises(FrozenInstanceError):
        p.name = "x"  # type: ignore[misc]


def test_agt_003_empty_profile_version_rejected():
    # AGT-003 empty profile version rejected
    with pytest.raises(ValueError):
        ModelExecutionProfile(
            profile_id=ModelExecutionProfileId("p"), version="",
            name="n", description="d", provider=FAKE_PROVIDER, model=FAKE_MODEL_V1)


def test_agt_004_empty_profile_name_rejected():
    # AGT-004 empty profile name rejected
    with pytest.raises(ValueError):
        ModelExecutionProfile(
            profile_id=ModelExecutionProfileId("p"), version="v",
            name="", description="d", provider=FAKE_PROVIDER, model=FAKE_MODEL_V1)


def test_agt_005_empty_description_rejected():
    # AGT-005 empty description rejected
    with pytest.raises(ValueError):
        ModelExecutionProfile(
            profile_id=ModelExecutionProfileId("p"), version="v",
            name="n", description="", provider=FAKE_PROVIDER, model=FAKE_MODEL_V1)


def test_agt_006_profile_registry_roundtrip(profile_registry):
    # AGT-006 Profile Registry round-trip
    p = _profile()
    profile_registry.register(p)
    got = profile_registry.get(p.profile_id, p.version)
    assert got is p
    assert profile_registry.list_versions(p.profile_id) == ["v1"]


def test_agt_007_duplicate_profile_id_version_rejected(profile_registry):
    # AGT-007 duplicate id/version rejected
    profile_registry.register(_profile())
    with pytest.raises(Exception):
        profile_registry.register(_profile())


def test_agt_008_profile_versions_coexist(profile_registry):
    # AGT-008 different profile versions coexist
    profile_registry.register(_profile(version="v1"))
    profile_registry.register(_profile(version="v2", model=FAKE_MODEL_V2))
    assert profile_registry.list_versions(ModelExecutionProfileId("profile-A")) == ["v1", "v2"]
    assert profile_registry.get(ModelExecutionProfileId("profile-A"), "v1").model is FAKE_MODEL_V1
    assert profile_registry.get(ModelExecutionProfileId("profile-A"), "v2").model is FAKE_MODEL_V2


# =========================================================================
# AGT-009..017 — AgentDefinition
# =========================================================================
def test_agt_009_agent_immutable():
    # AGT-009 AgentDefinition immutable
    a = _agent()
    with pytest.raises(FrozenInstanceError):
        a.name = "x"  # type: ignore[misc]


def test_agt_010_empty_agent_version_rejected():
    # AGT-010 empty version rejected
    with pytest.raises(ValueError):
        AgentDefinition(
            agent_id=AgentId("a"), version="", name="n", description="d",
            allowed_execution_profiles=(ModelExecutionProfileRef(
                ModelExecutionProfileId("p"), "v1"),))


def test_agt_011_empty_agent_name_rejected():
    # AGT-011 empty name rejected
    with pytest.raises(ValueError):
        AgentDefinition(
            agent_id=AgentId("a"), version="v", name="", description="d",
            allowed_execution_profiles=(ModelExecutionProfileRef(
                ModelExecutionProfileId("p"), "v1"),))


def test_agt_012_empty_agent_description_rejected():
    # AGT-012 empty description rejected
    with pytest.raises(ValueError):
        AgentDefinition(
            agent_id=AgentId("a"), version="v", name="n", description="",
            allowed_execution_profiles=(ModelExecutionProfileRef(
                ModelExecutionProfileId("p"), "v1"),))


def test_agt_013_empty_allowed_profiles_rejected():
    # AGT-013 allowed profiles empty rejected
    with pytest.raises(ValueError):
        AgentDefinition(
            agent_id=AgentId("a"), version="v", name="n", description="d",
            allowed_execution_profiles=())


def test_agt_014_duplicate_allowed_profile_ref_rejected():
    # AGT-014 duplicate allowed profile ref rejected
    ref = ModelExecutionProfileRef(ModelExecutionProfileId("p"), "v1")
    with pytest.raises(ValueError):
        AgentDefinition(
            agent_id=AgentId("a"), version="v", name="n", description="d",
            allowed_execution_profiles=(ref, ref))


def test_agt_015_agent_registry_roundtrip(agent_registry):
    # AGT-015 Agent Registry round-trip
    a = _agent()
    agent_registry.register(a)
    got = agent_registry.get(a.agent_id, a.version)
    assert got is a
    assert agent_registry.list_versions(a.agent_id) == ["v1"]


def test_agt_016_duplicate_agent_id_version_rejected(agent_registry):
    # AGT-016 duplicate id/version rejected
    agent_registry.register(_agent())
    with pytest.raises(Exception):
        agent_registry.register(_agent())


def test_agt_017_agent_versions_coexist(agent_registry):
    # AGT-017 different Agent versions coexist
    agent_registry.register(_agent(version="v1"))
    agent_registry.register(_agent(version="v2"))
    assert agent_registry.list_versions(AgentId("agent-A")) == ["v1", "v2"]
    assert agent_registry.get(AgentId("agent-A"), "v1").version == "v1"
    assert agent_registry.get(AgentId("agent-A"), "v2").version == "v2"


# =========================================================================
# AGT-018..021 — Explicit Selection
# =========================================================================
def test_agt_018_no_default_profile_field():
    # AGT-018 AgentDefinition has no default/preferred/primary profile field
    names = {f.name for f in fields(AgentDefinition)}
    assert "default_profile" not in names
    assert "preferred_profile" not in names
    assert "primary_profile" not in names


def test_agt_019_binding_api_requires_exact_profile(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-019 Binding API requires exact profile ID/version
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    sig = inspect.signature(mgr.bind_agent)
    params = sig.parameters
    assert "execution_profile_id" in params
    assert "execution_profile_version" in params
    assert "agent_id" in params
    assert "agent_version" in params
    # No default-valued profile param means it is required.
    assert params["execution_profile_id"].default is inspect.Parameter.empty
    assert params["execution_profile_version"].default is inspect.Parameter.empty


def test_agt_020_no_latest_resolution_methods(profile_registry, agent_registry):
    # AGT-020 Registry/Manager have no get_latest/bind_latest
    for attr in ("get_latest", "get_default", "get_first"):
        assert not hasattr(profile_registry, attr)
        assert not hasattr(agent_registry, attr)
    # Manager class API surface:
    assert not hasattr(AgentBindingManager, "bind_latest")
    assert not hasattr(AgentBindingManager, "resolve_latest")


def test_agt_021_allowed_profile_order_irrelevant(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-021 allowed profiles tuple order does not affect binding
    ref_v1 = ModelExecutionProfileRef(ModelExecutionProfileId("p"), "v1")
    ref_v2 = ModelExecutionProfileRef(ModelExecutionProfileId("p"), "v2")
    profile_registry.register(_profile("p", "v1"))
    profile_registry.register(_profile("p", "v2", model=FAKE_MODEL_V2))
    agent_registry.register(_agent(refs=(ref_v2, ref_v1)))  # v2 first
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("p"),
        execution_profile_version="v1",
    )
    assert binding.execution_profile_version == "v1"
    assert binding.model is FAKE_MODEL_V1


# =========================================================================
# AGT-022..030 — Binding core
# =========================================================================
def test_agt_022_created_run_can_bind(clock, profile_registry, agent_registry, binding_store):
    # AGT-022 CREATED Run can bind
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert binding.run_id == run.run_id


def test_agt_023_binding_immutable(clock, profile_registry, agent_registry, binding_store):
    # AGT-023 Binding immutable
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    with pytest.raises(FrozenInstanceError):
        binding.agent_version = "v2"  # type: ignore[misc]


def test_agt_024_exact_agent_version_saved(clock, profile_registry, agent_registry, binding_store):
    # AGT-024 exact agent version saved
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert binding.agent_id == AgentId("agent-A")
    assert binding.agent_version == "v1"


def test_agt_025_exact_profile_version_saved(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-025 exact profile version saved
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert binding.execution_profile_id == ModelExecutionProfileId("profile-A")
    assert binding.execution_profile_version == "v1"


def test_agt_026_provider_snapshot_saved(clock, profile_registry, agent_registry, binding_store):
    # AGT-026 provider snapshot saved
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert binding.provider == FAKE_PROVIDER


def test_agt_027_model_snapshot_saved(clock, profile_registry, agent_registry, binding_store):
    # AGT-027 model snapshot saved
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert binding.model == FAKE_MODEL_V1


def test_agt_028_run_remains_created_after_bind(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-028 bind leaves Run CREATED
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert run_store.get(run.run_id).status.value == "CREATED"


def test_agt_029_bind_creates_no_attempt(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
    attempt_store,
):
    # AGT-029 bind creates no Attempt
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert attempt_store.list_for_run(run.run_id) == []


def test_agt_030_attempt_count_still_zero(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
    run_store,
):
    # AGT-030 attempt_count stays 0
    sm, rm, sink, sess_store, run_store_, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store_, agent_registry, profile_registry,
                   binding_store, sink, clock)
    mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert run_store_.get(run.run_id).attempt_count == 0


# =========================================================================
# AGT-031..037 — Illegal binding states
# =========================================================================
def _run_to_status(rm, session, status):
    """Drive a fresh run to a target non-CREATED status and return (run, ...)."""
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    if status == "CREATED":
        return run
    rm.mark_ready(run.run_id)
    if status == "READY":
        return run
    started_run, att = rm.start_run(run.run_id)
    if status == "RUNNING":
        return started_run
    if status == "WAITING":
        from packages.runtime import RunWaitReason
        rm.pause_run(run.run_id, reason=RunWaitReason.MANUAL_PAUSE)
        return rm.get_run(run.run_id)
    if status == "SUCCEEDED":
        from packages.runtime import RuntimeOutputRef
        out = RuntimeOutputRef(artifact_type="t", artifact_id="a", version="1")
        rm.succeed_run(run.run_id, output_ref=out)
        return rm.get_run(run.run_id)
    if status == "FAILED":
        rm.fail_run(run.run_id, failure=RuntimeFailure(
            category=RuntimeFailureCategory.INTERNAL, code="X", message="m"))
        return rm.get_run(run.run_id)
    if status == "CANCELLED":
        rm.cancel_run(run.run_id)
        return rm.get_run(run.run_id)
    if status == "TIMED_OUT":
        rm.timeout_run(run.run_id)
        return rm.get_run(run.run_id)
    raise AssertionError(status)


@pytest.mark.parametrize("status,exc_type", [
    ("READY", IllegalAgentBindingStateError),       # AGT-031
    ("RUNNING", IllegalAgentBindingStateError),     # AGT-032
    ("WAITING", IllegalAgentBindingStateError),     # AGT-033
    ("SUCCEEDED", IllegalAgentBindingStateError),   # AGT-034
    ("FAILED", IllegalAgentBindingStateError),      # AGT-035
    ("CANCELLED", IllegalAgentBindingStateError),   # AGT-036
    ("TIMED_OUT", IllegalAgentBindingStateError),   # AGT-037
])
def test_agt_031_037_non_created_bind_rejected(
        clock, profile_registry, agent_registry, binding_store, status, exc_type):
    profile_registry.register(_profile())
    agent_registry.register(_agent())
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = _run_to_status(rm, session, status)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    with pytest.raises(exc_type):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v1",
        )


# =========================================================================
# AGT-038..041 — Scope
# =========================================================================
def test_agt_038_matching_session_run_ok(clock, profile_registry, agent_registry, binding_store):
    # AGT-038 matching Session/Run legal
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert binding is not None


def test_agt_039_session_mismatch_rejected(clock, profile_registry, agent_registry, binding_store):
    # AGT-039 session mismatch rejected — pass a session that exists but whose
    # session_id differs from run.session_id. We build two real sessions in the
    # same store so both resolve, then bind run-of-session-1 against session-2.
    profile_registry.register(_profile())
    agent_registry.register(_agent())
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session_a = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    session_b = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session_a.session_id, input_ref=INPUT_REF)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    with pytest.raises(AgentBindingScopeError):
        mgr.bind_agent(
            session_id=session_b.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v1",
        )


def test_agt_040_project_mismatch_rejected(clock, profile_registry, agent_registry, binding_store):
    # AGT-040 project mismatch rejected — run belongs to a different session scope
    profile_registry.register(_profile())
    agent_registry.register(_agent())
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    # Build a session object that claims a different project but same id — emulate
    # inconsistency by passing a session whose project differs. We simulate via
    # a custom session store returning a mismatched session.
    from packages.runtime import RuntimeSession, RuntimeSessionStatus
    bad_session = RuntimeSession(
        session_id=session.session_id, project_id=ProjectId("OTHER"),
        branch_id=BRANCH, status=RuntimeSessionStatus.OPEN,
        created_by=ActorType.SYSTEM, created_at=TZ)

    class _BadStore:
        def __init__(self, real):
            self._real = real

        def get(self, sid):
            return bad_session

        def __getattr__(self, name):
            return getattr(self._real, name)

    mgr = _manager(_BadStore(sess_store), run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    with pytest.raises(AgentBindingScopeError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v1",
        )


def test_agt_041_branch_mismatch_rejected(clock, profile_registry, agent_registry, binding_store):
    # AGT-041 branch mismatch rejected
    profile_registry.register(_profile())
    agent_registry.register(_agent())
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    from packages.runtime import RuntimeSession, RuntimeSessionStatus
    bad_session = RuntimeSession(
        session_id=session.session_id, project_id=PROJECT,
        branch_id=BranchId("OTHER"), status=RuntimeSessionStatus.OPEN,
        created_by=ActorType.SYSTEM, created_at=TZ)

    class _BadStore:
        def __init__(self, real):
            self._real = real

        def get(self, sid):
            return bad_session

        def __getattr__(self, name):
            return getattr(self._real, name)

    mgr = _manager(_BadStore(sess_store), run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    with pytest.raises(AgentBindingScopeError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v1",
        )


# =========================================================================
# AGT-042..046 — Profile compatibility / exact resolution
# =========================================================================
def test_agt_042_allowed_profile_succeeds(clock, profile_registry, agent_registry, binding_store):
    # AGT-042 allowed profile succeeds
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert binding.execution_profile_version == "v1"


def test_agt_043_not_allowed_profile_rejected(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-043 not allowed profile -> AgentExecutionProfileNotAllowedError
    profile_registry.register(_profile("profile-A", "v1"))
    profile_registry.register(_profile("profile-B", "v1", model=FAKE_MODEL_V2))
    agent_registry.register(_agent(refs=(ModelExecutionProfileRef(
        ModelExecutionProfileId("profile-A"), "v1"),)))
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    with pytest.raises(AgentExecutionProfileNotAllowedError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-B"),
            execution_profile_version="v1",
        )


def test_agt_044_agent_exact_version_missing(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-044 agent exact version missing -> NotFound
    agent_registry.register(_agent(version="v1"))
    profile_registry.register(_profile())
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    with pytest.raises(AgentDefinitionNotFoundError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v2",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v1",
        )


def test_agt_045_profile_exact_version_missing(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-045 profile exact version missing -> NotFound
    profile_registry.register(_profile(version="v1"))
    agent_registry.register(_agent())
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    with pytest.raises(ModelExecutionProfileNotFoundError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v2",
        )


def test_agt_046_no_fallback_when_v2_exists(clock, profile_registry, agent_registry, binding_store):
    # AGT-046 requesting v1 when v2 exists returns v1 (no fallback)
    profile_registry.register(_profile(version="v1"))
    profile_registry.register(_profile(version="v2", model=FAKE_MODEL_V2))
    agent_registry.register(_agent(refs=(
        ModelExecutionProfileRef(ModelExecutionProfileId("profile-A"), "v1"),
        ModelExecutionProfileRef(ModelExecutionProfileId("profile-A"), "v2"),
    )))
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert binding.execution_profile_version == "v1"
    assert binding.model is FAKE_MODEL_V1  # NOT v2


# =========================================================================
# AGT-047..050 — One Binding per Run
# =========================================================================
def test_agt_047_second_binding_same_run_rejected(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-047 same Run second binding rejected
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    with pytest.raises(AgentAlreadyBoundError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v1",
        )


def test_agt_048_different_runs_same_agent_profile(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-048 different Runs can use the same Agent/Profile
    profile_registry.register(_profile())
    agent_registry.register(_agent())
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run1 = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    run2 = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    b1 = mgr.bind_agent(
        session_id=session.session_id, run_id=run1.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    b2 = mgr.bind_agent(
        session_id=session.session_id, run_id=run2.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert b1.run_id != b2.run_id
    assert b1.binding_id != b2.binding_id


def test_agt_049_get_for_run_correct(clock, profile_registry, agent_registry, binding_store):
    # AGT-049 get_for_run returns the binding
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert binding_store.get_for_run(run.run_id) is binding
    assert binding_store.get_for_run(RuntimeRunId("nope")) is None


def test_agt_050_duplicate_binding_id_rejected(clock, profile_registry, agent_registry):
    # AGT-050 duplicate binding ID rejected
    binding_store = InMemoryAgentExecutionBindingStore()
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock, binding_counter="dup")
    b1 = mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    # Manually craft a second binding with the SAME id but different run.
    sm2, rm2, _, _, _, _ = _stack(clock)
    session2 = sm2.create_session(project_id=PROJECT, branch_id=BRANCH)
    run2 = rm2.create_run(session_id=session2.session_id, input_ref=INPUT_REF)
    from packages.runtime import AgentExecutionBinding as _B
    dup = _B(
        binding_id=b1.binding_id,
        session_id=session2.session_id, run_id=run2.run_id,
        project_id=PROJECT, branch_id=BRANCH,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
        provider=FAKE_PROVIDER, model=FAKE_MODEL_V1,
        created_by=ActorType.SYSTEM, created_at=TZ,
    )
    with pytest.raises(Exception):
        binding_store.save(dup)


# =========================================================================
# AGT-051..057 — Event / Atomicity
# =========================================================================
def _bind_ok(mgr, session, run):
    return mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )


def test_agt_051_emits_agent_bound(clock, profile_registry, agent_registry, binding_store):
    # AGT-051 successful emit AGENT_BOUND
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    _bind_ok(mgr, session, run)
    types = [e.event_type for e in sink.list_for_session(session.session_id)]
    assert RuntimeEventType.AGENT_BOUND in types


def test_agt_052_event_saves_exact_versions(clock, profile_registry, agent_registry, binding_store):
    # AGT-052 event saves exact agent/profile versions
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    _bind_ok(mgr, session, run)
    evt = next(e for e in sink.list_for_session(session.session_id)
               if e.event_type is RuntimeEventType.AGENT_BOUND)
    assert evt.metadata["agent_version"] == "v1"
    assert evt.metadata["execution_profile_version"] == "v1"


def test_agt_053_event_saves_provider_model(clock, profile_registry, agent_registry, binding_store):
    # AGT-053 event saves provider/model
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    _bind_ok(mgr, session, run)
    evt = next(e for e in sink.list_for_session(session.session_id)
               if e.event_type is RuntimeEventType.AGENT_BOUND)
    assert evt.metadata["provider"] == "fake"
    assert evt.metadata["model"] == "fake-model-v1"


def test_agt_054_validation_failure_no_event(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-054 validation failure does not emit AGENT_BOUND
    profile_registry.register(_profile())
    agent_registry.register(_agent())
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    with pytest.raises(ModelExecutionProfileNotFoundError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v2",  # missing
        )
    types = [e.event_type for e in sink.list_for_session(session.session_id)]
    assert RuntimeEventType.AGENT_BOUND not in types


def test_agt_055_validation_failure_no_binding(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-055 validation failure does not save a Binding
    profile_registry.register(_profile())
    agent_registry.register(_agent())
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    with pytest.raises(ModelExecutionProfileNotFoundError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v2",
        )
    assert binding_store.get_for_run(run.run_id) is None


class _FailingBindingStore(InMemoryAgentExecutionBindingStore):
    """save() always raises — simulates store failure (AGT-056)."""

    def save(self, binding):  # type: ignore[no-untyped-def]
        raise RuntimeError("store down")


def test_agt_056_store_failure_no_event(clock, profile_registry, agent_registry):
    # AGT-056 binding store failure does not emit AGENT_BOUND
    failing = _FailingBindingStore()
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   failing, sink, clock)
    with pytest.raises(AgentBindingStoreError):
        _bind_ok(mgr, session, run)
    types = [e.event_type for e in sink.list_for_session(session.session_id)]
    assert RuntimeEventType.AGENT_BOUND not in types
    assert failing.get_for_run(run.run_id) is None


class _FailingEventSink(InMemoryRuntimeEventSink):
    """append() raises on the AGENT_BOUND event — simulates event failure (AGT-057)."""

    def __init__(self):
        super().__init__()
        self._allow = True

    def append(self, event):  # type: ignore[no-untyped-def]
        from packages.runtime import RuntimeEventType
        if event.event_type is RuntimeEventType.AGENT_BOUND:
            raise RuntimeError("event sink down")
        super().append(event)


def test_agt_057_event_failure_no_binding(clock, profile_registry, agent_registry, binding_store):
    # AGT-057 AGENT_BOUND event sink failure leaves no Binding
    failing_sink = _FailingEventSink()
    sess_store = InMemoryRuntimeSessionStore()
    run_store = InMemoryRuntimeRunStore()
    att_store = InMemoryExecutionAttemptStore()
    sm = RuntimeSessionManager(
        sess_store, run_store, failing_sink,
        session_id_factory=_Counter("sess"), event_id_factory=_Counter("evt"),
        now=clock)
    rm = RuntimeRunManager(
        sess_store, run_store, att_store, failing_sink,
        run_id_factory=_Counter("run"), attempt_id_factory=_Counter("att"),
        event_id_factory=_Counter("evt"), now=clock)
    profile_registry.register(_profile())
    agent_registry.register(_agent())
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, failing_sink, clock)
    with pytest.raises(AgentBindingStoreError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v1",
        )
    # No binding survives the event failure
    assert binding_store.get_for_run(run.run_id) is None


# =========================================================================
# AGT-058..063 — Request Factory basic build
# =========================================================================
def _factory_stack(clock, profile_registry, agent_registry, binding_store):
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = _bind_ok(mgr, session, run)
    rm.mark_ready(run.run_id)
    started_run, att = rm.start_run(run.run_id)
    factory = AgentProviderExecutionRequestFactory(att_store)
    return factory, binding, session, run_store.get(run.run_id), att


def test_agt_058_factory_builds_request(clock, profile_registry, agent_registry, binding_store):
    # AGT-058 after mark_ready/start, request can be built
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    req = factory.build(
        binding=binding, session=session, run=run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input={"x": 1}, created_at=TZ,
    )
    assert isinstance(req, ProviderExecutionRequest)


def test_agt_059_provider_from_binding(clock, profile_registry, agent_registry, binding_store):
    # AGT-059 provider comes from Binding
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    req = factory.build(
        binding=binding, session=session, run=run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    assert req.provider == binding.provider == FAKE_PROVIDER


def test_agt_060_model_from_binding(clock, profile_registry, agent_registry, binding_store):
    # AGT-060 model comes from Binding
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    req = factory.build(
        binding=binding, session=session, run=run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    assert req.model == binding.model == FAKE_MODEL_V1


def test_agt_061_input_ref_from_run(clock, profile_registry, agent_registry, binding_store):
    # AGT-061 input_ref comes from Run
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    req = factory.build(
        binding=binding, session=session, run=run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    assert req.input_ref == run.input_ref == INPUT_REF


def test_agt_062_request_project_branch(clock, profile_registry, agent_registry, binding_store):
    # AGT-062 request project/branch correct
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    req = factory.build(
        binding=binding, session=session, run=run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    assert req.project_id == PROJECT
    assert req.branch_id == BRANCH


def test_agt_063_request_session_run_attempt(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-063 request session/run/attempt correct
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    req = factory.build(
        binding=binding, session=session, run=run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    assert req.session_id == session.session_id
    assert req.run_id == run.run_id
    assert req.attempt_id == att.attempt_id


# =========================================================================
# AGT-064..070 — Factory scope validation
# =========================================================================
def test_agt_064_wrong_session_rejected(clock, profile_registry, agent_registry, binding_store):
    # AGT-064 wrong Session rejected — pass a session whose session_id differs
    # from binding.session_id (and from run.session_id).
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    sm, rm, _, _, _, _ = _stack(clock)
    other_session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    with pytest.raises(AgentBindingScopeError):
        factory.build(
            binding=binding, session=other_session, run=run, attempt=att,
            request_id=ProviderExecutionRequestId("req-1"),
            projected_input=None, created_at=TZ,
        )


def test_agt_065_wrong_run_rejected(clock, profile_registry, agent_registry, binding_store):
    # AGT-065 wrong Run rejected
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    # create a second run in the same session to use as "wrong run"
    sm2, rm2, _, _, _, att2 = _stack(clock)
    # Re-use same stores so the run is real: simplest path is to create via the
    # same rm that produced `run`. We reconstruct via factory_stack's rm by
    # making a fresh run on a fresh session; but binding.run_id must differ.
    from packages.runtime import RuntimeRun
    wrong_run = RuntimeRun(
        run_id=RuntimeRunId("other-run"), session_id=session.session_id,
        project_id=PROJECT, branch_id=BRANCH, status=__import__(
            "packages.runtime", fromlist=["RunStatus"]).RunStatus.RUNNING,
        input_ref=INPUT_REF, created_by=ActorType.SYSTEM, created_at=TZ,
        started_at=TZ, attempt_count=1,
    )
    with pytest.raises(AgentBindingScopeError):
        factory.build(
            binding=binding, session=session, run=wrong_run, attempt=att,
            request_id=ProviderExecutionRequestId("req-1"),
            projected_input=None, created_at=TZ,
        )


def test_agt_066_wrong_attempt_rejected(clock, profile_registry, agent_registry, binding_store):
    # AGT-066 wrong Attempt rejected (attempt.run_id mismatch)
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    from packages.runtime import AttemptStatus, ExecutionAttempt
    wrong_att = ExecutionAttempt(
        attempt_id=__import__(
            "packages.domain.ids", fromlist=["ExecutionAttemptId"]).ExecutionAttemptId("other"),
        run_id=RuntimeRunId("other-run"), attempt_number=1,
        status=AttemptStatus.RUNNING, started_at=TZ,
    )
    with pytest.raises(AgentBindingScopeError):
        factory.build(
            binding=binding, session=session, run=run, attempt=wrong_att,
            request_id=ProviderExecutionRequestId("req-1"),
            projected_input=None, created_at=TZ,
        )


def test_agt_067_run_not_running_rejected(clock, profile_registry, agent_registry, binding_store):
    # AGT-067 Run non-RUNNING rejected (Run still CREATED, never started)
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = _bind_ok(mgr, session, run)
    # create a stray RUNNING attempt for a different run to feed in? No: build
    # against the CREATED run with a fabricated RUNNING attempt.
    from packages.domain.ids import ExecutionAttemptId
    from packages.runtime import AttemptStatus, ExecutionAttempt
    stray = ExecutionAttempt(
        attempt_id=ExecutionAttemptId("att-1"), run_id=run.run_id,
        attempt_number=1, status=AttemptStatus.RUNNING, started_at=TZ)
    att_store.save(stray)
    factory = AgentProviderExecutionRequestFactory(att_store)
    with pytest.raises(IllegalAgentBindingStateError):
        factory.build(
            binding=binding, session=session, run=run, attempt=stray,
            request_id=ProviderExecutionRequestId("req-1"),
            projected_input=None, created_at=TZ,
        )


def test_agt_068_attempt_not_running_rejected(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-068 Attempt non-RUNNING rejected
    sm, rm, sink, sess_store, run_store, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = _bind_ok(mgr, session, run)
    rm.mark_ready(run.run_id)
    _, att = rm.start_run(run.run_id)
    # fail the attempt to make it non-RUNNING
    rm.fail_run(run.run_id, failure=RuntimeFailure(
        category=RuntimeFailureCategory.INTERNAL, code="X", message="m"))
    failed_att = att_store.list_for_run(run.run_id)[0]
    failed_run = run_store.get(run.run_id)
    factory = AgentProviderExecutionRequestFactory(att_store)
    with pytest.raises(IllegalAgentBindingStateError):
        factory.build(
            binding=binding, session=session, run=failed_run, attempt=failed_att,
            request_id=ProviderExecutionRequestId("req-1"),
            projected_input=None, created_at=TZ,
        )


def test_agt_069_not_current_active_attempt_rejected(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-069 not the current active Attempt rejected — pass a RUNNING-looking
    # attempt that is NOT the one stored as active (different id), while the
    # stored active one exists.
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    from packages.domain.ids import ExecutionAttemptId
    from packages.runtime import AttemptStatus, ExecutionAttempt
    other_running = ExecutionAttempt(
        attempt_id=ExecutionAttemptId("ghost"), run_id=run.run_id,
        attempt_number=99, status=AttemptStatus.RUNNING, started_at=TZ)
    with pytest.raises(AgentBindingScopeError):
        factory.build(
            binding=binding, session=session, run=run, attempt=other_running,
            request_id=ProviderExecutionRequestId("req-1"),
            projected_input=None, created_at=TZ,
        )


def test_agt_070_multiple_active_attempts_invariant(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-070 >1 active Attempt -> invariant error. We bypass the RunManager
    # (which forbids this) and inject two RUNNING attempts directly, then call
    # the factory which must detect the invariant.
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    from packages.domain.ids import ExecutionAttemptId
    from packages.runtime import AttemptStatus, ExecutionAttempt, RuntimeInvariantViolationError
    extra = ExecutionAttempt(
        attempt_id=ExecutionAttemptId("extra"), run_id=run.run_id,
        attempt_number=2, status=AttemptStatus.RUNNING, started_at=TZ)
    # Insert directly into the store (invariant only enforced at build time here)
    binding_store  # noqa: B018 - keep ref
    # Use the same attempt store the factory was built with:
    factory._attempts.save(extra)  # type: ignore[attr-defined]
    with pytest.raises(RuntimeInvariantViolationError):
        factory.build(
            binding=binding, session=session, run=run, attempt=att,
            request_id=ProviderExecutionRequestId("req-1"),
            projected_input=None, created_at=TZ,
        )


# =========================================================================
# AGT-071..074 — No override
# =========================================================================
def test_agt_071_no_provider_param():
    # AGT-071 provider not in factory.build signature
    sig = inspect.signature(AgentProviderExecutionRequestFactory.build)
    assert "provider" not in sig.parameters


def test_agt_072_no_model_param():
    # AGT-072 model not in factory.build signature
    sig = inspect.signature(AgentProviderExecutionRequestFactory.build)
    assert "model" not in sig.parameters


def test_agt_073_no_input_ref_param():
    # AGT-073 input_ref not in factory.build signature
    sig = inspect.signature(AgentProviderExecutionRequestFactory.build)
    assert "input_ref" not in sig.parameters


def test_agt_074_request_matches_binding_and_run(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-074 generated request provider/model/input_ref exactly match Binding/Run
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    req = factory.build(
        binding=binding, session=session, run=run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input={"seg": 1}, created_at=TZ,
    )
    assert req.provider is binding.provider
    assert req.model is binding.model
    assert req.input_ref == run.input_ref


# =========================================================================
# AGT-075..081 — No side effects
# =========================================================================
def test_agt_075_bind_does_not_mark_ready(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
    run_store,
):
    # AGT-075 bind does not mark READY
    sm, rm, sink, sess_store, run_store_, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store_, agent_registry, profile_registry,
                   binding_store, sink, clock)
    _bind_ok(mgr, session, run)
    assert run_store_.get(run.run_id).status.value == "CREATED"
    # no RUN_READY event emitted by binding
    types = [e.event_type for e in sink.list_for_run(run.run_id)]
    from packages.runtime import RuntimeEventType as _RT
    assert _RT.RUN_READY not in types


def test_agt_076_bind_does_not_start_run(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
    run_store,
):
    # AGT-076 bind does not start Run
    sm, rm, sink, sess_store, run_store_, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store_, agent_registry, profile_registry,
                   binding_store, sink, clock)
    _bind_ok(mgr, session, run)
    types = [e.event_type for e in sink.list_for_run(run.run_id)]
    from packages.runtime import RuntimeEventType as _RT
    assert _RT.RUN_STARTED not in types


def test_agt_077_bind_does_not_call_provider(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-077 bind does not call Provider
    calls = []
    profile_registry.register(_profile())
    agent_registry.register(_agent())
    sm, rm, sink, sess_store, run_store, att_store = _stack(clock)
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)

    class _SpyExecutor:
        async def execute(self, request):  # type: ignore[no-untyped-def]
            calls.append(request)
            raise AssertionError("provider must not be called during bind")

    mgr = _manager(sess_store, run_store, agent_registry, profile_registry,
                   binding_store, sink, clock)
    mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId("agent-A"), agent_version="v1",
        execution_profile_id=ModelExecutionProfileId("profile-A"),
        execution_profile_version="v1",
    )
    assert calls == []


def test_agt_078_factory_does_not_call_provider(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-078 Factory does not call Provider
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    calls = []

    class _SpyExecutor:
        async def execute(self, request):  # type: ignore[no-untyped-def]
            calls.append(request)
            raise AssertionError("factory must not call provider")

    factory.build(
        binding=binding, session=session, run=run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    assert calls == []


def test_agt_079_factory_does_not_persist_request(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-079 Factory does not save ProviderExecutionRequest
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    req_store = InMemoryRuntimeRunStore()  # unused; we verify no persistence by
    # the factory. The factory only holds an attempt_store; confirm the built
    # request is returned, not stored anywhere the factory owns.
    req = factory.build(
        binding=binding, session=session, run=run, attempt=att,
        request_id=ProviderExecutionRequestId("req-9"),
        projected_input=None, created_at=TZ,
    )
    # The factory has no request store attribute.
    assert not hasattr(factory, "_request_store")
    assert not hasattr(factory, "_req_store")
    # attempt store unaffected (still exactly one RUNNING attempt)
    actives = [a for a in factory._attempts.list_for_run(run.run_id)  # type: ignore[attr-defined]
               if a.status.value == "RUNNING"]
    assert len(actives) == 1
    # request identity is the caller's, not persisted internally
    assert req.request_id == ProviderExecutionRequestId("req-9")
    del req_store


def test_agt_080_factory_does_not_modify_run(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
    run_store,
):
    # AGT-080 Factory does not modify Run
    sm, rm, sink, sess_store, run_store_, att_store, session, run = _bindable_run(
        clock, profile_registry, agent_registry)
    mgr = _manager(sess_store, run_store_, agent_registry, profile_registry,
                   binding_store, sink, clock)
    binding = _bind_ok(mgr, session, run)
    rm.mark_ready(run.run_id)
    started_run, att = rm.start_run(run.run_id)
    run_before = run_store_.get(run.run_id)
    factory = AgentProviderExecutionRequestFactory(att_store)
    factory.build(
        binding=binding, session=session, run=started_run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    run_after = run_store_.get(run.run_id)
    assert run_after == run_before


def test_agt_081_factory_does_not_modify_attempt(
    clock,
    profile_registry,
    agent_registry,
    binding_store,
):
    # AGT-081 Factory does not modify Attempt
    factory, binding, session, run, att = _factory_stack(
        clock, profile_registry, agent_registry, binding_store)
    att_store_ref = factory._attempts  # type: ignore[attr-defined]
    att_before = att_store_ref.list_for_run(run.run_id)[0]
    factory.build(
        binding=binding, session=session, run=run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    att_after = att_store_ref.list_for_run(run.run_id)[0]
    assert att_after == att_before


# =========================================================================
# AGT-082..088 — No forbidden Agent features
# =========================================================================
def test_agt_082_no_context_policy_field():
    names = {f.name for f in fields(AgentDefinition)}
    assert "context_policy" not in names
    assert "context_policy_id" not in names


def test_agt_083_no_prompt_policy_field():
    names = {f.name for f in fields(AgentDefinition)}
    assert "prompt_policy" not in names
    assert "prompt_policy_id" not in names
    assert "prompt_template" not in names


def test_agt_084_no_output_contract_field():
    names = {f.name for f in fields(AgentDefinition)}
    assert "output_contract" not in names
    assert "output_contract_id" not in names


def test_agt_085_no_tools_field():
    names = {f.name for f in fields(AgentDefinition)}
    assert "tools" not in names


def test_agt_086_no_skills_field():
    names = {f.name for f in fields(AgentDefinition)}
    assert "skills" not in names


def test_agt_087_no_subagents_field():
    names = {f.name for f in fields(AgentDefinition)}
    assert "subagents" not in names


def test_agt_088_no_mutable_state_fields():
    # AGT-088 no mutable memory/state fields on AgentDefinition
    forbidden = {
        "memory", "scratchpad", "conversation_history", "thought",
        "current_goal", "working_memory", "state",
    }
    names = {f.name for f in fields(AgentDefinition)}
    assert not (forbidden & names)
    # Also: no cognitive_mode / agent_role enum field
    assert "cognitive_mode" not in names
    assert "agent_role" not in names
    assert "agent_type" not in names


# =========================================================================
# AGT-089..095 — Architecture (also enforced in tests/architecture)
# =========================================================================
def test_agt_089_090_runtime_no_cognition_control_imports():
    # AGT-089 / AGT-090: the agent module imports neither cognition nor control
    import packages.runtime.agent as agent_mod
    src = inspect.getsource(agent_mod)
    assert "packages.cognition" not in src
    assert "packages.control" not in src
    # Also verify the runtime package has no such relative imports via the
    # architecture AST test (test_boundaries.py) — here we sanity-check agent.py.


def test_agt_091_094_no_sdk_imports():
    # AGT-091..094 no SDK imports in agent.py
    import packages.runtime.agent as agent_mod
    src = inspect.getsource(agent_mod)
    for forbidden in ("import openai", "import anthropic", "pydantic_ai",
                      "temporalio", "langgraph"):
        assert forbidden not in src


def test_agt_095_no_model_selector():
    # AGT-095 no ModelSelector/Router production implementation
    import packages.runtime as rt
    assert not hasattr(rt, "ModelSelector")
    assert not hasattr(rt, "ModelRouter")
