"""Transition Engine — the deterministic heart of the Control Plane.

Responsibilities:
    * validate a proposal (legality + invariants)
    * evaluate the deterministic transition decision from gate results AND
      the approval requirement
    * commit a transition to an abstract StateStore
    * produce a DomainEvent on success
    * on WAIT, materialize a PendingTransition (recoverable) instead of
      dropping the proposal (STEP-003 §16/§17)

It MUST NOT choose the next action, call an LLM, execute a capability, or
persist to PostgreSQL. Time and id generation are injected so tests stay
deterministic.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..domain.enums import ActorType, GateStatus, TransitionDecision
from ..domain.events import DomainEvent
from ..domain.ids import BranchId, EventId, ObjectId, ProjectId, TaskId
from ..domain.models import ResearchStateSnapshot
from .actions import ResearchAction, ResearchActionDefinition, StateLabel
from .clock import IdFactory, TimeProvider, default_id, default_now
from .errors import IllegalActionError, InvariantViolationError, StaleStateError
from .gates import aggregate_gates
from .pending import (
    WAITING_ON_APPROVAL,
    WAITING_ON_BLOCKED,
    WAITING_ON_UNCERTAINTY,
    PendingTransition,
)
from .proposals import StateTransitionProposal
from .store import StateStore

# Re-export the injectable type aliases for backward compatibility with
# STEP-002 callers that imported them from this module.
__all__ = [
    "IdFactory",
    "TimeProvider",
    "TransitionEngine",
    "TransitionExecutionResult",
    "assert_action_legal",
    "current_object_state",
]


def assert_action_legal(
    state: ResearchStateSnapshot,
    definition: ResearchActionDefinition,
    action: ResearchAction,
) -> None:
    """Raise ``IllegalActionError`` if ``action`` is not legal in ``state``.

    Checks:
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
        raise IllegalActionError(f"target object does not exist: {action.target_object_id!r}")
    current = state.object_states[action.target_object_id]
    if not definition.allows_source_state(current):
        raise IllegalActionError(
            f"object {action.target_object_id!r} is in state {current!r}, "
            f"not allowed for action {definition.action_type!r} "
            f"(allowed: {sorted(definition.allowed_source_states)})"
        )


def current_object_state(state: ResearchStateSnapshot, object_id: ObjectId) -> StateLabel:
    """Return the current state label of ``object_id`` or raise."""
    if object_id not in state.object_states:
        raise IllegalActionError(f"object not found: {object_id!r}")
    return state.object_states[object_id]


@dataclass(frozen=True)
class TransitionExecutionResult:
    """Unified outcome of executing a proposal (STEP-003 §17).

    Invariants per decision:
        COMMIT : snapshot and event set; pending_transition is None
        WAIT   : pending_transition set; snapshot and event are None
        REJECT : all of snapshot/event/pending_transition are None
    """

    decision: TransitionDecision
    snapshot: ResearchStateSnapshot | None = None
    event: DomainEvent | None = None
    pending_transition: PendingTransition | None = None
    reason_codes: tuple[str, ...] = ()


# Approval state as seen by the engine when evaluating a proposal.
_APPROVAL_NOT_REQUIRED = "NOT_REQUIRED"
_APPROVAL_PENDING = "PENDING"
_APPROVAL_APPROVED = "APPROVED"


