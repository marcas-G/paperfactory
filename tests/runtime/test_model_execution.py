"""STEP-014 Model Execution Config unit tests (CFG-001..048).

Each test carries a direct behavioral assertion — never "covered by E2E".
"""
from __future__ import annotations

import inspect
from dataclasses import FrozenInstanceError, fields

import pytest

from packages.domain.ids import (
    AgentId,
    ModelExecutionConfigId,
    ModelExecutionProfileId,
    ProviderExecutionRequestId,
)
from packages.runtime import (
    AgentProviderExecutionRequestFactory,
    ModelCapability,
    ModelExecutionConfigIncompatibleError,
    ModelExecutionConfigNotFoundError,
    ModelExecutionConfigValidator,
    ModelExecutionProfileRef,
    ModelParameter,
    ModelParameterSetting,
    ProviderExecutionRequest,
    RuntimeEventType,
    RuntimeExecutionCoordinator,
    RuntimeInputRef,
)
from packages.runtime.testing import (
    FakeProviderExecutor,
    InMemoryAgentDefinitionRegistry,
    InMemoryAgentExecutionBindingStore,
    InMemoryModelExecutionConfigRegistry,
    InMemoryModelExecutionProfileRegistry,
    InMemoryProviderExecutionRequestStore,
    InMemoryProviderExecutionResponseStore,
)

from ._step14_helpers import (
    BRANCH,
    FAKE_MODEL_V1,
    FAKE_MODEL_V2,
    PROJECT,
    TZ,
    Counter,
    build_manager,
    build_stack,
    make_agent,
    make_config,
    make_profile,
)

INPUT_REF = RuntimeInputRef(source_type="prompt_package", source_id="pkg-1", version="1")


# =========================================================================
# CFG-001..014 — parameters / settings
# =========================================================================
def test_cfg_001_model_parameter_exact_four():
    # CFG-001 exact four canonical parameters
    members = {m for m in ModelParameter}
    assert members == {
        ModelParameter.TEMPERATURE, ModelParameter.TOP_P,
        ModelParameter.MAX_OUTPUT_UNITS, ModelParameter.SEED,
    }


def test_cfg_002_temperature_legal():
    # CFG-002 TEMPERATURE legal
    s = ModelParameterSetting(ModelParameter.TEMPERATURE, 0.7)
    assert s.value == 0.7
    ModelParameterSetting(ModelParameter.TEMPERATURE, 0)  # boundary 0
    ModelParameterSetting(ModelParameter.TEMPERATURE, 2)  # boundary 2


@pytest.mark.parametrize("bad", [-0.1, 2.1])
def test_cfg_003_004_temperature_range_rejected(bad):
    # CFG-003 <0 / CFG-004 >2 rejected
    with pytest.raises(ValueError):
        ModelParameterSetting(ModelParameter.TEMPERATURE, bad)


def test_cfg_005_top_p_legal():
    # CFG-005 TOP_P legal
    ModelParameterSetting(ModelParameter.TOP_P, 0.5)
    ModelParameterSetting(ModelParameter.TOP_P, 0)
    ModelParameterSetting(ModelParameter.TOP_P, 1)


@pytest.mark.parametrize("bad", [-0.1, 1.1])
def test_cfg_006_top_p_range_rejected(bad):
    # CFG-006 TOP_P <0/>1 rejected
    with pytest.raises(ValueError):
        ModelParameterSetting(ModelParameter.TOP_P, bad)


def test_cfg_007_max_output_units_legal():
    # CFG-007 MAX_OUTPUT_UNITS int >0
    s = ModelParameterSetting(ModelParameter.MAX_OUTPUT_UNITS, 2048)
    assert s.value == 2048


def test_cfg_008_max_output_units_zero_rejected():
    # CFG-008 =0 rejected
    with pytest.raises(ValueError):
        ModelParameterSetting(ModelParameter.MAX_OUTPUT_UNITS, 0)


def test_cfg_009_max_output_units_bool_rejected():
    # CFG-009 bool rejected as int
    with pytest.raises(ValueError):
        ModelParameterSetting(ModelParameter.MAX_OUTPUT_UNITS, True)


