"""Research Action contracts: Action Definition vs Action Instance.

An ``ResearchActionDefinition`` is a *registered type* of legal action — it
declares under which source states an object may be acted upon, which gates
must pass, the side-effect level, and whether approval is required.

A ``ResearchAction`` is a *concrete instance* — one execution of a
definition against a specific target object, by a specific actor.

These are domain-agnostic: they do not name SEARCH_LITERATURE /
PROPOSE_HYPOTHESIS (STEP-002 §8, §24). Concrete actions enter via the
Action Registry in later steps.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from ..domain.enums import ActorType, SideEffectLevel
from ..domain.ids import ActionId, BranchId, ObjectId, ProjectId

# --- Type / state labels (opaque strings to the kernel) -----------------
ActionType = str
ObjectType = str
StateLabel = str
GateId = str


@dataclass(frozen=True)
class ResearchActionDefinition:
    """A registered, reusable definition of a legal Research Action."""

    action_type: ActionType
    target_object_type: ObjectType
    allowed_source_states: frozenset[StateLabel]
    required_gate_ids: frozenset[GateId] = field(default_factory=frozenset)
    side_effect_level: SideEffectLevel = SideEffectLevel.NONE
    requires_approval: bool = False

    def allows_source_state(self, state: StateLabel) -> bool:
        return state in self.allowed_source_states


@dataclass(frozen=True)
class ResearchAction:
    """A concrete instance of executing an Action Definition.

    ``payload`` is intentionally a ``Mapping[str, object]`` and MUST stay
    confined to the Action payload boundary — it must NOT propagate as
    ``dict[str, Any]`` into the rest of the system.
    """

    action_id: ActionId
    action_type: ActionType
    project_id: ProjectId
    branch_id: BranchId
    target_object_id: ObjectId
    actor_type: ActorType
    payload: Mapping[str, object] = field(default_factory=dict)


__all__ = [
    "ActionType",
    "GateId",
    "ObjectType",
    "ResearchAction",
    "ResearchActionDefinition",
    "StateLabel",
]
