"""ResearchController — a thin facade over the Control Kernel (STEP-002 §23).

First-version surface:
    * get_state(project, branch)
    * list_legal_actions(state, target_object_id)
    * propose_transition(action, definition, to_state, gate_results)
    * commit_transition(proposal, actor_type)

Deliberately NOT implemented yet (later steps):
    rank_actions, research policy, task DAG, branch manager, approval manager.
"""

from __future__ import annotations

from collections.abc import Callable

from ..domain.enums import ActorType, TransitionDecision
from ..domain.events import DomainEvent
from ..domain.ids import (
    BranchId,
    ObjectId,
    ProjectId,
)
from ..domain.models import ResearchStateSnapshot
from .actions import (
    ResearchAction,
    ResearchActionDefinition,
    StateLabel,
)
from .engine import IdFactory, TimeProvider, TransitionEngine, assert_action_legal
from .gates import GateResult
from .proposals import StateTransitionProposal
from .registry import ActionRegistry


class ResearchController:
    """Facade: registry + engine + id/time providers."""

    def __init__(
        self,
        registry: ActionRegistry,
        engine: TransitionEngine,
        *,
        proposal_id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._registry = registry
        self._engine = engine
        # Imported lazily-safe default factories (uuid) live in the engine.
        from .engine import _default_id

        self._proposal_id_factory: Callable[[], str] = proposal_id_factory or _default_id

    # --- read -----------------------------------------------------------
    def get_state(self, project_id: ProjectId, branch_id: BranchId) -> ResearchStateSnapshot:
        return self._engine.get_snapshot(project_id, branch_id)

    def list_legal_actions(
        self,
        state: ResearchStateSnapshot,
        target_object_id: ObjectId,
    ) -> list[ResearchActionDefinition]:
        """Return definitions whose ``allowed_source_states`` contain the
        target object's current state. Definitions whose source states do not
        match are excluded (CTRL-001 / CTRL-002)."""
        current = state.object_states.get(target_object_id)
        if current is None:
            return []
        legal: list[ResearchActionDefinition] = []
        for definition in self._registry.list_all():
            if definition.allows_source_state(current):
                legal.append(definition)
        return legal

    # --- propose + commit ----------------------------------------------
    def propose_transition(
        self,
        action: ResearchAction,
        definition: ResearchActionDefinition,
        to_state: StateLabel,
        gate_results: tuple[GateResult, ...] = (),
    ) -> StateTransitionProposal:
        """Build a proposal against the CURRENT state.

        Reads the current snapshot to populate ``expected_revision`` and
        ``from_state``. Legality is asserted first (raises IllegalActionError).
        """
        state = self.get_state(action.project_id, action.branch_id)
        assert_action_legal(state, definition, action)

        from_state = state.object_states[action.target_object_id]
        return StateTransitionProposal(
            proposal_id=self._proposal_id_factory(),
            project_id=action.project_id,
            branch_id=action.branch_id,
            target_object_id=action.target_object_id,
            from_state=from_state,
            to_state=to_state,
            action_id=action.action_id,
            gate_results=gate_results,
            expected_revision=state.revision,
        )

    def commit_transition(
        self,
        proposal: StateTransitionProposal,
        actor_type: ActorType,
        *,
        now: TimeProvider | None = None,
        id_factory: IdFactory | None = None,
    ) -> tuple[ResearchStateSnapshot, DomainEvent, TransitionDecision]:
        """Evaluate the proposal and commit if the decision is COMMIT.

        Returns ``(new_snapshot, event, decision)``. On REJECT/WAIT the
        engine raises ``TransitionRejectedError``; callers that want the
        decision without committing should call ``engine.evaluate`` first.
        """
        from .engine import _default_id, _default_time

        new_snapshot, event = self._engine.commit(
            proposal,
            actor_type=actor_type,
            now=now or _default_time,
            id_factory=id_factory or _default_id,
        )
        return new_snapshot, event, TransitionDecision.COMMIT


__all__ = ["ResearchController"]