def test_cfg_010_seed_legal():
    # CFG-010 SEED >=0
    ModelParameterSetting(ModelParameter.SEED, 0)
    ModelParameterSetting(ModelParameter.SEED, 42)


def test_cfg_011_seed_negative_rejected():
    # CFG-011 negative rejected
    with pytest.raises(ValueError):
        ModelParameterSetting(ModelParameter.SEED, -1)


def test_cfg_012_seed_bool_rejected():
    # CFG-012 bool rejected
    with pytest.raises(ValueError):
        ModelParameterSetting(ModelParameter.SEED, True)


def test_cfg_013_no_string_coercion():
    # CFG-013 string numeric is NOT coerced
    with pytest.raises(ValueError):
        ModelParameterSetting(ModelParameter.TEMPERATURE, "0.7")  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        ModelParameterSetting(ModelParameter.SEED, "42")  # type: ignore[arg-type]


def test_cfg_014_setting_immutable():
    # CFG-014 ModelParameterSetting immutable
    s = ModelParameterSetting(ModelParameter.TEMPERATURE, 0.5)
    with pytest.raises(FrozenInstanceError):
        s.value = 0.9  # type: ignore[misc]


# =========================================================================
# CFG-015..020 — capability declaration / profile
# =========================================================================
def test_cfg_015_model_capability_values():
    # CFG-015 exact required capability values
    assert ModelCapability.TEXT_GENERATION
    assert ModelCapability.STRUCTURED_OUTPUT
    assert ModelCapability.TOOL_CALLING
    assert ModelCapability.STREAMING
    assert ModelCapability.VISION_INPUT
    assert ModelCapability.FILE_INPUT
    # no subjective capabilities
    names = {c.value for c in ModelCapability}
    for forbidden in ("SMART", "REASONING", "BEST", "FAST"):
        assert forbidden not in names


def test_cfg_016_profile_capabilities_immutable():
    # CFG-016 capabilities immutable (frozen dataclass + frozenset)
    p = make_profile()
    with pytest.raises(FrozenInstanceError):
        p.name = "x"  # type: ignore[misc]
    # frozenset itself is immutable; confirm field type
    assert isinstance(p.capabilities, frozenset)


def test_cfg_017_profile_capabilities_empty_rejected():
    # CFG-017 empty capabilities rejected
    with pytest.raises(ValueError):
        make_profile(capabilities=frozenset())


def test_cfg_018_profile_requires_text_generation():
    # CFG-018 no TEXT_GENERATION rejected
    with pytest.raises(ValueError):
        make_profile(capabilities=frozenset({ModelCapability.STRUCTURED_OUTPUT}))


def test_cfg_019_supported_parameters_immutable():
    # CFG-019 supported_parameters immutable frozenset
    p = make_profile(supported_parameters=frozenset({ModelParameter.TEMPERATURE}))
    assert isinstance(p.supported_parameters, frozenset)
    assert p.supported_parameters == frozenset({ModelParameter.TEMPERATURE})


def test_cfg_020_profile_version_pinning_regression():
    # CFG-020 STEP-013 profile version pinning still holds
    reg = InMemoryModelExecutionProfileRegistry()
    reg.register(make_profile(version="v1"))
    reg.register(make_profile(version="v2", model=FAKE_MODEL_V2))
    assert reg.list_versions(ModelExecutionProfileId("profile-A")) == ["v1", "v2"]
    assert reg.get(ModelExecutionProfileId("profile-A"), "v1").model is FAKE_MODEL_V1
    assert reg.get(ModelExecutionProfileId("profile-A"), "v2").model is FAKE_MODEL_V2


# =========================================================================
# CFG-021..028 — execution config
# =========================================================================
def test_cfg_021_config_immutable():
    # CFG-021 Config immutable
    c = make_config()
    with pytest.raises(FrozenInstanceError):
        c.name = "x"  # type: ignore[misc]


def test_cfg_022_config_versioned():
    # CFG-022 Config versioned
    c = make_config(version="v3")
    assert c.version == "v3"


