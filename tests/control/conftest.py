"""Shared neutral fixtures for Control Kernel tests.

Uses domain-agnostic labels (object_type="test_object"; states
DRAFT/READY/COMPLETE) per STEP-002 §24 — NO research semantics here.
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime, timedelta

import pytest

from packages.control import (
    ActionRegistry,
    ApprovalManager,
    BranchManager,
    ResearchAction,
    ResearchActionDefinition,
    TaskManager,
    TransitionEngine,
)
from packages.control.controller import ResearchController
from packages.control.testing import (
    InMemoryApprovalStore,
    InMemoryBranchStore,
    InMemoryControlEventSink,
    InMemoryForkPointStore,
    InMemoryMergeStore,
    InMemoryPendingTransitionStore,
    InMemoryStateStore,
    InMemoryTaskStore,
)
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


class _SeqIdFactory:
    """Deterministic, incrementing id factory (event_id / proposal_id / ...)."""

    def __init__(self) -> None:
        self._counter = itertools.count(1)

    def __call__(self) -> str:
        return f"id-{next(self._counter)}"


class _Clock:
    """Monotonically-increasing tz-aware clock for deterministic timestamps."""

    def __init__(self) -> None:
        self._base = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
        self._ticks = itertools.count()

    def __call__(self) -> datetime:
        return self._base + timedelta(seconds=next(self._ticks))


@pytest.fixture
def fixed_now() -> datetime:
    """A fixed, timezone-aware timestamp for deterministic events."""
    return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def seq_id_factory() -> _SeqIdFactory:
    """Deterministic, incrementing id factory."""
    return _SeqIdFactory()


@pytest.fixture
def clock() -> _Clock:
    return _Clock()


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
def store() -> InMemoryStateStore:
    """Empty state store. The controller fixture initializes the main branch
    snapshot via create_main_branch (the formal port path); tests that need a
    bare store without a branch use this directly."""
    return InMemoryStateStore()


@pytest.fixture
def task_store() -> InMemoryTaskStore:
    return InMemoryTaskStore()


@pytest.fixture
def pending_store() -> InMemoryPendingTransitionStore:
    return InMemoryPendingTransitionStore()


@pytest.fixture
def approval_store() -> InMemoryApprovalStore:
    return InMemoryApprovalStore()


@pytest.fixture
def branch_store() -> InMemoryBranchStore:
    return InMemoryBranchStore()


@pytest.fixture
def fork_point_store() -> InMemoryForkPointStore:
    return InMemoryForkPointStore()


@pytest.fixture
def merge_store() -> InMemoryMergeStore:
    return InMemoryMergeStore()


@pytest.fixture
def event_sink() -> InMemoryControlEventSink:
    return InMemoryControlEventSink()


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
def approval_definition() -> ResearchActionDefinition:
    """DRAFT -> READY action that REQUIRES approval."""
    return ResearchActionDefinition(
        action_type="TEST_APPROVAL_ADVANCE",
        target_object_type=OBJECT_TYPE,
        allowed_source_states=frozenset({STATE_DRAFT}),
        required_gate_ids=frozenset(),
        side_effect_level=SideEffectLevel.EXTERNAL_WRITE,
        requires_approval=True,
    )


@pytest.fixture
def registry(
    advance_definition: ResearchActionDefinition,
    blocked_advance_definition: ResearchActionDefinition,
    approval_definition: ResearchActionDefinition,
) -> ActionRegistry:
    registry = ActionRegistry()
    registry.register(advance_definition)
    registry.register(blocked_advance_definition)
    registry.register(approval_definition)
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
def approval_action() -> ResearchAction:
    return ResearchAction(
        action_id=ActionId("act-2"),
        action_type="TEST_APPROVAL_ADVANCE",
        project_id=PROJECT,
        branch_id=BRANCH,
        target_object_id=OBJ,
        actor_type=ActorType.SYSTEM,
    )


@pytest.fixture
def controller(
    registry: ActionRegistry,
    store: InMemoryStateStore,
    task_store: InMemoryTaskStore,
    pending_store: InMemoryPendingTransitionStore,
    approval_store: InMemoryApprovalStore,
    branch_store: InMemoryBranchStore,
    fork_point_store: InMemoryForkPointStore,
    merge_store: InMemoryMergeStore,
    event_sink: InMemoryControlEventSink,
    draft_snapshot: ResearchStateSnapshot,
    seq_id_factory: _SeqIdFactory,
    clock: _Clock,
) -> ResearchController:
    """Fully-wired controller with in-memory adapters + deterministic id/time.

    Initializes a main branch (ACTIVE) with the draft snapshot, so ordinary
    STEP-002/003 transition tests run against an actionable branch."""
    engine = TransitionEngine(store)
    task_manager = TaskManager(
        task_store, event_sink, id_factory=seq_id_factory, now=clock
    )
    approval_manager = ApprovalManager(
        approval_store, event_sink, id_factory=seq_id_factory, now=clock
    )
    branch_manager = BranchManager(
        branch_store,
        fork_point_store,
        store,
        merge_store,
        task_store,
        event_sink,
        id_factory=seq_id_factory,
        now=clock,
    )
    controller = ResearchController(
        registry,
        engine,
        task_manager,
        approval_manager,
        branch_manager,
        pending_store=pending_store,
        task_store=task_store,
        approval_store=approval_store,
        branch_store=branch_store,
        event_sink=event_sink,
        proposal_id_factory=seq_id_factory,
        id_factory=seq_id_factory,
        now=clock,
    )
    # Establish the main branch + its initial state via the formal port path.
    controller.create_main_branch(
        project_id=PROJECT,
        branch_id=BRANCH,
        initial_snapshot=draft_snapshot,
    )
    return controller


@pytest.fixture
def ready_snapshot() -> ResearchStateSnapshot:
    """Snapshot with the object already in READY (revision 1)."""
    return ResearchStateSnapshot(
        project_id=PROJECT,
        branch_id=BRANCH,
        revision=1,
        object_states={OBJ: STATE_READY},
    )
