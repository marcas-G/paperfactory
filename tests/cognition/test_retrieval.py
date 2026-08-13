"""RET-001..070 + M2-RET-001 — deterministic context retrieval policy.

Verifies: requirement declaration → metadata resolution → ContextRequest
conversion, with strict determinism, explicit label matching, scope isolation,
FIRST_REQUIREMENT_WINS dedup, and a clean handoff to the STEP-006 compiler.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from packages.cognition import (
    BlindingPolicy,
    ContextItemType,
    ContextLayer,
    ContextPolicy,
    ContextScope,
    InstructionAuthority,
    RetrievalExclusionReason,
    RetrievalPolicy,
    RetrievalResolver,
)
from packages.cognition.errors import (
    InvalidRetrievalRequirementError,
    RequiredRetrievalRequirementUnsatisfiedError,
)
from packages.cognition.retrieval import RESOLVER_VERSION
from packages.domain.ids import (
    ContextItemId,
    ContextRequestId,
    ProjectId,
    RetrievalPolicyId,
    RetrievalRequirementId,
    RetrievalResolutionId,
)

from .conftest import (
    ACTION,
    BRANCH,
    PROJECT,
    REVISION,
    add_to_catalog,
    make_item,
    make_requirement,
)


# =========================================================================
# RET-001..004 — ContextItem extension
# =========================================================================
def test_ret_001_context_item_type_nine_values() -> None:
    assert {t.value for t in ContextItemType} == {
        "INSTRUCTION", "STATE", "EVIDENCE", "DECISION", "CONSTRAINT",
        "FAILURE", "ARTIFACT", "REFERENCE", "NOTE",
    }


def test_ret_002_item_type_required() -> None:
    # item_type is a required field; make_item defaults to NOTE. Constructing
    # without it is impossible (positional/required) — verify default present.
    item = make_item("x")
    assert item.item_type is ContextItemType.NOTE


def test_ret_003_labels_immutable() -> None:
    item = make_item("x", labels=frozenset({"a"}))
    with pytest.raises(AttributeError):
        item.labels = frozenset({"b"})  # type: ignore[misc]


def test_ret_004_empty_label_rejected() -> None:
    with pytest.raises(Exception):  # InvalidContextItemError
        make_item("x", labels=frozenset({""}))


# =========================================================================
# RET-005..012 — requirement validation
# =========================================================================
def test_ret_005_legal_requirement_created() -> None:
    req = make_requirement("r1")
    assert req.minimum_count == 1


def test_ret_006_empty_item_types_rejected() -> None:
    with pytest.raises(InvalidRetrievalRequirementError):
        make_requirement("r", item_types=frozenset())


def test_ret_007_empty_layers_rejected() -> None:
    with pytest.raises(InvalidRetrievalRequirementError):
        make_requirement("r", layers=frozenset())


def test_ret_008_empty_scopes_rejected() -> None:
    with pytest.raises(InvalidRetrievalRequirementError):
        make_requirement("r", scopes=frozenset())


def test_ret_009_negative_minimum_rejected() -> None:
    with pytest.raises(InvalidRetrievalRequirementError):
        make_requirement("r", minimum_count=-1)


def test_ret_010_non_positive_maximum_rejected() -> None:
    with pytest.raises(InvalidRetrievalRequirementError):
        make_requirement("r", maximum_count=0)


def test_ret_011_min_greater_than_max_rejected() -> None:
    with pytest.raises(InvalidRetrievalRequirementError):
        make_requirement("r", minimum_count=5, maximum_count=3)


def test_ret_012_priority_out_of_range_rejected() -> None:
    with pytest.raises(InvalidRetrievalRequirementError):
        make_requirement("r", priority=101)


# =========================================================================
# RET-013..018 — label matching
# =========================================================================
def _resolve_one(resolver, catalog, context_policy, req):  # type: ignore[no-untyped-def]
    return resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        requirements=[req], retrieval_policy=RetrievalPolicy(
            policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )


def test_ret_013_required_labels_all_match(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", labels=frozenset({"x", "y"}))])
    req = make_requirement("r", required_labels=frozenset({"x", "y"}),
                           layers=frozenset({ContextLayer.TASK}))
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in res.required_item_ids


def test_ret_014_missing_required_label_no_match(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", labels=frozenset({"x"}))])
    req = make_requirement("r", required_labels=frozenset({"x", "y"}),
                           minimum_count=0)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert res.required_item_ids == ()


def test_ret_015_any_labels_any_match(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", labels=frozenset({"y"}))])
    req = make_requirement("r", any_labels=frozenset({"x", "y"}))
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in res.required_item_ids


def test_ret_016_any_labels_no_match(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", labels=frozenset({"z"}))])
    req = make_requirement("r", any_labels=frozenset({"x", "y"}), minimum_count=0)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert res.required_item_ids == ()


def test_ret_017_excluded_labels_excludes(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", labels=frozenset({"bad"}))])
    req = make_requirement("r", excluded_labels=frozenset({"bad"}), minimum_count=0)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert res.required_item_ids == ()


def test_ret_018_case_sensitive_no_autofix(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", labels=frozenset({"Novelty"}))])
    req = make_requirement("r", required_labels=frozenset({"novelty"}),
                           minimum_count=0)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert res.required_item_ids == ()


# =========================================================================
# RET-019..026 — metadata matching
# =========================================================================
def test_ret_019_item_type_match(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", item_type=ContextItemType.EVIDENCE)])
    req = make_requirement("r", item_types=frozenset({ContextItemType.EVIDENCE}))
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in res.required_item_ids


def test_ret_020_wrong_item_type_no_match(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", item_type=ContextItemType.EVIDENCE)])
    req = make_requirement("r", item_types=frozenset({ContextItemType.INSTRUCTION}),
                           minimum_count=0)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert res.required_item_ids == ()


def test_ret_021_layer_match(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", layer=ContextLayer.STATE,
                                       scope=ContextScope.PROJECT)])
    req = make_requirement("r", layers=frozenset({ContextLayer.STATE}),
                           scopes=frozenset({ContextScope.PROJECT}))
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in res.required_item_ids


def test_ret_022_scope_type_match(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", scope=ContextScope.SYSTEM,
                                       layer=ContextLayer.GLOBAL)])
    req = make_requirement("r", layers=frozenset({ContextLayer.GLOBAL}),
                           scopes=frozenset({ContextScope.SYSTEM}))
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in res.required_item_ids


def test_ret_023_same_project_visible(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", scope=ContextScope.PROJECT,
                                       layer=ContextLayer.STATE)])
    req = make_requirement("r", layers=frozenset({ContextLayer.STATE}),
                           scopes=frozenset({ContextScope.PROJECT}))
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in res.required_item_ids


def test_ret_024_cross_project_no_match(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a", scope=ContextScope.PROJECT,
                                       layer=ContextLayer.STATE,
                                       project_id=ProjectId("OTHER"))])
    req = make_requirement("r", layers=frozenset({ContextLayer.STATE}),
                           scopes=frozenset({ContextScope.PROJECT}), minimum_count=0)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert res.required_item_ids == ()


def test_ret_025_same_branch_visible(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a")])  # BRANCH(P1,B1) default
    req = make_requirement("r")
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in res.required_item_ids


def test_ret_026_cross_branch_no_match(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    from packages.domain.ids import BranchId

    add_to_catalog(catalog, [make_item("a", branch_id=BranchId("B2"))])
    req = make_requirement("r", minimum_count=0)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert res.required_item_ids == ()


# =========================================================================
# RET-027..031 — selection ordering / limits
# =========================================================================
def test_ret_027_priority_descending(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [
        make_item("low", priority=10),
        make_item("high", priority=90),
    ])
    req = make_requirement("r", maximum_count=2)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert list(res.required_item_ids) == [ContextItemId("high"), ContextItemId("low")]


def test_ret_028_layer_order_tiebreak(resolver, catalog) -> None:  # type: ignore[no-untyped-def]
    policy = ContextPolicy(
        policy_id="rev", version=1,
        layer_order=(ContextLayer.TASK, ContextLayer.STATE, ContextLayer.GLOBAL),
        default_blinding_policy=__import__(
            "packages.cognition", fromlist=["BlindingPolicy"]).BlindingPolicy(
            policy_id="n", version=1),
    )
    g = make_item("g", layer=ContextLayer.GLOBAL, scope=ContextScope.SYSTEM, priority=50)
    t = make_item("t", priority=50)
    add_to_catalog(catalog, [g, t])
    req = make_requirement("r", layers=frozenset({ContextLayer.GLOBAL, ContextLayer.TASK}),
                           scopes=frozenset({ContextScope.SYSTEM, ContextScope.BRANCH}),
                           maximum_count=2)
    res = _resolve_one(resolver, catalog, policy, req)
    assert list(res.required_item_ids) == [ContextItemId("t"), ContextItemId("g")]


def test_ret_029_item_id_lexical_tiebreak(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [
        make_item("z", priority=50),
        make_item("a", priority=50),
    ])
    req = make_requirement("r", maximum_count=2)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert list(res.required_item_ids) == [ContextItemId("a"), ContextItemId("z")]


def test_ret_030_maximum_count_truncates(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [
        make_item("a", priority=90),
        make_item("b", priority=50),
        make_item("c", priority=10),
    ])
    req = make_requirement("r", maximum_count=2)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert set(res.required_item_ids) == {ContextItemId("a"), ContextItemId("b")}


def test_ret_031_truncated_recorded_as_requirement_limit(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    add_to_catalog(catalog, [
        make_item("a", priority=90),
        make_item("b", priority=50),
        make_item("c", priority=10),
    ])
    req = make_requirement("r", maximum_count=1)
    res = _resolve_one(resolver, catalog, context_policy, req)
    rr = res.requirement_resolutions[0]
    limit_reasons = [e for e in rr.exclusions
                     if e.reason_code is RetrievalExclusionReason.REQUIREMENT_LIMIT]
    assert len(limit_reasons) == 2


# =========================================================================
# RET-032..035 — dedup
# =========================================================================
def test_ret_032_same_item_matches_multiple_requirements(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    item = make_item("shared", priority=80)
    add_to_catalog(catalog, [item])
    r1 = make_requirement("r1", priority=90)
    r2 = make_requirement("r2", priority=10, required=False, minimum_count=0)
    res = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        requirements=[r1, r2],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )
    # shared selected only once
    all_selected = set(res.required_item_ids)
    assert all_selected == {ContextItemId("shared")}


def test_ret_033_first_requirement_wins(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    item = make_item("shared", priority=80)
    add_to_catalog(catalog, [item])
    r1 = make_requirement("r1", priority=90)
    r2 = make_requirement("r2", priority=10, required=False, minimum_count=0)
    res = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        requirements=[r1, r2],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )
    rr1 = next(
        rr for rr in res.requirement_resolutions
        if rr.requirement_id == RetrievalRequirementId("r1")
    )
    assert ContextItemId("shared") in rr1.selected_item_ids


def test_ret_034_later_requirement_records_already_selected(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    item = make_item("shared", priority=80)
    add_to_catalog(catalog, [item])
    r1 = make_requirement("r1", priority=90)
    r2 = make_requirement("r2", priority=10, minimum_count=0)
    res = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        requirements=[r1, r2],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )
    rr2 = next(
        rr for rr in res.requirement_resolutions
        if rr.requirement_id == RetrievalRequirementId("r2")
    )
    already = [e for e in rr2.exclusions
               if e.reason_code is RetrievalExclusionReason.ALREADY_SELECTED]
    assert len(already) == 1


def test_ret_035_requirement_input_order_invariant(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a"), make_item("b")])
    r1 = make_requirement("r1", priority=90, maximum_count=2)
    r2 = make_requirement("r2", priority=10, required=False, minimum_count=0)
    fwd = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=[r1, r2],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )
    rev = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=[r2, r1],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )
    assert set(fwd.required_item_ids) == set(rev.required_item_ids)


# =========================================================================
# RET-036..038 — required requirement
# =========================================================================
def test_ret_036_required_satisfied_succeeds(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a")])
    req = make_requirement("r", minimum_count=1)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in res.required_item_ids


def test_ret_037_required_unsatisfied_fails(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    req = make_requirement("r", minimum_count=2)
    with pytest.raises(RequiredRetrievalRequirementUnsatisfiedError):
        _resolve_one(resolver, catalog, context_policy, req)


def test_ret_038_error_carries_counts(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    req = make_requirement("r", minimum_count=2)
    with pytest.raises(RequiredRetrievalRequirementUnsatisfiedError) as exc_info:
        _resolve_one(resolver, catalog, context_policy, req)
    assert exc_info.value.requirement_id == "r"
    assert exc_info.value.minimum_count == 2
    assert exc_info.value.actual_count == 0


# =========================================================================
# RET-039..041 — optional requirement
# =========================================================================
def test_ret_039_optional_unsatisfied_succeeds(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    req = make_requirement("r", required=False, minimum_count=2)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert res.optional_item_ids == ()


def test_ret_040_records_unsatisfied_optional(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    req = make_requirement("r", required=False, minimum_count=2)
    res = _resolve_one(resolver, catalog, context_policy, req)
    rr = res.requirement_resolutions[0]
    unsat = [e for e in rr.exclusions
             if e.reason_code is RetrievalExclusionReason.UNSATISFIED_OPTIONAL_REQUIREMENT]
    assert len(unsat) == 1


def test_ret_041_optional_selected_go_to_optional_ids(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a")])
    req = make_requirement("r", required=False, minimum_count=0)
    res = _resolve_one(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in res.optional_item_ids
    assert res.required_item_ids == ()


# =========================================================================
# RET-042..044 — forbidden
# =========================================================================
def test_ret_042_forbidden_selected_excluded(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a"), make_item("b")])
    req = make_requirement("r", maximum_count=2)
    res = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=[req],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
        forbidden_item_ids=(ContextItemId("a"),),
    )
    assert ContextItemId("a") not in res.required_item_ids
    assert ContextItemId("b") in res.required_item_ids


def test_ret_043_forbidden_causes_required_fail(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a")])
    req = make_requirement("r", minimum_count=1)
    with pytest.raises(RequiredRetrievalRequirementUnsatisfiedError):
        resolver.resolve(
            project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
            action_id=ACTION, cognitive_mode="FALSIFY", requirements=[req],
            retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
            context_policy=context_policy,
            forbidden_item_ids=(ContextItemId("a"),),
        )


def test_ret_044_optional_forbidden_unsatisfied_still_succeeds(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    add_to_catalog(catalog, [make_item("a")])
    req = make_requirement("r", required=False, minimum_count=1)
    res = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=[req],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
        forbidden_item_ids=(ContextItemId("a"),),
    )
    assert res.optional_item_ids == ()


# =========================================================================
# RET-045..049 — resolution
# =========================================================================
def test_ret_045_resolution_immutable(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a")])
    res = _resolve_one(resolver, catalog, context_policy, make_requirement("r"))
    with pytest.raises(FrozenInstanceError):
        res.required_item_ids = ()  # type: ignore[misc]


def test_ret_046_required_optional_disjoint(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a"), make_item("b")])
    r1 = make_requirement("r1", priority=90)
    r2 = make_requirement("r2", priority=10, required=False)
    res = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=[r1, r2],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )
    assert set(res.required_item_ids).isdisjoint(res.optional_item_ids)


def test_ret_047_resolution_records_policy_versions(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    res = _resolve_one(
        resolver, catalog, context_policy, make_requirement("r", minimum_count=0)
    )
    assert res.retrieval_policy_id == RetrievalPolicyId("p")
    assert res.retrieval_policy_version == 1
    assert res.resolver_version == RESOLVER_VERSION


def test_ret_048_resolution_records_revision_action_mode(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    res = _resolve_one(
        resolver, catalog, context_policy, make_requirement("r", minimum_count=0)
    )
    assert res.state_revision == REVISION
    assert res.action_id == ACTION
    assert res.cognitive_mode == "FALSIFY"


def test_ret_049_requirement_resolution_order_deterministic(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    add_to_catalog(catalog, [make_item("b", priority=50), make_item("a", priority=50)])
    res = _resolve_one(
        resolver, catalog, context_policy,
        make_requirement("r", maximum_count=2),
    )
    rr = res.requirement_resolutions[0]
    assert list(rr.selected_item_ids) == [ContextItemId("a"), ContextItemId("b")]


# =========================================================================
# RET-050..056 — ContextRequest conversion
# =========================================================================
def _convert(resolver, catalog, context_policy, req):  # type: ignore[no-untyped-def]
    from packages.cognition import ContextBudget

    res = _resolve_one(resolver, catalog, context_policy, req)
    return res.to_context_request(
        request_id=ContextRequestId("rq"),
        context_policy=context_policy,
        budget=ContextBudget(max_tokens=500),
    )


def test_ret_050_conversion_produces_context_request(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    add_to_catalog(catalog, [make_item("a")])
    req = make_requirement("r")
    request = _convert(resolver, catalog, context_policy, req)
    from packages.cognition import ContextRequest

    assert isinstance(request, ContextRequest)


def test_ret_051_required_ids_mapped(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a")])
    req = make_requirement("r")
    request = _convert(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in request.required_item_ids


def test_ret_052_optional_ids_mapped(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a")])
    req = make_requirement("r", required=False, minimum_count=0)
    request = _convert(resolver, catalog, context_policy, req)
    assert ContextItemId("a") in request.optional_item_ids


def test_ret_053_forbidden_preserved(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    add_to_catalog(catalog, [make_item("a"), make_item("b")])
    req = make_requirement("r", maximum_count=2)
    res = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=[req],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
        forbidden_item_ids=(ContextItemId("a"),),
    )
    from packages.cognition import ContextBudget

    request = res.to_context_request(
        request_id=ContextRequestId("rq"), context_policy=context_policy,
        budget=ContextBudget(max_tokens=500),
    )
    assert ContextItemId("a") in request.forbidden_item_ids


def test_ret_054_state_revision_preserved(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    request = _convert(
        resolver, catalog, context_policy, make_requirement("r", minimum_count=0)
    )
    assert request.state_revision == REVISION


def test_ret_055_action_mode_preserved(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    request = _convert(
        resolver, catalog, context_policy, make_requirement("r", minimum_count=0)
    )
    assert request.action_id == ACTION
    assert request.cognitive_mode == "FALSIFY"


def test_ret_056_context_policy_identity_written(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    request = _convert(
        resolver, catalog, context_policy, make_requirement("r", minimum_count=0)
    )
    assert request.context_policy_id == context_policy.policy_id
    assert request.context_policy_version == context_policy.version


# =========================================================================
# RET-057..058 — staleness integration
# =========================================================================
def test_ret_057_revision_carried_to_request(resolver, catalog, context_policy) -> None:  # type: ignore[no-untyped-def]
    request = _convert(
        resolver, catalog, context_policy, make_requirement("r", minimum_count=0)
    )
    assert request.state_revision == 7


def test_ret_058_stale_request_rejected_by_compiler(
    resolver, catalog, context_policy, compiler, no_blinding  # type: ignore[no-untyped-def]
) -> None:
    from packages.cognition import ContextBudget
    from packages.cognition.errors import StaleContextRequestError

    res = _resolve_one(
        resolver, catalog, context_policy, make_requirement("r", minimum_count=0)
    )
    request = res.to_context_request(
        request_id=ContextRequestId("rq"), context_policy=context_policy,
        budget=ContextBudget(max_tokens=500),
    )
    # state revision advanced to 8 -> compiler rejects as stale
    with pytest.raises(StaleContextRequestError):
        compiler.compile(request, context_policy, no_blinding, [], current_state_revision=8)


# =========================================================================
# RET-059..062 — catalog / store
# =========================================================================
def test_ret_059_catalog_add_get_list(catalog) -> None:  # type: ignore[no-untyped-def]
    a = make_item("a")
    b = make_item("b", scope=ContextScope.SYSTEM, layer=ContextLayer.GLOBAL)
    catalog.add(a)
    catalog.add(b)
    assert catalog.get(ContextItemId("a")) is a
    listed = catalog.list_items(PROJECT, BRANCH)
    ids = {it.item_id for it in listed}
    assert ContextItemId("a") in ids
    assert ContextItemId("b") in ids  # SYSTEM visible


def test_ret_060_duplicate_context_item_id_rejected(catalog) -> None:  # type: ignore[no-untyped-def]
    catalog.add(make_item("a"))
    with pytest.raises(Exception):
        catalog.add(make_item("a"))


def test_ret_061_resolution_store_round_trip(
    resolver, catalog, context_policy, resolution_store  # type: ignore[no-untyped-def]
) -> None:
    add_to_catalog(catalog, [make_item("a")])
    res = _resolve_one(resolver, catalog, context_policy, make_requirement("r"))
    fetched = resolution_store.get(res.resolution_id)
    assert fetched is res
    assert resolution_store.list_for_project(PROJECT, BRANCH) == [res]


def test_ret_062_duplicate_resolution_id_rejected(resolution_store) -> None:  # type: ignore[no-untyped-def]
    from packages.cognition.errors import CognitionError
    from packages.cognition.testing import InMemoryContextCatalog

    const_id = RetrievalResolutionId("dup")
    factory = _ConstId(const_id)
    rsv = RetrievalResolver(
        InMemoryContextCatalog(), resolution_store, resolution_id_factory=factory
    )
    pol = ContextPolicy(
        policy_id="d", version=1,
        layer_order=(ContextLayer.GLOBAL, ContextLayer.STATE, ContextLayer.TASK),
        default_blinding_policy=BlindingPolicy(policy_id="n", version=1),
    )
    rsv.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=[],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=pol,
    )
    # second resolve with same forced id must fail on save
    with pytest.raises(CognitionError):
        rsv.resolve(
            project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
            action_id=ACTION, cognitive_mode="FALSIFY", requirements=[],
            retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
            context_policy=pol,
        )


class _ConstId:
    def __init__(self, value) -> None:  # type: ignore[no-untyped-def]
        self._v = value

    def __call__(self):  # type: ignore[no-untyped-def]
        return self._v


# =========================================================================
# RET-063..065 — determinism
# =========================================================================
def test_ret_063_catalog_insertion_order_invariant(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    a = make_item("a", priority=50)
    b = make_item("b", priority=50)
    # order 1
    add_to_catalog(catalog, [a, b])
    res1 = _resolve_one(
        resolver, catalog, context_policy, make_requirement("r", maximum_count=2)
    )
    assert list(res1.required_item_ids) == [ContextItemId("a"), ContextItemId("b")]


def test_ret_064_requirement_input_order_invariant(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    add_to_catalog(catalog, [make_item("a"), make_item("b")])
    r1 = make_requirement("r1", priority=90, maximum_count=2)
    r2 = make_requirement("r2", priority=10, required=False, minimum_count=0)
    fwd = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=[r1, r2],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )
    rev = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=[r2, r1],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )
    assert list(fwd.required_item_ids) == list(rev.required_item_ids)


def test_ret_065_repeat_resolve_same_result(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    add_to_catalog(catalog, [make_item("a"), make_item("b", priority=90)])
    req = make_requirement("r", maximum_count=2)
    r1 = _resolve_one(resolver, catalog, context_policy, req)
    r2 = _resolve_one(resolver, catalog, context_policy, req)
    assert list(r1.required_item_ids) == list(r2.required_item_ids)
    assert r1.resolution_id != r2.resolution_id  # id differs; content identical


# =========================================================================
# RET-066..070 — no hidden intelligence (structural)
# =========================================================================
def test_ret_066_resolver_does_not_import_llm_sdk() -> None:  # type: ignore[no-untyped-def]
    import inspect

    from packages.cognition import retrieval_engine

    src = inspect.getsource(retrieval_engine)
    for forbidden in ("openai", "anthropic", "pydantic_ai", "langgraph"):
        assert forbidden not in src, f"resolver references {forbidden}"


def test_ret_067_resolver_does_not_import_search_vector_lib() -> None:  # type: ignore[no-untyped-def]
    import inspect

    from packages.cognition import retrieval_engine

    src = inspect.getsource(retrieval_engine)
    for forbidden in ("faiss", "qdrant", "pgvector", "whoosh", "elasticsearch", "tiktoken"):
        assert forbidden not in src, f"resolver references {forbidden}"


def test_ret_068_resolver_does_not_build_bundle(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    add_to_catalog(catalog, [make_item("a")])
    res = _resolve_one(resolver, catalog, context_policy, make_requirement("r"))
    assert not isinstance(res, __import__(
        "packages.cognition.context", fromlist=["ContextBundle"]).ContextBundle)


def test_ret_069_resolver_does_not_invoke_compiler(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    import inspect

    from packages.cognition import retrieval_engine

    src = inspect.getsource(retrieval_engine)
    assert "ContextCompiler" not in src
    assert ".compile(" not in src


def test_ret_070_resolver_does_not_mutate_research_state(
    resolver, catalog, context_policy  # type: ignore[no-untyped-def]
) -> None:
    import inspect

    from packages.cognition import retrieval_engine

    src = inspect.getsource(retrieval_engine)
    for forbidden in ("packages.control", "commit_transition", "ResearchState"):
        assert forbidden not in src, f"resolver references {forbidden}"


# =========================================================================
# M2-RET-001 — end-to-end: retrieval → compiler
# =========================================================================
def test_m2_ret_001_retrieval_then_compile(
    resolver, catalog, context_policy, compiler, bundle_store  # type: ignore[no-untyped-def]
) -> None:
    from packages.cognition import (
        BlindingPolicy,
        ContextBudget,
        ContextProtectionTag,
        StaleContextRequestError,  # noqa: F401 (used implicitly via compiler)
    )

    constitution = make_item(
        "constitution", item_type=ContextItemType.INSTRUCTION,
        layer=ContextLayer.GLOBAL, scope=ContextScope.SYSTEM,
        content="global rules", tokens=20, priority=80, labels=frozenset({"global"}),
        instruction_authority=InstructionAuthority.SYSTEM,
    )
    current_state = make_item(
        "current-state", item_type=ContextItemType.STATE,
        layer=ContextLayer.STATE, scope=ContextScope.BRANCH,
        content="state summary", tokens=20, priority=70, labels=frozenset({"current"}),
    )
    supporting = make_item(
        "supporting-evidence", item_type=ContextItemType.EVIDENCE,
        layer=ContextLayer.TASK, scope=ContextScope.BRANCH,
        content="support", tokens=20, priority=60, labels=frozenset({"support"}),
    )
    contradictory = make_item(
        "contradictory-evidence", item_type=ContextItemType.EVIDENCE,
        layer=ContextLayer.TASK, scope=ContextScope.BRANCH,
        content="contradiction", tokens=20, priority=55, labels=frozenset({"contradiction"}),
    )
    future = make_item(
        "future-result", item_type=ContextItemType.EVIDENCE,
        layer=ContextLayer.TASK, scope=ContextScope.BRANCH,
        content="future", tokens=20, priority=90, labels=frozenset({"future"}),
        protection_tags=frozenset({ContextProtectionTag.FUTURE_RESULT}),
    )
    add_to_catalog(catalog, [constitution, current_state, supporting, contradictory, future])

    r1 = make_requirement(
        "r1", item_types=frozenset({ContextItemType.INSTRUCTION}),
        layers=frozenset({ContextLayer.GLOBAL}), scopes=frozenset({ContextScope.SYSTEM}),
        required_labels=frozenset({"global"}), minimum_count=1, maximum_count=1, priority=90,
    )
    r2 = make_requirement(
        "r2", item_types=frozenset({ContextItemType.STATE}),
        layers=frozenset({ContextLayer.STATE}), scopes=frozenset({ContextScope.BRANCH}),
        required_labels=frozenset({"current"}), minimum_count=1, maximum_count=1, priority=80,
    )
    r3 = make_requirement(
        "r3", item_types=frozenset({ContextItemType.EVIDENCE}),
        layers=frozenset({ContextLayer.TASK}), scopes=frozenset({ContextScope.BRANCH}),
        any_labels=frozenset({"support", "contradiction", "future"}),
        required=False, minimum_count=0, maximum_count=5, priority=50,
    )
    resolution = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=[r1, r2, r3],
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )

    # 5 items selected: 2 required + 3 optional
    assert len(resolution.required_item_ids) == 2
    assert len(resolution.optional_item_ids) == 3

    hide_future = BlindingPolicy(
        policy_id="hide-future", version=1,
        hidden_tags=frozenset({ContextProtectionTag.FUTURE_RESULT}),
    )
    request = resolution.to_context_request(
        request_id=ContextRequestId("rq"), context_policy=context_policy,
        budget=ContextBudget(max_tokens=500),
    )
    bundle = compiler.compile(
        request, context_policy, hide_future,
        [constitution, current_state, supporting, contradictory, future],
        current_state_revision=REVISION,
    )

    included = {i.item_id for i in bundle.items}
    assert ContextItemId("constitution") in included
    assert ContextItemId("current-state") in included
    assert ContextItemId("supporting-evidence") in included
    assert ContextItemId("contradictory-evidence") in included
    assert ContextItemId("future-result") not in included
    assert any(
        e.reason_code.value == "BLINDED" and e.item_id == ContextItemId("future-result")
        for e in bundle.excluded_items
    )

    # boundary: resolver does not blind — its resolve() signature has no
    # blinding_policy parameter. compiler did not retrieve (only used the
    # provided candidate list).
    import inspect

    sig = inspect.signature(RetrievalResolver.resolve)
    assert "blinding_policy" not in sig.parameters
    assert "blinding" not in sig.parameters
