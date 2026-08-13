"""Transition Engine — the deterministic heart of the Control Plane.

Responsibilities (STEP-002 §17):
    * validate a proposal (legality + invariants)
    * evaluate the deterministic transition decision from gate results
    * commit a transition to an abstract StateStore
    * produce a DomainEvent on success

It MUST NOT choose the next action, call an LLM, execute a capability, or
persist to PostgreSQL. Time and id generation are injected so tests stay
deterministic.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from ..domain.enums import ActorType, TransitionDecision
from ..domain.events import DomainEvent
from ..domain.ids import BranchId, EventId, ObjectId, ProjectId
from ..domain.models import ResearchStateSnapshot
from .actions import ResearchAction, ResearchActionDefinition, StateLabel
from .errors import (
    IllegalActionError,
    InvariantViolationError,
    TransitionRejectedError,
)
from .gates import aggregate_gates
from .proposals import StateTransitionProposal
from .store import StateStore

# Injectables for deterministic testing.
TimeProvider = Callable[[], datetime]
IdFactory = Callable[[], str]


def _default_time() -> datetime:
    return datetime.now(UTC)


def _default_id() -> str:
    return uuid.uuid4().hex


def assert_action_legal(
    state: ResearchStateSnapshot,
    definition: ResearchActionDefinition,
    action: ResearchAction,
) -> None:
    """Raise ``IllegalActionError`` if ``action`` is not legal in ``state``.

    Checks (STEP-002 §16):
        1. project / branch of the action match the snapshot scope;
        2. target object exists in the snapshot;
        3. action_type matches the definition;
        4. the target object's current state is an allowed source state.
    """
    if action.project_id != state.project_id or action.branch_id != state.branch_id:
        raise IllegalActionError(
            "action scope does not match state snapshot "
            f"(action={action.project_id}/{action.branch_id}, "
            f"state={state.project_id}/{state.branch_id})"
        )
    if action.action_type != definition.action_type:
        raise IllegalActionError(
            f"action_type mismatch: action={action.action_type!r} "
            f"definition={definition.action_type!r}"
        )
    if action.target_object_id not in state.object_states:
        raise IllegalActionError(
            f"target object does not exist: {action.target_object_id!r}"
        )
    current = state.object_states[action.target_object_id]
    if not definition.allows_source_state(current):
        raise IllegalActionError(
            f"object {action.target_object_id!r} is in state {current!r}, "
            f"not allowed for action {definition.action_type!r} "
            f"(allowed: {sorted(definition.allowed_source_states)})"
        )


def current_object_state(
    state: ResearchStateSnapshot, object_id: ObjectId
) -> StateLabel:
    """Return the current state label of ``object_id`` or raise."""
    if object_id not in state.object_states:
        raise IllegalActionError(f"object not found: {object_id!r}")
    return state.object_states[object_id]


class TransitionEngine:
    """Validates proposals, evaluates decisions, commits via a StateStore."""

    def __init__(self, store: StateStore) -> None:
        self._store = store

    # --- read -----------------------------------------------------------
    def get_snapshot(self, project_id: ProjectId, branch_id: BranchId) -> ResearchStateSnapshot:
        """Delegate read to the store."""
        return self._store.get_snapshot(project_id, branch_id)

    # --- decision -------------------------------------------------------
    @staticmethod
    def evaluate(proposal: StateTransitionProposal) -> TransitionDecision:
        """Deterministic decision from the proposal's gate results."""
        return aggregate_gates(proposal.gate_results)

    # --- commit ---------------------------------------------------------
    def commit(
        self,
        proposal: StateTransitionProposal,
        *,
        actor_type: ActorType,
        event_type: str = "OBJECT_STATE_CHANGED",
        now: TimeProvider = _default_time,
        id_factory: IdFactory = _default_id,
    ) -> tuple[ResearchStateSnapshot, DomainEvent]:
        """Validate, decide, and — if COMMIT — apply the transition.

        Returns ``(new_snapshot, event)``. Raises:
            * ``TransitionRejectedError`` if the decision is REJECT;
            * ``InvariantViolationError`` if from_state mismatches reality;
            * ``StaleStateError`` / invariant errors from the store on commit;
            * ``TransitionRejectedError`` (WAIT) is surfaced to the caller as a
              non-committed result via raising, since the kernel does not hold
              a pending-proposal store in this step.
        """
        decision = self.evaluate(proposal)

        if decision is TransitionDecision.REJECT:
            raise TransitionRejectedError(
                f"transition rejected by gates for object "
                f"{proposal.target_object_id!r}"
            )

        if decision is TransitionDecision.WAIT:
            raise TransitionRejectedError(
                f"transition waiting (uncertain/blocked) for object "
                f"{proposal.target_object_id!r}; not committed"
            )

        # COMMIT path — verify from_state against current reality before
        # touching the store, so we give a precise invariant error.
        snapshot = self._store.get_snapshot(proposal.project_id, proposal.branch_id)
        actual = snapshot.object_states.get(proposal.target_object_id)
        if actual != proposal.from_state:
            raise InvariantViolationError(
                f"from_state mismatch: proposal={proposal.from_state!r} "
                f"actual={actual!r}"
            )

        event = DomainEvent(
            event_id=EventId(id_factory()),
            project_id=proposal.project_id,
            branch_id=proposal.branch_id,
            event_type=event_type,
            aggregate_id=proposal.target_object_id,
            previous_state=proposal.from_state,
            new_state=proposal.to_state,
            previous_revision=proposal.expected_revision,
            new_revision=proposal.expected_revision + 1,
            action_id=proposal.action_id,
            actor_type=actor_type,
            created_at=now(),
            metadata=dict(proposal.metadata),
        )

        new_snapshot = self._store.commit_transition(proposal, event)
        return new_snapshot, event


__all__ = [
    "IdFactory",
    "TimeProvider",
    "TransitionEngine",
    "assert_action_legal",
    "current_object_state",
]
