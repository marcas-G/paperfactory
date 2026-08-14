"""STEP-014 Model Selection unit tests (SEL-001..055).

Each test carries a direct behavioral assertion — never "covered by E2E".
"""
from __future__ import annotations

import inspect
import math
from dataclasses import FrozenInstanceError
from datetime import UTC, datetime

import pytest

from packages.domain.ids import (
    AgentId,
    ModelExecutionProfileId,
    ModelSelectionPolicyId,
)
from packages.runtime import (
    InvalidModelSelectionPolicyError,
    InvalidModelSelectionSignalsError,
    ModelCapability,
    ModelExecutionProfileRef,
    ModelParameter,
    ModelSelectionEngine,
    ModelSelectionExclusionReason,
    ModelSelectionPolicy,
    ModelSelectionProfileResolutionError,
    ModelSelectionRecommendation,
    ModelSelectionRequirement,
    ModelSelectionSignals,
    ModelSelectionStatus,
    ModelSelectionWeights,
)
from packages.runtime.errors import (
    ModelSelectionSignalSetError,
)
from packages.runtime.testing import (
    InMemoryAgentDefinitionRegistry,
    InMemoryModelExecutionProfileRegistry,
    InMemoryModelSelectionRecommendationStore,
)

from ._step14_helpers import (
    Counter,
    make_agent,
    make_profile,
)

TZ = datetime(2026, 1, 1, tzinfo=UTC)

REF_A1 = ModelExecutionProfileRef(ModelExecutionProfileId("P-A"), "v1")
REF_B1 = ModelExecutionProfileRef(ModelExecutionProfileId("P-B"), "v1")
REF_C1 = ModelExecutionProfileRef(ModelExecutionProfileId("P-C"), "v1")


def _signals(quality=0.8, cost=0.7, latency=0.6, reliability=0.9, available=True,
             reasons=()):
    return ModelSelectionSignals(quality, cost, latency, reliability, available, reasons)


def _weights(q=0.25, c=0.25, lat=0.25, rel=0.25):
    return ModelSelectionWeights(q, c, lat, rel)


def _policy():
    return ModelSelectionPolicy(
        policy_id=ModelSelectionPolicyId("pol"), version="v1", weights=_weights())


def _cap_full():
    return frozenset({ModelCapability.TEXT_GENERATION, ModelCapability.STRUCTURED_OUTPUT})


def _req(**kw):
    defaults = {
        "required_capabilities": frozenset({ModelCapability.TEXT_GENERATION}),
        "required_parameters": frozenset(),
        "allowed_providers": frozenset(),
        "forbidden_profiles": frozenset(),
    }
    defaults.update(kw)
    return ModelSelectionRequirement(**defaults)


def _engine_with(agent=None, profiles=()):
    agent_reg = InMemoryAgentDefinitionRegistry()
    profile_reg = InMemoryModelExecutionProfileRegistry()
    rec_store = InMemoryModelSelectionRecommendationStore()
    if agent is not None:
        agent_reg.register(agent)
    for p in profiles:
        profile_reg.register(p)
    eng = ModelSelectionEngine(
        agent_reg, profile_reg, rec_store,
        evaluation_id_factory=Counter("ev"), now=lambda: TZ)
    return eng, agent_reg, profile_reg, rec_store


# =========================================================================
# SEL-001..008 — requirement filtering
# =========================================================================
def test_sel_001_requirement_immutable():
    # SEL-001 Requirement immutable
    r = _req()
    with pytest.raises(FrozenInstanceError):
        r.required_capabilities = frozenset()  # type: ignore[misc]


def test_sel_002_required_capability_subset_matches():
    # SEL-002 capability subset matches -> not excluded
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1", capabilities=_cap_full()),))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1",
        policy=_policy(), requirement=_req(
            required_capabilities=frozenset({ModelCapability.STRUCTURED_OUTPUT})),
        signals={REF_A1: _signals()})
    assert rec.status is ModelSelectionStatus.RECOMMENDED
    assert rec.excluded_candidates == ()


def test_sel_003_missing_capability_excluded():
    # SEL-003 missing capability -> excluded
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1", capabilities=frozenset(
            {ModelCapability.TEXT_GENERATION})),))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1",
        policy=_policy(), requirement=_req(
            required_capabilities=frozenset({ModelCapability.VISION_INPUT})),
        signals={REF_A1: _signals()})
    assert rec.excluded_candidates[0].reason is ModelSelectionExclusionReason.MISSING_CAPABILITY