def test_cfg_023_empty_config_legal():
    # CFG-023 empty parameter_settings legal
    c = make_config(settings=())
    assert c.parameter_settings == ()


def test_cfg_024_duplicate_parameter_rejected():
    # CFG-024 duplicate parameter in one config rejected
    s1 = ModelParameterSetting(ModelParameter.TEMPERATURE, 0.2)
    s2 = ModelParameterSetting(ModelParameter.TEMPERATURE, 0.8)
    with pytest.raises(ValueError):
        make_config(settings=(s1, s2))


def test_cfg_025_config_registry_roundtrip():
    # CFG-025 Config Registry round-trip
    reg = InMemoryModelExecutionConfigRegistry()
    c = make_config()
    reg.register(c)
    got = reg.get(c.config_id, c.version)
    assert got is c
    assert reg.list_versions(c.config_id) == ["v1"]


def test_cfg_026_duplicate_config_id_version_rejected():
    # CFG-026 duplicate id/version rejected
    reg = InMemoryModelExecutionConfigRegistry()
    reg.register(make_config())
    with pytest.raises(Exception):
        reg.register(make_config())


def test_cfg_027_config_versions_coexist():
    # CFG-027 multiple versions coexist
    reg = InMemoryModelExecutionConfigRegistry()
    reg.register(make_config(version="v1"))
    reg.register(make_config(version="v2"))
    assert reg.list_versions(ModelExecutionConfigId("config-A")) == ["v1", "v2"]


def test_cfg_028_no_latest_default_config():
    # CFG-028 no get_latest/default on registry
    reg = InMemoryModelExecutionConfigRegistry()
    assert not hasattr(reg, "get_latest")
    assert not hasattr(reg, "get_default")
    assert not hasattr(reg, "get_first")


# =========================================================================
# CFG-029..033 — config/profile compatibility
# =========================================================================
def test_cfg_029_exact_profile_match_success():
    # CFG-029 Config exact profile match succeeds
    profile = make_profile("profile-A", "v1", supported_parameters=PARAMS_FULL)
    config = make_config("config-A", "v1", profile_ref=profile.ref,
                         settings=(ModelParameterSetting(ModelParameter.TEMPERATURE, 0.5),))
    ModelExecutionConfigValidator().validate(config, profile)  # no raise


def test_cfg_030_profile_id_mismatch_rejected():
    # CFG-030 profile id mismatch fails
    profile = make_profile("profile-A", "v1")
    other_ref = ModelExecutionProfileRef(ModelExecutionProfileId("profile-B"), "v1")
    config = make_config(profile_ref=other_ref)
    with pytest.raises(ModelExecutionConfigIncompatibleError):
        ModelExecutionConfigValidator().validate(config, profile)


def test_cfg_031_profile_version_mismatch_rejected():
    # CFG-031 profile version mismatch fails
    profile = make_profile("profile-A", "v2")
    v1_ref = ModelExecutionProfileRef(ModelExecutionProfileId("profile-A"), "v1")
    config = make_config(profile_ref=v1_ref)
    with pytest.raises(ModelExecutionConfigIncompatibleError):
        ModelExecutionConfigValidator().validate(config, profile)


def test_cfg_032_unsupported_parameter_rejected():
    # CFG-032 TEMPERATURE not in supported_parameters fails
    profile = make_profile("profile-A", "v1", supported_parameters=frozenset({ModelParameter.SEED}))
    config = make_config(profile_ref=profile.ref,
                         settings=(ModelParameterSetting(ModelParameter.TEMPERATURE, 0.5),))
    with pytest.raises(ModelExecutionConfigIncompatibleError):
        ModelExecutionConfigValidator().validate(config, profile)


def test_cfg_033_all_parameters_supported_success():
    # CFG-033 all parameters supported succeeds
    profile = make_profile("profile-A", "v1", supported_parameters=PARAMS_FULL)
    settings = (
        ModelParameterSetting(ModelParameter.TEMPERATURE, 0.3),
        ModelParameterSetting(ModelParameter.TOP_P, 0.9),
        ModelParameterSetting(ModelParameter.MAX_OUTPUT_UNITS, 1024),
        ModelParameterSetting(ModelParameter.SEED, 7),
    )
    config = make_config(profile_ref=profile.ref, settings=settings)
    ModelExecutionConfigValidator().validate(config, profile)  # no raise


