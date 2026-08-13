"""CTRL-004..007 (gate aggregation), CTRL-012 (duplicate registration),
CTRL-013/014 (snapshot/event immutability)."""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from packages.control import (
    ActionRegistry,
    DuplicateActionError,
    GateResult,
    ResearchActionDefinition,
    aggregate_gates,
)
from packages.domain.enums import GateStatus, TransitionDecision
from packages.domain.events import DomainEvent
from packages.domain.ids import ActionId, BranchId, EventId, ObjectId, ProjectId

from .conftest import OBJECT_TYPE, STATE_DRAFT

PASS = GateStatus.PASS
FAIL = GateStatus.FAIL
UNCERTAIN = GateStatus.UNCERTAIN
BLOCKED = GateStatus.BLOCKED


def _g(status: GateStatus, gate_id: str = "g1") -> GateResult:
    return GateResult(gate_id=gate_id, status=status)


# CTRL-004 ----------------------------------------------------------------
def test_ctrl_004_all_pass_is_commit() -> None:
    decision = aggregate_gates([_g(PASS, "a"), _g(PASS, "b")])
    assert decision is TransitionDecision.COMMIT


# CTRL-005 ----------------------------------------------------------------
@pytest.mark.parametrize(
    "results",
    [
        ([_g(FAIL, "a"), _g(PASS, "b")]),
        ([_g(PASS, "a"), _g(FAIL, "b"), _g(BLOCKED, "c")]),
        ([_g(FAIL, "a"), _g(UNCERTAIN, "b")]),
    ],
)
def test_ctrl_005_any_fail_is_reject(results: list[GateResult]) -> None:
    assert aggregate_gates(results) is TransitionDecision.REJECT


# CTRL-006 ----------------------------------------------------------------
def test_ctrl_006_uncertain_without_fail_or_blocked_is_wait() -> None:
    decision = aggregate_gates([_g(PASS, "a"), _g(UNCERTAIN, "b")])
    assert decision is TransitionDecision.WAIT


# CTRL-007 ----------------------------------------------------------------
def test_ctrl_007_blocked_without_fail_is_wait() -> None:
    decision = aggregate_gates([_g(PASS, "a"), _g(BLOCKED, "b")])
    assert decision is TransitionDecision.WAIT


def test_zero_gates_is_commit() -> None:
    assert aggregate_gates([]) is TransitionDecision.COMMIT


def test_precedence_fail_beats_blocked_and_uncertain() -> None:
    decision = aggregate_gates([_g(FAIL, "a"), _g(BLOCKED, "b"), _g(UNCERTAIN, "c")])
    assert decision is TransitionDecision.REJECT


def test_precedence_blocked_beats_uncertain() -> None:
    decision = aggregate_gates([_g(BLOCKED, "a"), _g(UNCERTAIN, "b")])
    assert decision is TransitionDecision.WAIT


# CTRL-012 ----------------------------------------------------------------
def test_ctrl_012_duplicate_action_registration_fails(
    advance_definition: ResearchActionDefinition,
) -> None:
    registry = ActionRegistry()
    registry.register(advance_definition)

    duplicate = ResearchActionDefinition(
        action_type="TEST_ADVANCE",  # same action_type
        target_object_type=OBJECT_TYPE,
        allowed_source_states=frozenset({STATE_DRAFT}),
    )
    with pytest.raises(DuplicateActionError):
        registry.register(duplicate)


# CTRL-013 ----------------------------------------------------------------
def test_ctrl_013_snapshot_is_immutable(draft_snapshot) -> None:  # type: ignore[no-untyped-def]
    # frozen dataclass: attribute assignment must raise.
    with pytest.raises(FrozenInstanceError):
        draft_snapshot.revision = 99  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        draft_snapshot.object_states = {}  # type: ignore[misc]


# CTRL-014 ----------------------------------------------------------------
def test_ctrl_014_domain_event_is_immutable() -> None:
    from datetime import UTC, datetime

    from packages.domain.enums import ActorType

    event = DomainEvent(
        event_id=EventId("e-1"),
        project_id=ProjectId("p"),
        branch_id=BranchId("b"),
        event_type="OBJECT_STATE_CHANGED",
        aggregate_id=ObjectId("o"),
        previous_state="DRAFT",
        new_state="READY",
        previous_revision=0,
        new_revision=1,
        action_id=ActionId("a"),
        actor_type=ActorType.SYSTEM,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    with pytest.raises(FrozenInstanceError):
        event.new_state = "COMPLETE"  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        event.new_revision = 5  # type: ignore[misc]