class TransitionEngine:
    """Validates proposals, evaluates decisions, commits via a StateStore."""

    def __init__(self, store: StateStore) -> None:
        self._store = store

    # --- read -----------------------------------------------------------
    def get_snapshot(self, project_id: ProjectId, branch_id: BranchId) -> ResearchStateSnapshot:
        return self._store.get_snapshot(project_id, branch_id)

    # --- decision -------------------------------------------------------
    @staticmethod
    def evaluate(proposal: StateTransitionProposal) -> TransitionDecision:
        """Deterministic decision from the proposal's gate results only."""
        return aggregate_gates(proposal.gate_results)

    # --- execute (unified) ---------------------------------------------
    def execute(
        self,
        proposal: StateTransitionProposal,
        *,
        definition: ResearchActionDefinition,
        actor_type: ActorType,
        approval_state: str = _APPROVAL_NOT_REQUIRED,
        related_task_id: TaskId | None = None,
        now: TimeProvider = default_now,
        id_factory: IdFactory = default_id,
    ) -> TransitionExecutionResult:
        """Evaluate and apply a proposal, returning a unified result.

        WAIT triggers when gates are UNCERTAIN/BLOCKED, OR when the action
        ``requires_approval`` and the approval is not yet APPROVED. On WAIT a
        recoverable ``PendingTransition`` is built (not persisted by the
        engine; the Controller persists it). Illegal action / stale revision /
        invariant violations still raise typed exceptions.
        """
        gate_decision = self.evaluate(proposal)

        # --- approval gate ------------------------------------------------
        needs_approval = definition.requires_approval and approval_state != _APPROVAL_APPROVED
        if needs_approval and gate_decision is not TransitionDecision.REJECT:
            pending = self._build_pending(
                proposal,
                reason="approval required",
                waiting_on=WAITING_ON_APPROVAL,
                related_task_id=related_task_id,
                now=now,
            )
            return TransitionExecutionResult(
                decision=TransitionDecision.WAIT,
                pending_transition=pending,
                reason_codes=("APPROVAL_REQUIRED",),
            )

        # --- gate-driven decision ----------------------------------------
        if gate_decision is TransitionDecision.REJECT:
            return TransitionExecutionResult(
                decision=TransitionDecision.REJECT,
                reason_codes=tuple(code for r in proposal.gate_results for code in r.reason_codes),
            )

        if gate_decision is TransitionDecision.WAIT:
            waiting_on = self._infer_waiting_on(proposal)
            reason = "gate uncertain or blocked"
            pending = self._build_pending(
                proposal,
                reason=reason,
                waiting_on=waiting_on,
                related_task_id=related_task_id,
                now=now,
            )
            return TransitionExecutionResult(
                decision=TransitionDecision.WAIT,
                pending_transition=pending,
                reason_codes=(waiting_on,),
            )

        # --- COMMIT -------------------------------------------------------
        snapshot, event = self._commit(
            proposal,
            actor_type=actor_type,
            now=now,
            id_factory=id_factory,
        )
        return TransitionExecutionResult(
            decision=TransitionDecision.COMMIT,
            snapshot=snapshot,
            event=event,
        )

    # --- resume a previously-waiting transition ------------------------
    def resume(
        self,
        pending: PendingTransition,
        *,
        definition: ResearchActionDefinition,
        actor_type: ActorType,
        approval_state: str = _APPROVAL_NOT_REQUIRED,
        related_task_id: TaskId | None = None,
        now: TimeProvider = default_now,
        id_factory: IdFactory = default_id,
    ) -> TransitionExecutionResult:
        """Re-evaluate a pending transition against the CURRENT state.

        MUST re-validate revision / from_state (STEP-003 §24): resume does
        NOT skip stale-state checks even if the proposal was legal when
        paused.
        """
        return self.execute(
            pending.transition_proposal,
            definition=definition,
            actor_type=actor_type,
            approval_state=approval_state,
            related_task_id=related_task_id or pending.related_task_id,
            now=now,
            id_factory=id_factory,
        )

    # --- internals ------------------------------------------------------
    def _commit(
        self,
        proposal: StateTransitionProposal,
        *,
        actor_type: ActorType,
        now: TimeProvider,
        id_factory: IdFactory,
    ) -> tuple[ResearchStateSnapshot, DomainEvent]:
        # Verify against current reality before touching the store.
        # Revision is checked FIRST so a stale proposal (built on an older
        # snapshot) surfaces as StaleStateError before any from_state detail.
        snapshot = self._store.get_snapshot(proposal.project_id, proposal.branch_id)
        if proposal.expected_revision != snapshot.revision:
            raise StaleStateError(
                f"stale revision: expected={proposal.expected_revision} actual={snapshot.revision}"
            )
        actual = snapshot.object_states.get(proposal.target_object_id)
        if actual != proposal.from_state:
            raise InvariantViolationError(
                f"from_state mismatch: proposal={proposal.from_state!r} actual={actual!r}"
            )

        event = DomainEvent(
            event_id=EventId(id_factory()),
            project_id=proposal.project_id,
            branch_id=proposal.branch_id,
            event_type="OBJECT_STATE_CHANGED",
            aggregate_id=proposal.target_object_id,
            previous_state=proposal.from_state,
            new_state=proposal.to_state,
            previous_revision=proposal.expected_revision,
            new_revision=proposal.expected_revision + 1,
            action_id=proposal.action_id,
            actor_type=actor_type,
            created_at=now(),
        )

        new_snapshot = self._store.commit_transition(proposal, event)
        return new_snapshot, event

    def _build_pending(
        self,
        proposal: StateTransitionProposal,
        *,
        reason: str,
        waiting_on: str,
        related_task_id: TaskId | None,
        now: TimeProvider,
    ) -> PendingTransition:
        ts = now()
        return PendingTransition(
            proposal_id=proposal.proposal_id,
            project_id=proposal.project_id,
            branch_id=proposal.branch_id,
            transition_proposal=proposal,
            reason=reason,
            waiting_on=waiting_on,
            created_at=ts,
            updated_at=ts,
            related_task_id=related_task_id,
        )

    @staticmethod
    def _infer_waiting_on(proposal: StateTransitionProposal) -> str:
        statuses = {r.status for r in proposal.gate_results}
        if GateStatus.BLOCKED in statuses:
            return WAITING_ON_BLOCKED
        return WAITING_ON_UNCERTAINTY