PARAMS_FULL = frozenset({
    ModelParameter.TEMPERATURE, ModelParameter.TOP_P,
    ModelParameter.MAX_OUTPUT_UNITS, ModelParameter.SEED,
})


# =========================================================================
# CFG-034..042 — binding extension
# =========================================================================
def _bindable(clock=None):
    sm, rm, sink, sess_store, run_store, att_store, now = build_stack(clock)
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()
    profile_reg.register(make_profile())
    config_reg.register(make_config())
    agent_reg.register(make_agent())
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = build_manager(sess_store, run_store, agent_reg, profile_reg, config_reg,
                        binding_store, sink, now)
    return mgr, binding_store, session, run


def _bind_ok(mgr, session, run, *, cid="config-A", cver="v1",
             pid="profile-A", pver="v1", aid="agent-A", aver="v1"):
    return mgr.bind_agent(
        session_id=session.session_id, run_id=run.run_id,
        agent_id=AgentId(aid), agent_version=aver,
        execution_profile_id=ModelExecutionProfileId(pid),
        execution_profile_version=pver,
        execution_config_id=ModelExecutionConfigId(cid),
        execution_config_version=cver,
    )


def test_cfg_034_binding_exact_config_id_version():
    # CFG-034 binding exact config ID/version
    mgr, binding_store, session, run = _bindable()
    b = _bind_ok(mgr, session, run, cid="config-A", cver="v1")
    assert b.execution_config_id == ModelExecutionConfigId("config-A")
    assert b.execution_config_version == "v1"


def test_cfg_035_binding_parameter_snapshot():
    # CFG-035 binding parameter snapshot
    sm, rm, sink, sess_store, run_store, att_store, now = build_stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()
    settings = (ModelParameterSetting(ModelParameter.TEMPERATURE, 0.2),
                ModelParameterSetting(ModelParameter.MAX_OUTPUT_UNITS, 2048))
    profile_reg.register(make_profile())
    config_reg.register(make_config(settings=settings))
    agent_reg.register(make_agent())
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = build_manager(sess_store, run_store, agent_reg, profile_reg, config_reg,
                        binding_store, sink, now)
    b = _bind_ok(mgr, session, run)
    assert b.resolved_parameter_settings == settings


def test_cfg_036_binding_config_profile_exact_match():
    # CFG-036 binding config/profile exact match proven by successful bind
    mgr, binding_store, session, run = _bindable()
    b = _bind_ok(mgr, session, run)
    assert b.execution_profile_version == "v1"
    assert b.execution_config_version == "v1"


def test_cfg_037_wrong_config_profile_rejected():
    # CFG-037 config referencing a different profile rejected at bind
    sm, rm, sink, sess_store, run_store, att_store, now = build_stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()
    profile_reg.register(make_profile("profile-A", "v1"))
    # config points at profile-B
    config_reg.register(make_config("config-X", "v1",
        profile_ref=ModelExecutionProfileRef(ModelExecutionProfileId("profile-B"), "v1")))
    agent_reg.register(make_agent())
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = build_manager(sess_store, run_store, agent_reg, profile_reg, config_reg,
                        binding_store, sink, now)
    with pytest.raises(ModelExecutionConfigIncompatibleError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v1",
            execution_config_id=ModelExecutionConfigId("config-X"),
            execution_config_version="v1",
        )