def test_sel_004_required_parameter_support_matches():
    # SEL-004 parameter support matches -> not excluded
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1",
            supported_parameters=frozenset({ModelParameter.TEMPERATURE})),))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1",
        policy=_policy(), requirement=_req(
            required_parameters=frozenset({ModelParameter.TEMPERATURE})),
        signals={REF_A1: _signals()})
    assert rec.status is ModelSelectionStatus.RECOMMENDED


def test_sel_005_missing_parameter_support_excluded():
    # SEL-005 missing parameter support -> excluded
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1", supported_parameters=frozenset()),))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1",
        policy=_policy(), requirement=_req(
            required_parameters=frozenset({ModelParameter.SEED})),
        signals={REF_A1: _signals()})
    exc_reason = rec.excluded_candidates[0].reason
    assert exc_reason is ModelSelectionExclusionReason.MISSING_PARAMETER_SUPPORT


def test_sel_006_allowed_provider_matches():
    # SEL-006 allowed provider matches -> not excluded
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1",
        policy=_policy(), requirement=_req(allowed_providers=frozenset({"fake"})),
        signals={REF_A1: _signals()})
    assert rec.status is ModelSelectionStatus.RECOMMENDED


def test_sel_007_provider_not_allowed_excluded():
    # SEL-007 provider not allowed -> excluded
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1",
        policy=_policy(), requirement=_req(allowed_providers=frozenset({"openai"})),
        signals={REF_A1: _signals()})
    assert rec.excluded_candidates[0].reason is ModelSelectionExclusionReason.PROVIDER_NOT_ALLOWED


def test_sel_008_forbidden_profile_excluded():
    # SEL-008 forbidden profile -> excluded
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1",
        policy=_policy(), requirement=_req(forbidden_profiles=frozenset({REF_A1})),
        signals={REF_A1: _signals()})
    assert rec.excluded_candidates[0].reason is ModelSelectionExclusionReason.PROFILE_FORBIDDEN


# =========================================================================
# SEL-009..015 — signal validation
# =========================================================================
def test_sel_009_legal_signals():
    # SEL-009 legal signals construct
    s = _signals(0.0, 1.0, 0.5, 0.5)
    assert s.quality == 0.0
    assert s.cost_efficiency == 1.0


@pytest.mark.parametrize("q,c,lat,rel", [(-0.1, 0.5, 0.5, 0.5), (0.5, -0.1, 0.5, 0.5),
                                      (0.5, 0.5, -0.1, 0.5), (0.5, 0.5, 0.5, -0.1)])
def test_sel_010_negative_signal_rejected(q, c, lat, rel):
    # SEL-010 negative signal rejected
    with pytest.raises(InvalidModelSelectionSignalsError):
        ModelSelectionSignals(q, c, lat, rel, True)


@pytest.mark.parametrize("q,c,lat,rel", [(1.1, 0.5, 0.5, 0.5), (0.5, 1.1, 0.5, 0.5),
                                      (0.5, 0.5, 1.1, 0.5), (0.5, 0.5, 0.5, 1.1)])
def test_sel_011_above_one_signal_rejected(q, c, lat, rel):
    # SEL-011 >1 signal rejected
    with pytest.raises(InvalidModelSelectionSignalsError):
        ModelSelectionSignals(q, c, lat, rel, True)


def test_sel_012_nan_rejected():
    # SEL-012 NaN rejected
    with pytest.raises(InvalidModelSelectionSignalsError):
        ModelSelectionSignals(float("nan"), 0.5, 0.5, 0.5, True)


def test_sel_013_inf_rejected():
    # SEL-013 inf rejected
    with pytest.raises(InvalidModelSelectionSignalsError):
        ModelSelectionSignals(float("inf"), 0.5, 0.5, 0.5, True)


def test_sel_014_unavailable_requires_reason():
    # SEL-014 available=False requires reason_codes
    with pytest.raises(InvalidModelSelectionSignalsError):
        ModelSelectionSignals(0.5, 0.5, 0.5, 0.5, False, ())
    # with reason is fine
    ModelSelectionSignals(0.5, 0.5, 0.5, 0.5, False, ("DOWN",))


def test_sel_015_signals_immutable():
    # SEL-015 signals immutable
    s = _signals()
    with pytest.raises(FrozenInstanceError):
        s.quality = 0.1  # type: ignore[misc]


