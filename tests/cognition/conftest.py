"""Shared fixtures for cognitive context kernel tests.

Neutral: project=P1, branch=B1, default state revision=7. ContextItem
helpers keep construction terse. No research semantics.
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime

import pytest

from packages.cognition import (
    BlindingPolicy,
    CognitiveMode,
    ContextBudget,
    ContextCompiler,
    ContextItem,
    ContextLayer,
    ContextPolicy,
    ContextProtectionTag,
    ContextRequest,
    ContextScope,
    ContextSourceRef,
)
from packages.cognition.testing import InMemoryContextBundleStore
from packages.domain.ids import (
    ActionId,
    BranchId,
    ContextBundleId,
    ContextItemId,
    ContextRequestId,
    ProjectId,
)

PROJECT = ProjectId("P1")
BRANCH = BranchId("B1")
REVISION = 7
ACTION = ActionId("A1")


class _SeqBundleId:
    def __init__(self) -> None:
        self._n = itertools.count(1)

    def __call__(self) -> ContextBundleId:
        return ContextBundleId(f"bundle-{next(self._n)}")


@pytest.fixture
def bundle_id_factory() -> _SeqBundleId:
    return _SeqBundleId()


@pytest.fixture
def fixed_now() -> datetime:
    return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def bundle_store() -> InMemoryContextBundleStore:
    return InMemoryContextBundleStore()


@pytest.fixture
def compiler(
    bundle_store: InMemoryContextBundleStore,
    bundle_id_factory: _SeqBundleId,
    fixed_now: datetime,
) -> ContextCompiler:
    return ContextCompiler(
        bundle_store,
        bundle_id_factory=bundle_id_factory,
        now=lambda: fixed_now,
    )


@pytest.fixture
def no_blinding() -> BlindingPolicy:
    return BlindingPolicy(policy_id="none", version=1, hidden_tags=frozenset())


@pytest.fixture
def hide_future_result() -> BlindingPolicy:
    return BlindingPolicy(
        policy_id="hide-future",
        version=1,
        hidden_tags=frozenset({ContextProtectionTag.FUTURE_RESULT}),
    )


@pytest.fixture
def context_policy() -> ContextPolicy:
    return ContextPolicy(
        policy_id="default",
        version=1,
        layer_order=(ContextLayer.GLOBAL, ContextLayer.STATE, ContextLayer.TASK),
        default_blinding_policy=BlindingPolicy(
            policy_id="none", version=1, hidden_tags=frozenset()
        ),
    )


# --- item / request builders -------------------------------------------
def make_source(source_id: str = "s1", version: str = "v1") -> ContextSourceRef:
    return ContextSourceRef(source_type="research_object", source_id=source_id, version=version)


def make_item(
    item_id: str,
    *,
    layer: ContextLayer = ContextLayer.TASK,
    scope: ContextScope = ContextScope.BRANCH,
    content: str = "some content",
    tokens: int = 10,
    priority: int = 50,
    project_id=PROJECT,  # type: ignore[valid-type]
    branch_id=BRANCH,  # type: ignore[valid-type]
    protection_tags: frozenset[ContextProtectionTag] = frozenset(),
    source: ContextSourceRef | None = None,
) -> ContextItem:
    pid = project_id
    bid = branch_id
    if scope is ContextScope.SYSTEM:
        pid = None
        bid = None
    elif scope is ContextScope.PROJECT:
        bid = None
    return ContextItem(
        item_id=ContextItemId(item_id),
        layer=layer,
        scope=scope,
        source_ref=source or make_source(item_id),
        content=content,
        estimated_tokens=tokens,
        priority=priority,
        project_id=pid,
        branch_id=bid,
        protection_tags=protection_tags,
    )


def make_request(
    *,
    required=(),
    optional=(),
    forbidden=(),
    budget_tokens: int = 1000,
    cognitive_mode: str = CognitiveMode.FALSIFY,
    state_revision: int = REVISION,
    project_id=PROJECT,  # type: ignore[valid-type]
    branch_id=BRANCH,  # type: ignore[valid-type]
) -> ContextRequest:
    return ContextRequest(
        request_id=ContextRequestId("req-1"),
        project_id=project_id,
        branch_id=branch_id,
        state_revision=state_revision,
        action_id=ACTION,
        cognitive_mode=cognitive_mode,
        required_item_ids=tuple(ContextItemId(i) for i in required),
        optional_item_ids=tuple(ContextItemId(i) for i in optional),
        forbidden_item_ids=tuple(ContextItemId(i) for i in forbidden),
        budget=ContextBudget(max_tokens=budget_tokens),
        created_at=datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
    )
