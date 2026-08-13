"""Domain primitive sanity checks: identity typing, enum closedness,
StrEnum string values, snapshot immutability."""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from packages.domain.enums import ActorType, GateStatus, SideEffectLevel, TransitionDecision
from packages.domain.ids import ActionId, BranchId, EventId, ObjectId, ProjectId, RunId, TaskId
from packages.domain.models import ResearchStateSnapshot


def test_gate_status_has_exactly_the_four_values() -> None:
    assert {s.value for s in GateStatus} == {"PASS", "FAIL", "UNCERTAIN", "BLOCKED"}


def test_transition_decision_values() -> None:
    assert {s.value for s in TransitionDecision} == {"COMMIT", "REJECT", "WAIT"}


def test_actor_type_values() -> None:
    assert {s.value for s in ActorType} == {"USER", "AGENT", "SYSTEM"}


def test_side_effect_level_values() -> None:
    assert {s.value for s in SideEffectLevel} == {
        "NONE",
        "READ",
        "INTERNAL_WRITE",
        "COMPUTE",
        "EXTERNAL_WRITE",
    }


def test_strenum_compares_as_string() -> None:
    # StrEnum members ARE strings.
    assert GateStatus.PASS == "PASS"
    assert TransitionDecision.COMMIT == "COMMIT"


@pytest.mark.parametrize(
    "ctor",
    [ProjectId, BranchId, ObjectId, ActionId, EventId, TaskId, RunId],
)
def test_identity_types_are_constructible_strs(ctor) -> None:  # type: ignore[no-untyped-def]
    value = ctor("x")
    assert value == "x"
    assert isinstance(value, str)


def test_identity_types_are_distinct_at_the_type_level() -> None:
    # NewTypes are distinct for static checkers; at runtime they are str, but
    # the wrappers exist precisely so callers cannot pass a ProjectId where a
    # BranchId is expected. We assert the constructor identity is per-type.
    assert ProjectId is not BranchId
    assert ObjectId is not ActionId


def test_snapshot_is_immutable() -> None:
    snap = ResearchStateSnapshot(
        project_id=ProjectId("p"),
        branch_id=BranchId("b"),
        revision=0,
    )
    with pytest.raises(FrozenInstanceError):
        snap.revision = 1  # type: ignore[misc]
