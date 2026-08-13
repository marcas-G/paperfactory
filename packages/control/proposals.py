"""State Transition Proposal contract.

A proposal is what an Agent / Capability / Tool / LLM is allowed to
*produce* — never to commit. Only the Transition Engine (via the Control
Plane) commits. Carrying ``expected_revision`` enables optimistic-concurrency
protection (STEP-002 §11, §20) even before a real database exists.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from ..domain.ids import ActionId, BranchId, ObjectId, ProjectId
from .actions import StateLabel
from .gates import GateResult


@dataclass(frozen=True)
class StateTransitionProposal:
    """A proposed, not-yet-committed Research State transition."""

    proposal_id: str
    project_id: ProjectId
    branch_id: BranchId

    target_object_id: ObjectId

    from_state: StateLabel
    to_state: StateLabel

    action_id: ActionId | None
    gate_results: tuple[GateResult, ...] = ()
    expected_revision: int = 0
    metadata: Mapping[str, object] = field(default_factory=dict)


__all__ = ["StateTransitionProposal"]