def test_cfg_038_unsupported_config_param_rejected():
    # CFG-038 config with param not supported by profile rejected at bind
    sm, rm, sink, sess_store, run_store, att_store, now = build_stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()
    # profile supports only TEMPERATURE
    profile_reg.register(make_profile("profile-A", "v1",
        supported_parameters=frozenset({ModelParameter.TEMPERATURE})))
    # config uses SEED (unsupported)
    config_reg.register(make_config("config-A", "v1",
        settings=(ModelParameterSetting(ModelParameter.SEED, 1),)))
    agent_reg.register(make_agent())
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = build_manager(sess_store, run_store, agent_reg, profile_reg, config_reg,
                        binding_store, sink, now)
    with pytest.raises(ModelExecutionConfigIncompatibleError):
        mgr.bind_agent(
            session_id=session.session_id, run_id=run.run_id,
            agent_id=AgentId("agent-A"), agent_version="v1",
            execution_profile_id=ModelExecutionProfileId("profile-A"),
            execution_profile_version="v1",
            execution_config_id=ModelExecutionConfigId("config-A"),
            execution_config_version="v1",
        )


def test_cfg_039_config_missing_exact_version_rejected():
    # CFG-039 config exact version missing -> NotFound
    mgr, binding_store, session, run = _bindable()
    with pytest.raises(ModelExecutionConfigNotFoundError):
        _bind_ok(mgr, session, run, cver="v2")


def test_cfg_040_config_v1_pinned_when_v2_exists():
    # CFG-040 with config v2 registered, binding v1 stays v1
    sm, rm, sink, sess_store, run_store, att_store, now = build_stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()
    profile_reg.register(make_profile())
    config_reg.register(make_config(version="v1", settings=(
        ModelParameterSetting(ModelParameter.TEMPERATURE, 0.1),)))
    config_reg.register(make_config(version="v2", settings=(
        ModelParameterSetting(ModelParameter.TEMPERATURE, 0.9),)))
    agent_reg.register(make_agent())
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = build_manager(sess_store, run_store, agent_reg, profile_reg, config_reg,
                        binding_store, sink, now)
    b = _bind_ok(mgr, session, run, cver="v1")
    assert b.execution_config_version == "v1"
    assert b.resolved_parameter_settings[0].value == 0.1  # NOT v2's 0.9


def test_cfg_041_agent_bound_event_has_config_identity():
    # CFG-041 AGENT_BOUND event metadata has config identity
    mgr, binding_store, session, run = _bindable()
    _bind_ok(mgr, session, run)
    events = [e for e in mgr._sink._events  # type: ignore[attr-defined]
              if e.event_type is RuntimeEventType.AGENT_BOUND]
    assert events
    meta = events[0].metadata
    assert meta["execution_config_id"] == "config-A"
    assert meta["execution_config_version"] == "v1"


def test_cfg_042_event_no_full_parameter_values():
    # CFG-042 event does NOT copy full parameter values
    sm, rm, sink, sess_store, run_store, att_store, now = build_stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()
    profile_reg.register(make_profile())
    config_reg.register(make_config(settings=(
        ModelParameterSetting(ModelParameter.TEMPERATURE, 0.37),)))
    agent_reg.register(make_agent())
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = build_manager(sess_store, run_store, agent_reg, profile_reg, config_reg,
                        binding_store, sink, now)
    _bind_ok(mgr, session, run)
    evt = next(e for e in sink._events  # type: ignore[attr-defined]
               if e.event_type is RuntimeEventType.AGENT_BOUND)
    # no parameter value keys leaked into event metadata
    assert "TEMPERATURE" not in evt.metadata
    assert "parameters" not in evt.metadata
    assert "parameter_settings" not in evt.metadata


# =========================================================================
# CFG-043..048 — request propagation
# =========================================================================
def test_cfg_043_request_has_execution_parameters_field():
    # CFG-043 ProviderExecutionRequest has execution_parameters field
    names = {f.name for f in fields(ProviderExecutionRequest)}
    assert "execution_parameters" in names


def test_cfg_044_low_level_request_empty_params():
    # CFG-044 low-level direct request may use () execution_parameters
    from packages.runtime import ModelIdentifier, ProviderIdentifier
    req = ProviderExecutionRequest(
        request_id=ProviderExecutionRequestId("r"),
        session_id=run_id_helper(), run_id=run_id_helper2(),
        attempt_id=att_id_helper(),
        project_id=PROJECT, branch_id=BRANCH,
        provider=ProviderIdentifier(name="fake"),
        model=ModelIdentifier(name="m"),
        input_ref=INPUT_REF, projected_input=None, created_at=TZ,
    )
    assert req.execution_parameters == ()


