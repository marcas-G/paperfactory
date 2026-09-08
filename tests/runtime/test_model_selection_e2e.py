"""M3-SEL-001 / M3-SEL-002 — deterministic model selection, end-to-end.

M3-SEL-001: deterministic profile selection across 3 candidates.
M3-SEL-002: a Recommendation does NOT bind, does NOT choose Config, does NOT
            mutate Run/Attempt/provider — only an explicit caller bind does.
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime

from packages.domain.ids import (
    AgentId,
    BranchId,
    ModelExecutionConfigId,
    ModelExecutionProfileId,
    ModelSelectionPolicyId,
    ProjectId,
)
from packages.runtime import (
    AgentBindingManager,
    AgentDefinition,
    ModelCapability,
    ModelExecutionConfig,
    ModelExecutionProfile,
    ModelExecutionProfileRef,
    ModelIdentifier,
    ModelParameter,
    ModelParameterSetting,
    ModelSelectionEngine,
    ModelSelectionPolicy,
    ModelSelectionRecommendation,
    ModelSelectionRequirement,
    ModelSelectionSignals,
    ModelSelectionStatus,
    ModelSelectionWeights,
    ProviderIdentifier,
    RuntimeInputRef,
    RuntimeRunManager,
    RuntimeSessionManager,
)
from packages.runtime.testing import (
    InMemoryAgentDefinitionRegistry,
    InMemoryAgentExecutionBindingStore,
    InMemoryExecutionAttemptStore,
    InMemoryModelExecutionConfigRegistry,
    InMemoryModelExecutionProfileRegistry,
    InMemoryModelSelectionRecommendationStore,
    InMemoryRuntimeEventSink,
    InMemoryRuntimeRunStore,
    InMemoryRuntimeSessionStore,
)

PROJECT = ProjectId("P1")
BRANCH = BranchId("B1")
TZ = datetime(2026, 1, 1, tzinfo=UTC)
INPUT_REF = RuntimeInputRef(source_type="prompt_package", source_id="pkg-1", version="1")
FAKE = ProviderIdentifier(name="fake")
FAST = ProviderIdentifier(name="fast")
QUALITY = ProviderIdentifier(name="quality")
MODEL = ModelIdentifier(name="m")
CAPS = frozenset({ModelCapability.TEXT_GENERATION, ModelCapability.STRUCTURED_OUTPUT})
PARAMS = frozenset({ModelParameter.TEMPERATURE})


class Counter:
    _g = itertools.count(1)

    def __init__(self, prefix):
        self._p = prefix

    def __call__(self):
        return f"{self._p}-{next(Counter._g)}"


def _selection_setup():
    agent_reg = InMemoryAgentDefinitionRegistry()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    rec_store = InMemoryModelSelectionRecommendationStore()

    refs = {
        "fast": ModelExecutionProfileRef(ModelExecutionProfileId("P-fast"), "v1"),
        "quality": ModelExecutionProfileRef(ModelExecutionProfileId("P-quality"), "v1"),
        "disabled": ModelExecutionProfileRef(ModelExecutionProfileId("P-disabled"), "v1"),
    }
    for key, prov in (("fast", FAST), ("quality", QUALITY), ("disabled", FAKE)):
        profile_reg.register(
            ModelExecutionProfile(
                profile_id=refs[key].profile_id,
                version="v1",
                name=key,
                description="d",
                provider=prov,
                model=MODEL,
                capabilities=CAPS,
                supported_parameters=PARAMS,
            )
        )
    agent = AgentDefinition(
        agent_id=AgentId("A"),
        version="v1",
        name="A",
        description="d",
        allowed_execution_profiles=(refs["fast"], refs["quality"], refs["disabled"]),
    )
    agent_reg.register(agent)

    eng = ModelSelectionEngine(
        agent_reg, profile_reg, rec_store, evaluation_id_factory=Counter("ev"), now=lambda: TZ
    )
    return eng, agent_reg, profile_reg, rec_store, refs


def test_m3_sel_001_deterministic_profile_selection():
    """Deterministic scoring, disabled excluded, stable rank, repeatable."""
    eng, _, _, _, refs = _selection_setup()
    requirement = ModelSelectionRequirement(
        required_capabilities=frozenset(
            {ModelCapability.TEXT_GENERATION, ModelCapability.STRUCTURED_OUTPUT}
        ),
        required_parameters=frozenset(),
        allowed_providers=frozenset(),
        forbidden_profiles=frozenset(),
    )
    signals = {
        refs["fast"]: ModelSelectionSignals(0.6, 0.9, 0.9, 0.8, True),
        refs["quality"]: ModelSelectionSignals(0.95, 0.5, 0.5, 0.9, True),
        refs["disabled"]: ModelSelectionSignals(0.5, 0.5, 0.5, 0.5, False, ("DOWN",)),
    }
    policy = ModelSelectionPolicy(
        policy_id=ModelSelectionPolicyId("pol"),
        version="v1",
        weights=ModelSelectionWeights(0.4, 0.2, 0.2, 0.2),
    )

    rec1 = eng.evaluate(
        agent_id=AgentId("A"),
        agent_version="v1",
        policy=policy,
        requirement=requirement,
        signals=signals,
    )
    # disabled excluded
    assert any(e.profile_ref == refs["disabled"] for e in rec1.excluded_candidates)
    ranked_refs = [c.profile_ref for c in rec1.ranked_candidates]
    assert refs["disabled"] not in ranked_refs
    # status + selected
    assert rec1.status is ModelSelectionStatus.RECOMMENDED
    assert rec1.selected_profile_ref == rec1.ranked_candidates[0].profile_ref

    # repeat -> identical ranking + scores
    rec2 = eng.evaluate(
        agent_id=AgentId("A"),
        agent_version="v1",
        policy=policy,
        requirement=requirement,
        signals=signals,
    )
    assert [c.profile_ref for c in rec1.ranked_candidates] == [
        c.profile_ref for c in rec2.ranked_candidates
    ]
    assert [c.score for c in rec1.ranked_candidates] == [c.score for c in rec2.ranked_candidates]


def test_m3_sel_002_recommendation_is_not_binding():
    """Selection produces only a Recommendation. Only explicit caller bind
    creates a Binding."""
    eng, agent_reg, profile_reg, rec_store, refs = _selection_setup()
    requirement = ModelSelectionRequirement(
        required_capabilities=frozenset(
            {ModelCapability.TEXT_GENERATION, ModelCapability.STRUCTURED_OUTPUT}
        ),
        required_parameters=frozenset(),
        allowed_providers=frozenset(),
        forbidden_profiles=frozenset(),
    )
    signals = {
        refs["fast"]: ModelSelectionSignals(0.6, 0.9, 0.9, 0.8, True),
        refs["quality"]: ModelSelectionSignals(0.95, 0.5, 0.5, 0.9, True),
        refs["disabled"]: ModelSelectionSignals(0.5, 0.5, 0.5, 0.5, False, ("DOWN",)),
    }
    policy = ModelSelectionPolicy(
        policy_id=ModelSelectionPolicyId("pol"),
        version="v1",
        weights=ModelSelectionWeights(0.4, 0.2, 0.2, 0.2),
    )

    rec: ModelSelectionRecommendation = eng.evaluate(
        agent_id=AgentId("A"),
        agent_version="v1",
        policy=policy,
        requirement=requirement,
        signals=signals,
    )
    selected = rec.selected_profile_ref
    assert selected is not None

    # No binding/run/attempt exists yet: build a runtime stack and confirm
    # the binding store is empty until the caller explicitly binds.
    sess_store = InMemoryRuntimeSessionStore()
    run_store = InMemoryRuntimeRunStore()
    att_store = InMemoryExecutionAttemptStore()
    sink = InMemoryRuntimeEventSink()
    sm = RuntimeSessionManager(
        sess_store,
        run_store,
        sink,
        session_id_factory=Counter("s"),
        event_id_factory=Counter("e"),
        now=lambda: TZ,
    )
    rm = RuntimeRunManager(
        sess_store,
        run_store,
        att_store,
        sink,
        run_id_factory=Counter("r"),
        attempt_id_factory=Counter("a"),
        event_id_factory=Counter("e"),
        now=lambda: TZ,
    )
    binding_store = InMemoryAgentExecutionBindingStore()
    config_reg = InMemoryModelExecutionConfigRegistry()

    session = sm.create_session(project_id=PROJECT, branch_id=BRANCH)
    run = rm.create_run(session_id=session.session_id, input_ref=INPUT_REF)
    assert binding_store.get_for_run(run.run_id) is None

    # caller explicitly selects a compatible Config, then binds
    config = ModelExecutionConfig(
        config_id=ModelExecutionConfigId("C"),
        version="v1",
        name="C",
        description="d",
        profile_ref=selected,
        parameter_settings=(ModelParameterSetting(ModelParameter.TEMPERATURE, 0.3),),
    )
    config_reg.register(config)

    mgr = AgentBindingManager(
        sess_store,
        run_store,
        agent_reg,
        profile_reg,
        config_reg,
        binding_store,
        sink,
        binding_id_factory=Counter("b"),
        event_id_factory=Counter("e"),
        now=lambda: TZ,
    )
    binding = mgr.bind_agent(
        session_id=session.session_id,
        run_id=run.run_id,
        agent_id=AgentId("A"),
        agent_version="v1",
        execution_profile_id=selected.profile_id,
        execution_profile_version=selected.version,
        execution_config_id=ModelExecutionConfigId("C"),
        execution_config_version="v1",
    )
    assert binding_store.get_for_run(run.run_id) is binding
    # Run still CREATED; no attempt created by binding
    assert rm.get_run(run.run_id).status.value == "CREATED"
    assert att_store.list_for_run(run.run_id) == []
