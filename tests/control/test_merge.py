"""MERGE-001..009 — merge preparation + generic three-way conflict detection.

prepare_merge reads both branch states and the fork base, classifies each
object, and produces a BranchMergeProposal. It MUST NOT mutate any state.
"""

from __future__ import annotations

import pytest

from packages.control.errors import BranchMergeError
from packages.control.merges import MergeChangeKind, MergeStatus, classify_object
from packages.domain.enums import ActorType
from packages.domain.events import ControlEventType
from packages.domain.ids import ActionId, BranchId

from .conftest import BRANCH, OBJ, PROJECT, STATE_READY

H1 = BranchId("H1")


# =========================================================================
# Pure three-way classifier (unit)
# =========================================================================
def test_merge_001_source_only_change_no_conflict() -> None:
    assert (
        classify_object(base="DRAFT", source="READY", target="DRAFT")
        is MergeChangeKind.SOURCE_ONLY_CHANGE
    )


def test_merge_002_target_only_change_no_conflict() -> None:
    assert (
        classify_object(base="DRAFT", source="DRAFT", target="READY")
        is MergeChangeKind.TARGET_ONLY_CHANGE
    )


def test_merge_003_same_change_no_conflict() -> None:
    assert (
        classify_object(base="DRAFT", source="READY", target="READY") is MergeChangeKind.SAME_CHANGE
    )


def test_merge_004_different_change_conflict() -> None:
    assert (
        classify_object(base="DRAFT", source="READY", target="COMPLETE") is MergeChangeKind.CONFLICT
    )


# =========================================================================
# Integration via controller.prepare_branch_merge
# =========================================================================
def _fork(controller):  # type: ignore[no-untyped-def]
    controller.fork_branch(source_branch_id=BRANCH, new_branch_id=H1, name="H1")


def _set_branch_object(controller, branch_id: BranchId, to_state: str) -> None:  # type: ignore[no-untyped-def]
    """Advance OBJ on branch_id from DRAFT to to_state (assumes DRAFT start)."""
    from packages.control import ResearchAction
    from packages.control.controller import APPROVAL_NOT_REQUIRED

    action_type = "TEST_ADVANCE"  # DRAFT -> READY
    definition = controller._registry.get(action_type)
    action = ResearchAction(
        action_id=ActionId(f"set-{branch_id}"),
        action_type=action_type,
        project_id=PROJECT,
        branch_id=branch_id,
        target_object_id=OBJ,
        actor_type=ActorType.SYSTEM,
    )
    proposal = controller.propose_transition(action, definition, to_state=to_state)
    controller.execute_transition(
        proposal, definition, actor_type=ActorType.SYSTEM, approval_state=APPROVAL_NOT_REQUIRED
    )


def test_merge_005_same_branch_rejected(controller) -> None:  # type: ignore[no-untyped-def]
    _fork(controller)
    with pytest.raises(BranchMergeError):
        controller.prepare_branch_merge(source_branch_id=H1, target_branch_id=H1)


def test_merge_006_different_project_rejected(controller) -> None:  # type: ignore[no-untyped-def]
    from packages.domain.ids import ProjectId

    # create a second project's main branch
    other_main = BranchId("other-main")
    controller.create_main_branch(
        project_id=ProjectId("proj-other"),
        branch_id=other_main,
    )
    _fork(controller)  # H1 under PROJECT
    with pytest.raises(BranchMergeError):
        controller.prepare_branch_merge(source_branch_id=H1, target_branch_id=other_main)


def test_merge_007_preparation_does_not_mutate_state(controller, store) -> None:  # type: ignore[no-untyped-def]
    _fork(controller)
    main_before = store.get_snapshot(PROJECT, BRANCH).revision
    h1_before = store.get_snapshot(PROJECT, H1).revision
    controller.prepare_branch_merge(source_branch_id=H1, target_branch_id=BRANCH)
    assert store.get_snapshot(PROJECT, BRANCH).revision == main_before
    assert store.get_snapshot(PROJECT, H1).revision == h1_before
    # H1 status must NOT have become MERGED
    assert controller.get_branch(H1).status.value != "MERGED"


def test_merge_008_preparation_emits_event(controller, event_sink) -> None:  # type: ignore[no-untyped-def]
    _fork(controller)
    controller.prepare_branch_merge(source_branch_id=H1, target_branch_id=BRANCH)
    types = [e.event_type for e in event_sink.list_for_project(PROJECT)]
    assert ControlEventType.BRANCH_MERGE_PREPARED in types
    # BRANCH_MERGED must NOT be emitted (no merge commit in this step)
    assert ControlEventType.BRANCH_MERGED not in types


def test_merge_009_proposal_records_revisions(controller) -> None:  # type: ignore[no-untyped-def]
    _fork(controller)
    # advance H1 so its head revision differs from base
    _set_branch_object(controller, H1, STATE_READY)  # H1 rev 1
    proposal = controller.prepare_branch_merge(source_branch_id=H1, target_branch_id=BRANCH)
    assert proposal.source_head_revision == 1
    assert proposal.target_head_revision == 0
    assert proposal.fork_base_branch_id == BRANCH
    assert proposal.fork_base_revision == 0


def test_merge_integration_source_only_ready_no_conflict(controller) -> None:  # type: ignore[no-untyped-def]
    _fork(controller)
    _set_branch_object(controller, H1, STATE_READY)  # source changed, target unchanged
    proposal = controller.prepare_branch_merge(source_branch_id=H1, target_branch_id=BRANCH)
    assert proposal.status is MergeStatus.READY
    assert proposal.conflicts == ()


def test_merge_integration_conflict_when_both_changed(controller) -> None:  # type: ignore[no-untyped-def]
    _fork(controller)
    _set_branch_object(controller, H1, STATE_READY)  # source -> READY
    _set_branch_object(controller, BRANCH, STATE_READY)  # target -> READY too
    # both changed identically -> SAME_CHANGE, no conflict
    proposal = controller.prepare_branch_merge(source_branch_id=H1, target_branch_id=BRANCH)
    assert proposal.status is MergeStatus.READY

    # now make them genuinely conflict: target must differ from source.
    # advance target further READY->COMPLETE via TEST_BLOCKED_ADVANCE
    from packages.control import ResearchAction
    from packages.control.controller import APPROVAL_NOT_REQUIRED

    definition = controller._registry.get("TEST_BLOCKED_ADVANCE")
    action = ResearchAction(
        action_id=ActionId("tgt-complete"),
        action_type="TEST_BLOCKED_ADVANCE",
        project_id=PROJECT,
        branch_id=BRANCH,
        target_object_id=OBJ,
        actor_type=ActorType.SYSTEM,
    )
    proposal_t = controller.propose_transition(action, definition, to_state="COMPLETE")
    controller.execute_transition(
        proposal_t,
        definition,
        actor_type=ActorType.SYSTEM,
        approval_state=APPROVAL_NOT_REQUIRED,
    )
    # source=READY, target=COMPLETE, base=DRAFT -> CONFLICT
    proposal2 = controller.prepare_branch_merge(source_branch_id=H1, target_branch_id=BRANCH)
    assert proposal2.status is MergeStatus.CONFLICTED
    conflict_ids = [c.object_id for c in proposal2.conflicts]
    assert OBJ in conflict_ids