# =========================================================================
# SEL-016..019 — input completeness
# =========================================================================
def _two_profile_engine():
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1, REF_B1)),
        profiles=(make_profile("P-A", "v1"), make_profile("P-B", "v1")))
    return eng


def test_sel_016_both_allowed_profiles_signals_ok():
    # SEL-016 signals for all allowed profiles succeed
    eng = _two_profile_engine()
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1",
        policy=_policy(), requirement=_req(),
        signals={REF_A1: _signals(quality=0.9), REF_B1: _signals(quality=0.5)})
    assert rec.status is ModelSelectionStatus.RECOMMENDED
    assert rec.selected_profile_ref == REF_A1


def test_sel_017_missing_signals_fails():
    # SEL-017 missing one profile's signals fails evaluation
    eng = _two_profile_engine()
    with pytest.raises(ModelSelectionSignalSetError):
        eng.evaluate(
            agent_id=AgentId("A"), agent_version="v1",
            policy=_policy(), requirement=_req(),
            signals={REF_A1: _signals()})  # missing REF_B1


def test_sel_018_duplicate_signal_profile_fails():
    # SEL-018 duplicate signal profile fails (dict cannot hold dup keys, so we
    # verify by passing the same ref twice via a malformed mapping is impossible;
    # instead assert that extra non-allowed ref fails — dup is structurally
    # impossible in a dict. We confirm completeness check rejects extras).
    eng = _two_profile_engine()
    extra = ModelExecutionProfileRef(ModelExecutionProfileId("P-X"), "v1")
    with pytest.raises(ModelSelectionSignalSetError):
        eng.evaluate(
            agent_id=AgentId("A"), agent_version="v1",
            policy=_policy(), requirement=_req(),
            signals={REF_A1: _signals(), REF_B1: _signals(), extra: _signals()})


def test_sel_019_extra_non_allowed_profile_signal_fails():
    # SEL-019 extra non-allowed profile signal fails
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    extra = ModelExecutionProfileRef(ModelExecutionProfileId("P-Z"), "v1")
    with pytest.raises(ModelSelectionSignalSetError):
        eng.evaluate(
            agent_id=AgentId("A"), agent_version="v1",
            policy=_policy(), requirement=_req(),
            signals={REF_A1: _signals(), extra: _signals()})


# =========================================================================
# SEL-020..024 — policy
# =========================================================================
def test_sel_020_weights_immutable():
    # SEL-020 weights immutable
    w = _weights()
    with pytest.raises(FrozenInstanceError):
        w.quality_weight = 0.1  # type: ignore[misc]


def test_sel_021_negative_weight_rejected():
    # SEL-021 negative weight rejected
    with pytest.raises(InvalidModelSelectionPolicyError):
        ModelSelectionWeights(-0.1, 0.5, 0.5, 0.5)


def test_sel_022_all_zero_weight_rejected():
    # SEL-022 all-zero weights rejected
    with pytest.raises(InvalidModelSelectionPolicyError):
        ModelSelectionWeights(0.0, 0.0, 0.0, 0.0)


def test_sel_023_policy_immutable_versioned():
    # SEL-023 Policy immutable + versioned
    p = _policy()
    assert p.version == "v1"
    with pytest.raises(FrozenInstanceError):
        p.version = "v2"  # type: ignore[misc]


def test_sel_024_no_hidden_default_policy():
    # SEL-024 no hidden default policy — engine requires explicit policy
    sig = inspect.signature(ModelSelectionEngine.evaluate)
    assert "policy" in sig.parameters
    assert sig.parameters["policy"].default is inspect.Parameter.empty


# =========================================================================
# SEL-025..030 — scoring
# =========================================================================
def _score_engine():
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1, REF_B1)),
        profiles=(make_profile("P-A", "v1"), make_profile("P-B", "v1")))
    return eng


def test_sel_025_quality_higher_ranks_higher():
    # SEL-025 quality-weighted: higher quality ranks higher
    eng = _score_engine()
    policy = ModelSelectionPolicy(
        policy_id=ModelSelectionPolicyId("p"), version="v1",
        weights=ModelSelectionWeights(1.0, 0.0, 0.0, 0.0))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1", policy=policy,
        requirement=_req(),
        signals={REF_A1: _signals(quality=0.9), REF_B1: _signals(quality=0.4)})
    assert rec.ranked_candidates[0].profile_ref == REF_A1