def test_cfg_045_factory_parameters_from_binding():
    # CFG-045 Factory execution_parameters originate from Binding
    sm, rm, sink, sess_store, run_store, att_store, now = build_stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()
    settings = (ModelParameterSetting(ModelParameter.TEMPERATURE, 0.4),
                ModelParameterSetting(ModelParameter.MAX_OUTPUT_UNITS, 512))
    profile_reg.register(make_profile())
    config_reg.register(make_config(settings=settings))
    agent_reg.register(make_agent())
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = build_manager(sess_store, run_store, agent_reg, profile_reg, config_reg,
                        binding_store, sink, now)
    b = _bind_ok(mgr, session, run)
    rm.mark_ready(run.run_id)
    started_run, att = rm.start_run(run.run_id)
    factory = AgentProviderExecutionRequestFactory(att_store)
    req = factory.build(
        binding=b, session=session, run=started_run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    assert req.execution_parameters == settings


def test_cfg_046_factory_signature_no_execution_parameters_arg():
    # CFG-046 Factory.build signature has no execution_parameters param
    sig = inspect.signature(AgentProviderExecutionRequestFactory.build)
    assert "execution_parameters" not in sig.parameters
    assert "provider" not in sig.parameters
    assert "model" not in sig.parameters
    assert "input_ref" not in sig.parameters


def test_cfg_047_coordinator_does_not_interpret_parameters():
    # CFG-047 Coordinator does not interpret TEMPERATURE — it just forwards.
    # We assert by source inspection that execution.py has no TEMPERATURE branch.
    import packages.runtime.execution as ex
    src = inspect.getsource(ex)
    assert "TEMPERATURE" not in src
    assert "if request.execution_parameters" not in src


def test_cfg_048_fake_provider_can_observe_parameters():
    # CFG-048 Fake Provider observes request parameters; Runtime does not translate.
    sm, rm, sink, sess_store, run_store, att_store, now = build_stack()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    config_reg = InMemoryModelExecutionConfigRegistry()
    agent_reg = InMemoryAgentDefinitionRegistry()
    binding_store = InMemoryAgentExecutionBindingStore()
    settings = (ModelParameterSetting(ModelParameter.TEMPERATURE, 0.4),)
    profile_reg.register(make_profile())
    config_reg.register(make_config(settings=settings))
    agent_reg.register(make_agent())
    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    mgr = build_manager(sess_store, run_store, agent_reg, profile_reg, config_reg,
                        binding_store, sink, now)
    b = _bind_ok(mgr, session, run)
    rm.mark_ready(run.run_id)
    started_run, att = rm.start_run(run.run_id)
    factory = AgentProviderExecutionRequestFactory(att_store)
    req = factory.build(
        binding=b, session=session, run=started_run, attempt=att,
        request_id=ProviderExecutionRequestId("req-1"),
        projected_input=None, created_at=TZ,
    )
    fake = FakeProviderExecutor([FakeProviderExecutor.success({"ok": True})])
    coord = RuntimeExecutionCoordinator(
        rm, InMemoryProviderExecutionRequestStore(),
        InMemoryProviderExecutionResponseStore(), sink,
        response_id_factory=Counter("resp"), artifact_id_factory=Counter("art"),
        event_id_factory=Counter("evt"), now=now)
    import asyncio
    final_run, outcome = asyncio.run(coord.execute(req, fake))
    assert final_run.status.value == "SUCCEEDED"
    # Fake observed the canonical parameters unchanged
    assert fake.calls[0].execution_parameters == settings


# helpers for cfg-044 (avoid NewType construction noise)
def run_id_helper():
    from packages.domain.ids import RuntimeSessionId
    return RuntimeSessionId("s-1")


def run_id_helper2():
    from packages.domain.ids import RuntimeRunId
    return RuntimeRunId("r-1")


def att_id_helper():
    from packages.domain.ids import ExecutionAttemptId
    return ExecutionAttemptId("a-1")
