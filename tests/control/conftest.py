"""Shared neutral fixtures for Control Kernel tests.

Uses domain-agnostic labels (object_type="test_object"; states
DRAFT/READY/COMPLETE) per STEP-002 §24 — NO research semantics here.
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime

import pytest

from packages.control import (
    ActionRegistry,
    ResearchAction,
    ResearchActionDefinition,
    TransitionEngine,
)
from packages.control.controller import ResearchController
from packages.control.testing import InMemoryStateStore
from packages.domain.enums import ActorType, SideEffectLevel
from packages.domain.ids import ActionId, BranchId, ObjectId, ProjectId
from packages.domain.models import ResearchStateSnapshot

# --- Neutral test constants --------------------------------------------
PROJECT = ProjectId("proj-test")
BRANCH = BranchId("main")
OBJ = ObjectId("obj-1")
OBJECT_TYPE = "test_object"

STATE_DRAFT = "DRAFT"
STATE_READY = "READY"
STATE_COMPLETE = "COMPLETE"


@pytest.fixture
def fixed_now() -> datetime:
    """A fixed, timezone-aware timestamp for deterministic events."""
    return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def seq_id_factory() -> _SeqIdFactory:
    """Deterministic, incrementing id factory (event_id / proposal_id)."""
    return _SeqIdFactory()


class _SeqIdFactory:
    def __init__(self) -> None:
        self._counter = itertools.count(1)

    def __call__(self) -> str:
        return f"id-{next(self._counter)}"


@pytest.fixture
def draft_snapshot() -> ResearchStateSnapshot:
    """A branch snapshot with one object in DRAFT at revision 0."""
    return ResearchStateSnapshot(
        project_id=PROJECT,
        branch_id=BRANCH,
        revision=0,
        object_states={OBJ: STATE_DRAFT},
    )


@pytest.fixture
def store(draft_snapshot: ResearchStateSnapshot) -> InMemoryStateStore:
    store = InMemoryStateStore()
    store.seed_snapshot(draft_snapshot)
    return store


@pytest.fixture
def advance_definition() -> ResearchActionDefinition:
    """DRAFT -> READY action definition (no required gates, no approval)."""
    return ResearchActionDefinition(
        action_type="TEST_ADVANCE",
        target_object_type=OBJECT_TYPE,
        allowed_source_states=frozenset({STATE_DRAFT}),
        required_gate_ids=frozenset(),
        side_effect_level=SideEffectLevel.INTERNAL_WRITE,
        requires_approval=False,
    )


@pytest.fixture
def blocked_advance_definition() -> ResearchActionDefinition:
    """READY -> COMPLETE definition, used to prove source-state filtering."""
    return ResearchActionDefinition(
        action_type="TEST_BLOCKED_ADVANCE",
        target_object_type=OBJECT_TYPE,
        allowed_source_states=frozenset({STATE_READY}),
    )


@pytest.fixture
def registry(
    advance_definition: ResearchActionDefinition,
    blocked_advance_definition: ResearchActionDefinition,
) -> ActionRegistry:
    registry = ActionRegistry()
    registry.register(advance_definition)
    registry.register(blocked_advance_definition)
    return registry


@pytest.fixture
def advance_action() -> ResearchAction:
    return ResearchAction(
        action_id=ActionId("act-1"),
        action_type="TEST_ADVANCE",
        project_id=PROJECT,
        branch_id=BRANCH,
        target_object_id=OBJ,
        actor_type=ActorType.SYSTEM,
    )


@pytest.fixture
def controller(
    registry: ActionRegistry,
    store: InMemoryStateStore,
    seq_id_factory: _SeqIdFactory,
) -> ResearchController:
    engine = TransitionEngine(store)
    return ResearchController(registry, engine, proposal_id_factory=seq_id_factory)


@pytest.fixture
def ready_snapshot() -> ResearchStateSnapshot:
    """Snapshot with the object already in READY (revision 1)."""
    return ResearchStateSnapshot(
        project_id=PROJECT,
        branch_id=BRANCH,
        revision=1,
        object_states={OBJ: STATE_READY},
    )