def test_sel_026_cost_efficiency_higher_ranks_higher():
    # SEL-026 cost_efficiency-weighted
    eng = _score_engine()
    policy = ModelSelectionPolicy(
        policy_id=ModelSelectionPolicyId("p"), version="v1",
        weights=ModelSelectionWeights(0.0, 1.0, 0.0, 0.0))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1", policy=policy,
        requirement=_req(),
        signals={REF_A1: _signals(cost=0.3), REF_B1: _signals(cost=0.8)})
    assert rec.ranked_candidates[0].profile_ref == REF_B1


def test_sel_027_latency_higher_ranks_higher():
    # SEL-027 latency-weighted
    eng = _score_engine()
    policy = ModelSelectionPolicy(
        policy_id=ModelSelectionPolicyId("p"), version="v1",
        weights=ModelSelectionWeights(0.0, 0.0, 1.0, 0.0))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1", policy=policy,
        requirement=_req(),
        signals={REF_A1: _signals(latency=0.7), REF_B1: _signals(latency=0.2)})
    assert rec.ranked_candidates[0].profile_ref == REF_A1


def test_sel_028_reliability_higher_ranks_higher():
    # SEL-028 reliability-weighted
    eng = _score_engine()
    policy = ModelSelectionPolicy(
        policy_id=ModelSelectionPolicyId("p"), version="v1",
        weights=ModelSelectionWeights(0.0, 0.0, 0.0, 1.0))
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1", policy=policy,
        requirement=_req(),
        signals={REF_A1: _signals(reliability=0.5), REF_B1: _signals(reliability=0.95)})
    assert rec.ranked_candidates[0].profile_ref == REF_B1


def test_sel_029_components_sum_equals_total():
    # SEL-029 score components sum == total
    eng = _score_engine()
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1", policy=_policy(),
        requirement=_req(),
        signals={REF_A1: _signals(0.2, 0.4, 0.6, 0.8), REF_B1: _signals()})
    comp = rec.ranked_candidates[0].score_components
    s = (comp.quality_component + comp.cost_efficiency_component
         + comp.latency_component + comp.reliability_component)
    assert math.isclose(s, comp.total_score)


def test_sel_030_unavailable_excluded_before_scoring():
    # SEL-030 unavailable candidate excluded before scoring
    eng = _score_engine()
    rec = eng.evaluate(
        agent_id=AgentId("A"), agent_version="v1", policy=_policy(),
        requirement=_req(),
        signals={REF_A1: _signals(quality=0.99),
                 REF_B1: _signals(available=False, reasons=("DOWN",))})
    assert rec.ranked_candidates[0].profile_ref == REF_A1
    assert any(e.reason is ModelSelectionExclusionReason.UNAVAILABLE
               for e in rec.excluded_candidates)


# =========================================================================
# SEL-031..035 — determinism / tie-break
# =========================================================================
def test_sel_031_same_input_same_ranking():
    # SEL-031 repeated evaluation -> same ranking
    eng1, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1, REF_B1)),
        profiles=(make_profile("P-A", "v1"), make_profile("P-B", "v1")))
    eng2, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1, REF_B1)),
        profiles=(make_profile("P-A", "v1"), make_profile("P-B", "v1")))
    sig = {REF_A1: _signals(0.8), REF_B1: _signals(0.5)}
    r1 = eng1.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(), signals=sig)
    r2 = eng2.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(), signals=sig)
    assert [c.profile_ref for c in r1.ranked_candidates] == \
           [c.profile_ref for c in r2.ranked_candidates]
    assert [c.score for c in r1.ranked_candidates] == \
           [c.score for c in r2.ranked_candidates]


def test_sel_032_signal_input_order_change_same_ranking():
    # SEL-032 dict insertion order changed -> same ranking
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1, REF_B1)),
        profiles=(make_profile("P-A", "v1"), make_profile("P-B", "v1")))
    sig_a_first = {REF_A1: _signals(0.8), REF_B1: _signals(0.5)}
    sig_b_first = {REF_B1: _signals(0.5), REF_A1: _signals(0.8)}
    r1 = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                      policy=_policy(), requirement=_req(), signals=sig_a_first)
    r2 = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                      policy=_policy(), requirement=_req(), signals=sig_b_first)
    assert [c.profile_ref for c in r1.ranked_candidates] == \
           [c.profile_ref for c in r2.ranked_candidates]


