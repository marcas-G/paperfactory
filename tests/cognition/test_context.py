"""CTX-001..061 + M2-CTX-001 — cognitive context kernel.

Verifies the four acceptance focuses: explicit inclusion, real scope
isolation, hard blinding, revision-bound auditable bundles.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from packages.cognition import (
    BlindingPolicy,
    CognitiveMode,
    ContextItem,
    ContextItemType,
    ContextLayer,
    ContextPolicy,
    ContextProtectionTag,
    ContextScope,
    is_bundle_current,
    is_request_current,
)
from packages.cognition.compiler import ContextCompiler
from packages.cognition.errors import (
    ContextBudgetExceededError,
    DuplicateContextItemError,
    InvalidContextItemError,
    InvalidContextRequestError,
    RequiredContextBlindedError,
    RequiredContextMissingError,
    RequiredContextScopeError,
    StaleContextRequestError,
)
from packages.cognition.policies import COMPILER_VERSION
from packages.domain.ids import ContextItemId, ProjectId

from .conftest import (
    ACTION,
    BRANCH,
    PROJECT,
    REVISION,
    make_item,
    make_request,
    make_source,
)


# =========================================================================
# CTX-001..009 — CognitiveMode / contracts
# =========================================================================
def test_ctx_001_cognitive_mode_has_ten_values() -> None:
    assert {m.value for m in CognitiveMode} == {
        "FRAME", "EXPLORE", "MAP", "COMPARE", "FALSIFY", "DIAGNOSE",
        "DISCRIMINATE", "VERIFY", "SYNTHESIZE", "DECIDE",
    }


def test_ctx_002_legal_scope_combinations() -> None:
    make_item("sys", scope=ContextScope.SYSTEM, layer=ContextLayer.GLOBAL)
    make_item("proj", scope=ContextScope.PROJECT, layer=ContextLayer.STATE)
    make_item("br", scope=ContextScope.BRANCH, layer=ContextLayer.TASK)


def test_ctx_003_system_with_project_rejected() -> None:
    with pytest.raises(InvalidContextItemError):
        ContextItem(
            item_id=ContextItemId("x"),
            layer=ContextLayer.GLOBAL,
            scope=ContextScope.SYSTEM,
            source_ref=make_source(),
            content="c",
            estimated_tokens=5,
            priority=10,
            item_type=ContextItemType.NOTE,
            project_id=PROJECT,
        )


def test_ctx_004_project_with_branch_rejected() -> None:
    with pytest.raises(InvalidContextItemError):
        ContextItem(
            item_id=ContextItemId("x"),
            layer=ContextLayer.STATE,
            scope=ContextScope.PROJECT,
            source_ref=make_source(),
            content="c",
            estimated_tokens=5,
            priority=10,
            item_type=ContextItemType.NOTE,
            project_id=PROJECT,
            branch_id=BRANCH,
        )


def test_ctx_005_branch_missing_project_or_branch_rejected() -> None:
    with pytest.raises(InvalidContextItemError):
        ContextItem(
            item_id=ContextItemId("x"),
            layer=ContextLayer.TASK,
            scope=ContextScope.BRANCH,
            source_ref=make_source(),
            content="c",
            estimated_tokens=5,
            priority=10,
            item_type=ContextItemType.NOTE,
            project_id=PROJECT,
            branch_id=None,
        )


def test_ctx_006_item_immutable() -> None:
    item = make_item("x")
    with pytest.raises(FrozenInstanceError):
        item.priority = 99  # type: ignore[misc]


def test_ctx_007_priority_out_of_range_rejected() -> None:
    with pytest.raises(InvalidContextItemError):
        make_item("x", priority=101)
    with pytest.raises(InvalidContextItemError):
        make_item("x", priority=-1)


def test_ctx_008_tokens_must_be_positive() -> None:
    with pytest.raises(InvalidContextItemError):
        make_item("x", tokens=0)
    with pytest.raises(InvalidContextItemError):
        make_item("x", tokens=-3)


def test_ctx_009_empty_content_rejected() -> None:
    with pytest.raises(InvalidContextItemError):
        make_item("x", content="")
    with pytest.raises(InvalidContextItemError):
        make_item("x", content="   ")


# =========================================================================
# CTX-010..016 — request
# =========================================================================
def test_ctx_010_request_immutable() -> None:
    req = make_request()
    with pytest.raises(FrozenInstanceError):
        req.cognitive_mode = CognitiveMode.VERIFY  # type: ignore[misc]


def test_ctx_011_required_duplicate_rejected() -> None:
    with pytest.raises(InvalidContextRequestError):
        make_request(required=["a", "a"])


def test_ctx_012_optional_duplicate_rejected() -> None:
    with pytest.raises(InvalidContextRequestError):
        make_request(optional=["b", "b"])


def test_ctx_013_required_optional_overlap_rejected() -> None:
    with pytest.raises(InvalidContextRequestError):
        make_request(required=["a"], optional=["a"])


def test_ctx_014_required_forbidden_overlap_rejected() -> None:
    with pytest.raises(InvalidContextRequestError):
        make_request(required=["a"], forbidden=["a"])


def test_ctx_015_optional_forbidden_overlap_rejected() -> None:
    with pytest.raises(InvalidContextRequestError):
        make_request(optional=["a"], forbidden=["a"])


def test_ctx_016_stale_request_revision_rejected(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(state_revision=7)
    with pytest.raises(StaleContextRequestError):
        compiler.compile(req, context_policy, no_blinding, [], current_state_revision=8)


# =========================================================================
# CTX-017..023 — scope
# =========================================================================
def test_ctx_017_system_visible_to_branch_request(
    compiler, context_policy, no_blinding,
) -> None:
    sys_item = make_item("sys", scope=ContextScope.SYSTEM, layer=ContextLayer.GLOBAL)
    req = make_request(required=["sys"])
    bundle = compiler.compile(req, context_policy, no_blinding, [sys_item], REVISION)
    assert [i.item_id for i in bundle.items] == [ContextItemId("sys")]


def test_ctx_018_same_project_visible(
    compiler, context_policy, no_blinding,
) -> None:
    proj_item = make_item("proj", scope=ContextScope.PROJECT, layer=ContextLayer.STATE)
    req = make_request(required=["proj"])
    bundle = compiler.compile(req, context_policy, no_blinding, [proj_item], REVISION)
    assert ContextItemId("proj") in [i.item_id for i in bundle.items]


def test_ctx_019_different_project_required_scope_error(
    compiler, context_policy, no_blinding,
) -> None:
    other = ContextItem(
        item_id=ContextItemId("op"),
        layer=ContextLayer.STATE,
        scope=ContextScope.PROJECT,
        source_ref=make_source(),
        content="c",
        estimated_tokens=5,
        priority=10,
            item_type=ContextItemType.NOTE,
        project_id=ProjectId("OTHER"),
    )
    req = make_request(required=["op"])
    with pytest.raises(RequiredContextScopeError):
        compiler.compile(req, context_policy, no_blinding, [other], REVISION)


def test_ctx_020_different_project_optional_excluded(
    compiler, context_policy, no_blinding,
) -> None:
    other = ContextItem(
        item_id=ContextItemId("op"),
        layer=ContextLayer.STATE,
        scope=ContextScope.PROJECT,
        source_ref=make_source(),
        content="c",
        estimated_tokens=5,
        priority=10,
            item_type=ContextItemType.NOTE,
        project_id=ProjectId("OTHER"),
    )
    req = make_request(optional=["op"])
    bundle = compiler.compile(req, context_policy, no_blinding, [other], REVISION)
    assert bundle.items == ()
    assert bundle.excluded_items[0].reason_code.value == "PROJECT_SCOPE_MISMATCH"


def test_ctx_021_same_branch_visible(
    compiler, context_policy, no_blinding,
) -> None:
    br_item = make_item("br", scope=ContextScope.BRANCH, layer=ContextLayer.TASK)
    req = make_request(required=["br"])
    bundle = compiler.compile(req, context_policy, no_blinding, [br_item], REVISION)
    assert ContextItemId("br") in [i.item_id for i in bundle.items]


def test_ctx_022_different_branch_required_scope_error(
    compiler, context_policy, no_blinding,
) -> None:
    from packages.domain.ids import BranchId

    other = ContextItem(
        item_id=ContextItemId("ob"),
        layer=ContextLayer.TASK,
        scope=ContextScope.BRANCH,
        source_ref=make_source(),
        content="c",
        estimated_tokens=5,
        priority=10,
            item_type=ContextItemType.NOTE,
        project_id=PROJECT,
        branch_id=BranchId("B2"),
    )
    req = make_request(required=["ob"])
    with pytest.raises(RequiredContextScopeError):
        compiler.compile(req, context_policy, no_blinding, [other], REVISION)


def test_ctx_023_different_branch_optional_excluded(
    compiler, context_policy, no_blinding,
) -> None:
    from packages.domain.ids import BranchId

    other = ContextItem(
        item_id=ContextItemId("ob"),
        layer=ContextLayer.TASK,
        scope=ContextScope.BRANCH,
        source_ref=make_source(),
        content="c",
        estimated_tokens=5,
        priority=10,
            item_type=ContextItemType.NOTE,
        project_id=PROJECT,
        branch_id=BranchId("B2"),
    )
    req = make_request(optional=["ob"])
    bundle = compiler.compile(req, context_policy, no_blinding, [other], REVISION)
    assert bundle.excluded_items[0].reason_code.value == "BRANCH_SCOPE_MISMATCH"


# =========================================================================
# CTX-024..030 — blinding
# =========================================================================
def test_ctx_024_no_hidden_tag_included(
    compiler, context_policy, no_blinding,
) -> None:
    item = make_item("x")
    req = make_request(optional=["x"])
    bundle = compiler.compile(req, context_policy, no_blinding, [item], REVISION)
    assert ContextItemId("x") in [i.item_id for i in bundle.items]


def test_ctx_025_optional_future_result_blinded_excluded(
    compiler, context_policy, hide_future_result
) -> None:
    item = make_item("x", protection_tags=frozenset({ContextProtectionTag.FUTURE_RESULT}))
    req = make_request(optional=["x"])
    bundle = compiler.compile(req, context_policy, hide_future_result, [item], REVISION)
    assert bundle.items == ()
    assert bundle.excluded_items[0].reason_code.value == "BLINDED"


def test_ctx_026_required_future_result_blinded_raises(
    compiler, context_policy, hide_future_result
) -> None:
    item = make_item("x", protection_tags=frozenset({ContextProtectionTag.FUTURE_RESULT}))
    req = make_request(required=["x"])
    with pytest.raises(RequiredContextBlindedError):
        compiler.compile(req, context_policy, hide_future_result, [item], REVISION)


@pytest.mark.parametrize(
    "tag", [ContextProtectionTag.TEST_SET, ContextProtectionTag.CONFIRMATORY_RESULT,
            ContextProtectionTag.REVIEW_OUTCOME]
)
def test_ctx_027_029_tag_blinding(
    compiler, context_policy, tag
) -> None:
    policy = BlindingPolicy(policy_id="h", version=1, hidden_tags=frozenset({tag}))
    item = make_item("x", protection_tags=frozenset({tag}))
    req = make_request(optional=["x"])
    bundle = compiler.compile(req, context_policy, policy, [item], REVISION)
    assert bundle.excluded_items[0].reason_code.value == "BLINDED"


def test_ctx_030_empty_hidden_tags_no_blinding(compiler, context_policy) -> None:
    empty = BlindingPolicy(policy_id="e", version=1, hidden_tags=frozenset())
    item = make_item("x", protection_tags=frozenset({ContextProtectionTag.FUTURE_RESULT}))
    req = make_request(optional=["x"])
    bundle = compiler.compile(req, context_policy, empty, [item], REVISION)
    assert ContextItemId("x") in [i.item_id for i in bundle.items]


# =========================================================================
# CTX-031..035 — required context
# =========================================================================
def test_ctx_031_required_missing_raises(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(required=["absent"])
    with pytest.raises(RequiredContextMissingError):
        compiler.compile(req, context_policy, no_blinding, [], REVISION)


def test_ctx_032_multiple_required_all_included(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("a", layer=ContextLayer.GLOBAL, scope=ContextScope.SYSTEM)
    b = make_item("b", layer=ContextLayer.STATE, scope=ContextScope.PROJECT)
    req = make_request(required=["a", "b"])
    bundle = compiler.compile(req, context_policy, no_blinding, [a, b], REVISION)
    ids = {i.item_id for i in bundle.items}
    assert ids == {ContextItemId("a"), ContextItemId("b")}


def test_ctx_033_required_preferred_over_optional(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(required=["r"], optional=["o"], budget_tokens=15)
    r = make_item("r", tokens=10, priority=1)
    o = make_item("o", tokens=10, priority=100)  # high priority optional
    bundle = compiler.compile(req, context_policy, no_blinding, [r, o], REVISION)
    assert ContextItemId("r") in [i.item_id for i in bundle.items]
    assert ContextItemId("o") not in [i.item_id for i in bundle.items]  # no room


def test_ctx_034_required_exceeds_budget_raises(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(required=["r"], budget_tokens=5)
    r = make_item("r", tokens=10)
    with pytest.raises(ContextBudgetExceededError):
        compiler.compile(req, context_policy, no_blinding, [r], REVISION)


def test_ctx_035_required_never_removed_for_optional(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(required=["r"], optional=["o"], budget_tokens=12)
    r = make_item("r", tokens=10, priority=1)
    o = make_item("o", tokens=10, priority=100)
    bundle = compiler.compile(req, context_policy, no_blinding, [r, o], REVISION)
    assert ContextItemId("r") in [i.item_id for i in bundle.items]


# =========================================================================
# CTX-036..040 — optional budget
# =========================================================================
def test_ctx_036_optional_within_budget_included(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(optional=["o"], budget_tokens=100)
    o = make_item("o", tokens=10)
    bundle = compiler.compile(req, context_policy, no_blinding, [o], REVISION)
    assert ContextItemId("o") in [i.item_id for i in bundle.items]


def test_ctx_037_optional_over_budget_excluded(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(optional=["o"], budget_tokens=5)
    o = make_item("o", tokens=10)
    bundle = compiler.compile(req, context_policy, no_blinding, [o], REVISION)
    assert bundle.excluded_items[0].reason_code.value == "BUDGET_EXCEEDED"


def test_ctx_038_large_optional_does_not_block_smaller(
    compiler, context_policy, no_blinding,
) -> None:
    # budget=12; big optional=15 priority-high (does NOT fit); small=5 priority-low (fits)
    # Proves a too-large optional does not block a later, smaller one.
    req = make_request(optional=["big", "small"], budget_tokens=12)
    big = make_item("big", tokens=15, priority=90)
    small = make_item("small", tokens=5, priority=10)
    bundle = compiler.compile(req, context_policy, no_blinding, [big, small], REVISION)
    ids = [i.item_id for i in bundle.items]
    assert ContextItemId("big") not in ids  # too large
    assert ContextItemId("small") in ids  # smaller still fits


def test_ctx_038b_small_optional_after_skipped_large(
    compiler, context_policy, no_blinding,
) -> None:
    # required fills most budget; big optional can't fit but small can
    req = make_request(required=["r"], optional=["big", "small"], budget_tokens=18)
    r = make_item("r", tokens=10, priority=1, layer=ContextLayer.GLOBAL, scope=ContextScope.SYSTEM)
    big = make_item("big", tokens=15, priority=90)
    small = make_item("small", tokens=5, priority=10)
    bundle = compiler.compile(req, context_policy, no_blinding, [r, big, small], REVISION)
    ids = [i.item_id for i in bundle.items]
    # remaining budget after required = 8; big(15) skipped, small(5) fits
    assert ContextItemId("r") in ids
    assert ContextItemId("big") not in ids
    assert ContextItemId("small") in ids


def test_ctx_039_total_within_budget(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(required=["a"], optional=["b", "c"], budget_tokens=30)
    a = make_item("a", tokens=10, priority=1, layer=ContextLayer.GLOBAL, scope=ContextScope.SYSTEM)
    b = make_item("b", tokens=10, priority=50)
    c = make_item("c", tokens=5, priority=40)
    bundle = compiler.compile(req, context_policy, no_blinding, [a, b, c], REVISION)
    assert bundle.total_estimated_tokens <= req.budget.max_tokens


def test_ctx_040_bundle_total_equals_item_sum(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(required=["a"], optional=["b"], budget_tokens=100)
    a = make_item("a", tokens=10, priority=1, layer=ContextLayer.GLOBAL, scope=ContextScope.SYSTEM)
    b = make_item("b", tokens=7, priority=50)
    bundle = compiler.compile(req, context_policy, no_blinding, [a, b], REVISION)
    assert bundle.total_estimated_tokens == sum(i.estimated_tokens for i in bundle.items)


# =========================================================================
# CTX-041..045 — ordering
# =========================================================================
def test_ctx_041_layer_order(compiler, no_blinding) -> None:
    policy = ContextPolicy(
        policy_id="rev", version=1,
        layer_order=(ContextLayer.TASK, ContextLayer.STATE, ContextLayer.GLOBAL),
        default_blinding_policy=no_blinding,
    )
    g = make_item("g", layer=ContextLayer.GLOBAL, scope=ContextScope.SYSTEM, priority=99)
    s = make_item("s", layer=ContextLayer.STATE, scope=ContextScope.PROJECT, priority=1)
    t = make_item("t", layer=ContextLayer.TASK, priority=1)
    req = make_request(optional=["g", "s", "t"], budget_tokens=1000)
    bundle = _compile_fresh(policy, no_blinding, req, [g, s, t])
    assert [i.item_id for i in bundle.items] == [
        ContextItemId("t"), ContextItemId("s"), ContextItemId("g"),
    ]


def _compile_fresh(policy, blinding, req, candidates):
    from packages.cognition.testing import InMemoryContextBundleStore

    c = ContextCompiler(InMemoryContextBundleStore())
    return c.compile(req, policy, blinding, candidates, REVISION)


def test_ctx_042_priority_descending_within_layer(
    compiler, context_policy, no_blinding,
) -> None:
    low = make_item("low", priority=10)
    high = make_item("high", priority=90)
    req = make_request(optional=["low", "high"], budget_tokens=1000)
    bundle = compiler.compile(req, context_policy, no_blinding, [low, high], REVISION)
    assert [i.item_id for i in bundle.items] == [ContextItemId("high"), ContextItemId("low")]


def test_ctx_043_item_id_lexical_within_layer_priority(
    compiler, context_policy, no_blinding,
) -> None:
    z = make_item("z", priority=50)
    a = make_item("a", priority=50)
    req = make_request(optional=["z", "a"], budget_tokens=1000)
    bundle = compiler.compile(req, context_policy, no_blinding, [z, a], REVISION)
    assert [i.item_id for i in bundle.items] == [ContextItemId("a"), ContextItemId("z")]


def test_ctx_044_input_order_does_not_change_bundle(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("a", priority=50)
    b = make_item("b", priority=90)
    req = make_request(optional=["a", "b"], budget_tokens=1000)
    b1 = compiler.compile(req, context_policy, no_blinding, [a, b], REVISION)
    b2 = compiler.compile(req, context_policy, no_blinding, [b, a], REVISION)
    assert [i.item_id for i in b1.items] == [i.item_id for i in b2.items]


def test_ctx_045_repeat_compile_same_content(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("a", priority=50)
    req = make_request(optional=["a"], budget_tokens=1000)
    b1 = compiler.compile(req, context_policy, no_blinding, [a], REVISION)
    b2 = compiler.compile(req, context_policy, no_blinding, [a], REVISION)
    assert [i.item_id for i in b1.items] == [i.item_id for i in b2.items]
    assert b1.total_estimated_tokens == b2.total_estimated_tokens
    # bundle_id differs (factory), but content identical
    assert b1.bundle_id != b2.bundle_id


# =========================================================================
# CTX-046..048 — duplicate / missing
# =========================================================================
def test_ctx_046_duplicate_candidate_rejected(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("dup")
    req = make_request(optional=["dup"])
    with pytest.raises(DuplicateContextItemError):
        compiler.compile(req, context_policy, no_blinding, [a, a], REVISION)


def test_ctx_047_missing_optional_succeeds(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(optional=["absent"])
    bundle = compiler.compile(req, context_policy, no_blinding, [], REVISION)
    assert bundle.items == ()


def test_ctx_048_missing_optional_recorded(
    compiler, context_policy, no_blinding,
) -> None:
    req = make_request(optional=["absent"])
    bundle = compiler.compile(req, context_policy, no_blinding, [], REVISION)
    assert bundle.excluded_items[0].reason_code.value == "MISSING_OPTIONAL_ITEM"
    assert bundle.excluded_items[0].item_id == ContextItemId("absent")


# =========================================================================
# CTX-049..054 — bundle
# =========================================================================
def test_ctx_049_bundle_immutable(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("a")
    req = make_request(required=["a"])
    bundle = compiler.compile(req, context_policy, no_blinding, [a], REVISION)
    with pytest.raises(FrozenInstanceError):
        bundle.total_estimated_tokens = 999  # type: ignore[misc]


def test_ctx_050_bundle_records_metadata(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("a")
    req = make_request(required=["a"])
    bundle = compiler.compile(req, context_policy, no_blinding, [a], REVISION)
    assert bundle.request_id == req.request_id
    assert bundle.project_id == PROJECT
    assert bundle.branch_id == BRANCH
    assert bundle.state_revision == REVISION
    assert bundle.action_id == ACTION
    assert bundle.cognitive_mode == "FALSIFY"
    assert bundle.context_policy_id == context_policy.policy_id
    assert bundle.context_policy_version == context_policy.version
    assert bundle.compiler_version == COMPILER_VERSION


def test_ctx_051_source_provenance(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("a", source=make_source("H3", "4"))
    req = make_request(required=["a"])
    bundle = compiler.compile(req, context_policy, no_blinding, [a], REVISION)
    assert bundle.source_refs == (make_source("H3", "4"),)


def test_ctx_052_bundle_has_no_flattened_prompt_field(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("a")
    req = make_request(required=["a"])
    bundle = compiler.compile(req, context_policy, no_blinding, [a], REVISION)
    assert not hasattr(bundle, "compiled_prompt")
    assert not hasattr(bundle, "context_text")
    assert not hasattr(bundle, "prompt")
    assert isinstance(bundle.items, tuple)


def test_ctx_053_store_round_trip(compiler, bundle_store, context_policy, no_blinding) -> None:
    a = make_item("a")
    req = make_request(required=["a"])
    bundle = compiler.compile(req, context_policy, no_blinding, [a], REVISION)
    fetched = bundle_store.get(bundle.bundle_id)
    assert fetched is bundle
    assert bundle_store.list_for_project(PROJECT, BRANCH) == [bundle]


def test_ctx_054_duplicate_bundle_id_rejected(bundle_store) -> None:
    a = make_item("a")
    req = make_request(required=["a"])
    c1 = ContextCompiler(bundle_store)
    bundle = c1.compile(req, _default_policy(), _no_blinding(), [a], REVISION)
    # saving the same bundle id again must fail
    from packages.cognition.errors import CognitionError

    with pytest.raises(CognitionError):
        bundle_store.save(bundle)


def _default_policy() -> ContextPolicy:
    return ContextPolicy(
        policy_id="default", version=1,
        layer_order=(ContextLayer.GLOBAL, ContextLayer.STATE, ContextLayer.TASK),
        default_blinding_policy=BlindingPolicy(policy_id="none", version=1),
    )


def _no_blinding() -> BlindingPolicy:
    return BlindingPolicy(policy_id="none", version=1)


# =========================================================================
# CTX-055..057 — staleness
# =========================================================================
def test_ctx_055_bundle_current_when_revision_matches(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("a")
    req = make_request(required=["a"])
    bundle = compiler.compile(req, context_policy, no_blinding, [a], REVISION)
    assert is_bundle_current(bundle, REVISION) is True


def test_ctx_056_bundle_stale_after_revision_change(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("a")
    req = make_request(required=["a"])
    bundle = compiler.compile(req, context_policy, no_blinding, [a], REVISION)
    assert is_bundle_current(bundle, REVISION + 1) is False


def test_ctx_057_stale_bundle_not_modified(
    compiler, context_policy, no_blinding,
) -> None:
    a = make_item("a")
    req = make_request(required=["a"])
    bundle = compiler.compile(req, context_policy, no_blinding, [a], REVISION)
    original_rev = bundle.state_revision
    is_bundle_current(bundle, REVISION + 1)
    assert bundle.state_revision == original_rev


def test_request_current_helper() -> None:
    req = make_request(state_revision=7)
    assert is_request_current(req, 7) is True
    assert is_request_current(req, 8) is False


# =========================================================================
# CTX-058..061 — no side effects (structural)
# =========================================================================
def test_ctx_058_compiler_has_no_state_mutation_attr() -> None:
    # The compiler must not reference control/runtime/capability types.
    import inspect

    from packages.cognition.compiler import ContextCompiler

    src = inspect.getsource(ContextCompiler)
    for forbidden in ("packages.control", "packages.runtime", "packages.capabilities",
                      "ResearchTask", "ApprovalRequest"):
        assert forbidden not in src, f"compiler references {forbidden}"
        assert forbidden not in src, f"compiler references {forbidden}"


def test_ctx_059_061_compiler_creates_no_task_approval_llm() -> None:
    # Structural: the cognition package must not import control/runtime/llm sdks.
    import packages.cognition as cog

    for forbidden in (
        "create_task", "ApprovalRequest", "openai", "anthropic", "pydantic_ai",
    ):
        assert not hasattr(cog, forbidden)


# =========================================================================
# M2-CTX-001 — minimal end-to-end
# =========================================================================
def test_m2_ctx_001_end_to_end(compiler, bundle_store, context_policy, hide_future_result) -> None:
    constitution = make_item(
        "constitution", layer=ContextLayer.GLOBAL, scope=ContextScope.SYSTEM,
        content="global rules", tokens=20, priority=80,
    )
    current_state = make_item(
        "current-state", layer=ContextLayer.STATE, scope=ContextScope.PROJECT,
        content="state summary", tokens=20, priority=70,
    )
    evidence_a = make_item("ev-a", tokens=20, priority=60, content="evidence A")
    future = make_item(
        "future", tokens=20, priority=90, content="future result",
        protection_tags=frozenset({ContextProtectionTag.FUTURE_RESULT}),
    )
    evidence_b = make_item("ev-b", tokens=20, priority=50, content="evidence B")

    req = make_request(
        required=["constitution", "current-state"],
        optional=["ev-a", "future", "ev-b"],
        budget_tokens=200,
        cognitive_mode=CognitiveMode.FALSIFY,
        state_revision=7,
    )
    bundle = compiler.compile(
        req, context_policy, hide_future_result,
        [constitution, current_state, evidence_a, future, evidence_b],
        current_state_revision=7,
    )

    included_ids = [i.item_id for i in bundle.items]
    assert ContextItemId("constitution") in included_ids
    assert ContextItemId("current-state") in included_ids
    assert ContextItemId("ev-a") in included_ids
    assert ContextItemId("ev-b") in included_ids
    assert ContextItemId("future") not in included_ids

    excluded_reasons = [e.reason_code.value for e in bundle.excluded_items]
    assert "BLINDED" in excluded_reasons

    # future content must not appear anywhere in included items
    assert all("future result" not in i.content for i in bundle.items)

    assert bundle.state_revision == 7
    assert bundle.cognitive_mode == "FALSIFY"
    assert len(bundle.source_refs) == len(bundle.items)
    assert bundle.total_estimated_tokens == sum(i.estimated_tokens for i in bundle.items)
    assert bundle.total_estimated_tokens <= req.budget.max_tokens

    # bundle immutable, no prompt field
    with pytest.raises(FrozenInstanceError):
        bundle.items = ()  # type: ignore[misc]
    assert not hasattr(bundle, "compiled_prompt")

    # stored
    assert bundle_store.get(bundle.bundle_id) is bundle
