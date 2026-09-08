"""STEP-016 — Action Candidate Enumeration tests.

CAND-001..008: deterministic enumeration from state × registry.
"""

from __future__ import annotations

import itertools

from packages.control import (
    ActionCandidateEnumerator,
    ActionRegistry,
    ResearchActionDefinition,
)
from packages.control.policy import ActionPrioritySignals
from packages.control.registry import ActionRegistry as _Registry
from packages.control.testing import StaticSignalProvider
from packages.domain.enums import SideEffectLevel
from packages.domain.ids import ObjectId
from packages.domain.models import ResearchStateSnapshot

from .conftest import BRANCH, OBJECT_TYPE, PROJECT

STATE_DRAFT = "DRAFT"
STATE_READY = "READY"
STATE_DONE = "DONE"


def _signals() -> ActionPrioritySignals:
    return ActionPrioritySignals(
        information_gain=0.5,
        blocker_resolution=0.5,
        scientific_value=0.5,
        urgency=0.5,
        cost=0.1,
        risk=0.1,
    )


def _definition(action_type: str, sources: frozenset[str]) -> ResearchActionDefinition:
    return ResearchActionDefinition(
        action_type=action_type,
        target_object_type=OBJECT_TYPE,
        allowed_source_states=sources,
        required_gate_ids=frozenset(),
        side_effect_level=SideEffectLevel.INTERNAL_WRITE,
        requires_approval=False,
    )


def _enumerator(registry: ActionRegistry, signals: ActionPrioritySignals | None = None):
    counter = itertools.count(1)
    return ActionCandidateEnumerator(
        registry,
        StaticSignalProvider(signals or _signals()),
        action_id_factory=lambda: f"act-{next(counter)}",
    )


def _snapshot(objects: dict[str, str]) -> ResearchStateSnapshot:
    return ResearchStateSnapshot(
        project_id=PROJECT,
        branch_id=BRANCH,
        revision=0,
        object_states={ObjectId(k): v for k, v in objects.items()},
    )


# =========================================================================
# CAND-001..008
# =========================================================================
def test_cand_001_enumerates_legal_pairs() -> None:
    registry = _Registry()
    registry.register(_definition("ADVANCE", frozenset({STATE_DRAFT})))
    enum = _enumerator(registry)
    state = _snapshot({"o-1": STATE_DRAFT})
    cands = enum.enumerate(state, branch_actionable=True)
    assert len(cands) == 1
    assert cands[0].action.action_type == "ADVANCE"
    assert cands[0].action.target_object_id == ObjectId("o-1")
    assert cands[0].definition is not None
    assert cands[0].definition.action_type == "ADVANCE"


def test_cand_002_source_state_filters() -> None:
    registry = _Registry()
    registry.register(_definition("ADVANCE", frozenset({STATE_DRAFT})))
    enum = _enumerator(registry)
    state = _snapshot({"o-1": STATE_DONE})  # not a legal source
    assert enum.enumerate(state, branch_actionable=True) == ()


def test_cand_003_multiple_objects_and_definitions() -> None:
    registry = _Registry()
    registry.register(_definition("ADVANCE", frozenset({STATE_DRAFT})))
    registry.register(_definition("REVIEW", frozenset({STATE_DRAFT, STATE_READY})))
    enum = _enumerator(registry)
    state = _snapshot({"o-2": STATE_DRAFT, "o-1": STATE_READY})
    cands = enum.enumerate(state, branch_actionable=True)
    # o-1: REVIEW only; o-2: ADVANCE + REVIEW => 3 total
    assert len(cands) == 3
    pairs = {(str(c.action.target_object_id), c.action.action_type) for c in cands}
    assert pairs == {("o-1", "REVIEW"), ("o-2", "ADVANCE"), ("o-2", "REVIEW")}


def test_cand_004_deterministic_order() -> None:
    registry = _Registry()
    registry.register(_definition("ADVANCE", frozenset({STATE_DRAFT})))
    registry.register(_definition("REVIEW", frozenset({STATE_DRAFT})))
    enum = _enumerator(registry)
    state = _snapshot({"o-b": STATE_DRAFT, "o-a": STATE_DRAFT})
    cands1 = enum.enumerate(state, branch_actionable=True)
    counter2 = itertools.count(1)
    enum2 = ActionCandidateEnumerator(
        registry,
        StaticSignalProvider(_signals()),
        action_id_factory=lambda: f"act-{next(counter2)}",
    )
    cands2 = enum2.enumerate(state, branch_actionable=True)
    ids1 = [(str(c.action.target_object_id), c.action.action_type) for c in cands1]
    ids2 = [(str(c.action.target_object_id), c.action.action_type) for c in cands2]
    assert ids1 == ids2
    assert ids1 == [("o-a", "ADVANCE"), ("o-a", "REVIEW"), ("o-b", "ADVANCE"), ("o-b", "REVIEW")]


def test_cand_005_fresh_action_ids_no_duplicates() -> None:
    registry = _Registry()
    registry.register(_definition("ADVANCE", frozenset({STATE_DRAFT})))
    enum = _enumerator(registry)
    state = _snapshot({"o-1": STATE_DRAFT, "o-2": STATE_DRAFT})
    cands = enum.enumerate(state, branch_actionable=True)
    action_ids = [c.action.action_id for c in cands]
    assert len(set(action_ids)) == len(action_ids)


def test_cand_006_branch_not_actionable_is_empty() -> None:
    registry = _Registry()
    registry.register(_definition("ADVANCE", frozenset({STATE_DRAFT})))
    enum = _enumerator(registry)
    state = _snapshot({"o-1": STATE_DRAFT})
    assert enum.enumerate(state, branch_actionable=False) == ()


def test_cand_007_empty_state_is_empty() -> None:
    registry = _Registry()
    registry.register(_definition("ADVANCE", frozenset({STATE_DRAFT})))
    enum = _enumerator(registry)
    assert enum.enumerate(_snapshot({}), branch_actionable=True) == ()


def test_cand_008_signal_provider_injected() -> None:
    registry = _Registry()
    registry.register(_definition("ADVANCE", frozenset({STATE_DRAFT})))
    high = ActionPrioritySignals(
        information_gain=0.9,
        blocker_resolution=0.0,
        scientific_value=0.0,
        urgency=0.0,
        cost=0.0,
        risk=0.0,
    )
    enum = _enumerator(registry, signals=high)
    cands = enum.enumerate(_snapshot({"o-1": STATE_DRAFT}), branch_actionable=True)
    assert cands[0].signals.information_gain == 0.9