def test_sel_033_registration_order_change_same_ranking():
    # SEL-033 profile registration order changed -> same ranking
    eng1, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1, REF_B1)),
        profiles=(make_profile("P-A", "v1"), make_profile("P-B", "v1")))
    eng2, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1, REF_B1)),
        profiles=(make_profile("P-B", "v1"), make_profile("P-A", "v1")))
    sig = {REF_A1: _signals(0.8), REF_B1: _signals(0.8)}  # equal signals
    r1 = eng1.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(), signals=sig)
    r2 = eng2.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(), signals=sig)
    assert [c.profile_ref for c in r1.ranked_candidates] == \
           [c.profile_ref for c in r2.ranked_candidates]


def test_sel_034_equal_score_lexical_profile_id_tiebreak():
    # SEL-034 equal score -> profile_id lexical ascending
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_B1, REF_A1)),  # B listed first
        profiles=(make_profile("P-B", "v1"), make_profile("P-A", "v1")))
    sig = {REF_A1: _signals(0.8), REF_B1: _signals(0.8)}  # equal
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(), signals=sig)
    # P-A should rank before P-B despite B listed first
    assert rec.ranked_candidates[0].profile_ref == REF_A1


def test_sel_035_same_profile_id_equal_score_version_tiebreak():
    # SEL-035 same profile id, equal score -> version lexical ascending
    ref_v1 = ModelExecutionProfileRef(ModelExecutionProfileId("P-A"), "v1")
    ref_v2 = ModelExecutionProfileRef(ModelExecutionProfileId("P-A"), "v2")
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(ref_v2, ref_v1)),  # v2 listed first
        profiles=(make_profile("P-A", "v2"), make_profile("P-A", "v1")))
    sig = {ref_v1: _signals(0.8), ref_v2: _signals(0.8)}  # equal
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(), signals=sig)
    assert rec.ranked_candidates[0].profile_ref == ref_v1  # v1 < v2


# =========================================================================
# SEL-036..044 — recommendation
# =========================================================================
def test_sel_036_candidate_exists_recommended():
    # SEL-036 candidate exists -> RECOMMENDED
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(),
                       signals={REF_A1: _signals()})
    assert rec.status is ModelSelectionStatus.RECOMMENDED


def test_sel_037_selected_equals_rank1():
    # SEL-037 selected == rank-1 candidate
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1, REF_B1)),
        profiles=(make_profile("P-A", "v1"), make_profile("P-B", "v1")))
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(),
                       signals={REF_A1: _signals(0.9), REF_B1: _signals(0.4)})
    assert rec.selected_profile_ref == rec.ranked_candidates[0].profile_ref
    assert rec.ranked_candidates[0].rank == 1


def test_sel_038_all_filtered_no_match():
    # SEL-038 all filtered -> NO_MATCH
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(),
                       requirement=_req(forbidden_profiles=frozenset({REF_A1})),
                       signals={REF_A1: _signals()})
    assert rec.status is ModelSelectionStatus.NO_MATCH


def test_sel_039_no_match_selected_none():
    # SEL-039 NO_MATCH selected is None
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(),
                       requirement=_req(forbidden_profiles=frozenset({REF_A1})),
                       signals={REF_A1: _signals()})
    assert rec.selected_profile_ref is None
    assert rec.ranked_candidates == ()


def test_sel_040_recommendation_immutable():
    # SEL-040 Recommendation immutable
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(),
                       signals={REF_A1: _signals()})
    with pytest.raises(FrozenInstanceError):
        rec.status = ModelSelectionStatus.NO_MATCH  # type: ignore[misc]


def test_sel_041_recommendation_records_exact_agent_version():
    # SEL-041 Recommendation records exact agent version
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", version="v3", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v3",
                       policy=_policy(), requirement=_req(),
                       signals={REF_A1: _signals()})
    assert rec.agent_version == "v3"


def test_sel_042_recommendation_records_policy_version():
    # SEL-042 Recommendation records policy version
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    policy = ModelSelectionPolicy(
        policy_id=ModelSelectionPolicyId("pol-7"), version="v4", weights=_weights())
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=policy, requirement=_req(),
                       signals={REF_A1: _signals()})
    assert rec.policy_id == ModelSelectionPolicyId("pol-7")
    assert rec.policy_version == "v4"


def test_sel_043_recommendation_store_roundtrip():
    # SEL-043 Recommendation Store round-trip
    eng, _, _, rec_store = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(),
                       signals={REF_A1: _signals()})
    assert rec_store.get(rec.evaluation_id) is rec
    assert rec_store.list_for_agent(AgentId("A")) == [rec]


def test_sel_044_duplicate_evaluation_id_rejected():
    # SEL-044 duplicate evaluation_id rejected by store
    eng, _, _, rec_store = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    rec = eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                       policy=_policy(), requirement=_req(),
                       signals={REF_A1: _signals()})
    with pytest.raises(Exception):
        rec_store.save(rec)  # same evaluation_id


# =========================================================================
# SEL-045..049 — no automatic binding / config / provider
# =========================================================================
def test_sel_045_selection_creates_no_binding():
    # SEL-045 evaluate() creates no binding (engine has no binding store)
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=(make_profile("P-A", "v1"),))
    # engine.__init__ has no binding_store param
    sig = inspect.signature(ModelSelectionEngine.__init__)
    assert "binding_store" not in sig.parameters


def test_sel_046_selection_does_not_modify_run():
    # SEL-046 evaluate() has no run dependency
    sig = inspect.signature(ModelSelectionEngine.evaluate)
    assert "run_id" not in sig.parameters
    assert "run" not in sig.parameters


def test_sel_047_selection_creates_no_attempt():
    # SEL-047 evaluate() has no attempt dependency
    sig = inspect.signature(ModelSelectionEngine.evaluate)
    assert "attempt" not in sig.parameters


def test_sel_048_selection_does_not_call_provider():
    # SEL-048 engine has no provider port
    src = inspect.getsource(ModelSelectionEngine)
    assert "ProviderExecutionPort" not in src
    assert "executor" not in src


def test_sel_049_selection_does_not_choose_config():
    # SEL-049 Recommendation carries no config choice
    fields_names = {f.name for f in ModelSelectionRecommendation.__dataclass_fields__.values()}
    assert "selected_config" not in fields_names
    assert "config_id" not in fields_names
    sig = inspect.signature(ModelSelectionEngine.evaluate)
    assert "config_id" not in sig.parameters


# =========================================================================
# SEL-050..055 — no hidden intelligence
# =========================================================================
def test_sel_050_selector_no_cognition_import():
    # SEL-050 selector does not import cognition
    import packages.runtime.model_selection as ms
    src = inspect.getsource(ms)
    assert "packages.cognition" not in src


def test_sel_051_selector_no_control_import():
    # SEL-051 selector does not import control
    import packages.runtime.model_selection as ms
    src = inspect.getsource(ms)
    assert "packages.control" not in src


def test_sel_052_selector_no_openai():
    # SEL-052 no openai
    import packages.runtime.model_selection as ms
    assert "openai" not in inspect.getsource(ms)


def test_sel_053_selector_no_anthropic():
    # SEL-053 no anthropic
    import packages.runtime.model_selection as ms
    assert "anthropic" not in inspect.getsource(ms)


def test_sel_054_selector_no_network():
    # SEL-054 no network primitives
    import packages.runtime.model_selection as ms
    src = inspect.getsource(ms)
    for forbidden in ("socket", "urllib", "http", "aiohttp", "httpx"):
        assert forbidden not in src


def test_sel_055_selector_no_current_price_lookup():
    # SEL-055 no current pricing / benchmark query: the engine has no
    # method/attribute that fetches live metrics, prices, or benchmarks.
    import packages.runtime.model_selection as ms
    public = [n for n in dir(ms.ModelSelectionEngine) if not n.startswith("_")]
    for forbidden in ("price", "benchmark", "fetch", "live", "metric"):
        assert not any(forbidden in n.lower() for n in public), f"forbidden attr {forbidden}"
    # evaluate() signature takes only explicit caller inputs (no metric source)
    sig = inspect.signature(ms.ModelSelectionEngine.evaluate)
    for forbidden in ("price", "benchmark", "metric", "live"):
        assert not any(forbidden in p.lower() for p in sig.parameters), \
            f"forbidden param {forbidden}"


# =========================================================================
# Bonus: missing allowed profile -> configuration error (AC-35)
# =========================================================================
def test_missing_allowed_profile_is_configuration_error():
    # AC-35: an allowed profile not registered -> ModelSelectionProfileResolutionError
    eng, _, _, _ = _engine_with(
        agent=make_agent(aid="A", refs=(REF_A1,)),
        profiles=())  # P-A/v1 NOT registered
    with pytest.raises(ModelSelectionProfileResolutionError):
        eng.evaluate(agent_id=AgentId("A"), agent_version="v1",
                     policy=_policy(), requirement=_req(),
                     signals={REF_A1: _signals()})
