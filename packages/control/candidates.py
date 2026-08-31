"""Action Candidate Enumeration — deterministic candidate production (STEP-016).

The Policy Engine (STEP-005) RANKS candidates but generates none — ``signals``
are upstream inputs by contract. This module is the missing producer: it
derives candidate ``ResearchAction``s from the current Research State and the
registered Action Definitions.

Rules (constitution §23 — deterministic code first):

    * for every object in the snapshot, for every registered definition whose
      ``allowed_source_states`` contains the object's current state label,
      emit exactly one ``PolicyCandidate`` with a FRESH ``ActionId``;
    * a non-actionable branch produces NO candidates (same semantics as
      ``ResearchController.list_legal_actions``);
    * candidate order is deterministic: object id asc × registry insertion
      order (the registry is keyed and iterated in registration order);
    * the enumerator NEVER filters by ``target_object_type`` — the snapshot
      carries state labels only, no type information (known limitation,
      resolved when typed Research Objects arrive with the research domain).

Signals remain an upstream concern: the enumerator delegates to an injected
``SignalProvider`` and never invents priority itself.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from ..domain.enums import ActorType
from ..domain.ids import ActionId
from ..domain.models import ResearchStateSnapshot
from .actions import ResearchAction, ResearchActionDefinition
from .branches import ACTIONABLE_BRANCH_STATUSES
from .policy import ActionPrioritySignals, PolicyCandidate
from .registry import ActionRegistry


class SignalProvider(Protocol):
    """Produces priority signals for one candidate action (STEP-016).

    The Policy Engine consumes signals; someone must produce them. The
    producer is upstream of ranking by contract (STEP-005) — this port
    keeps that boundary: deterministic heuristics, domain models, or a
    future cognitive assessor may all implement it.
    """

    def signals_for(
        self,
        action: ResearchAction,
        definition: ResearchActionDefinition,
        state: ResearchStateSnapshot,
    ) -> ActionPrioritySignals: ...


class ActionCandidateEnumerator:
    """Deterministic enumeration of legal candidate actions (STEP-016)."""

    def __init__(
        self,
        registry: ActionRegistry,
        signal_provider: SignalProvider,
        *,
        action_id_factory: Callable[[], str],
        actor_type: ActorType | None = None,
    ) -> None:
        self._actor_type = actor_type or ActorType.SYSTEM
        self._registry = registry
        self._signals = signal_provider
        self._action_id_factory = action_id_factory

    def enumerate(
        self,
        state: ResearchStateSnapshot,
        *,
        branch_actionable: bool,
    ) -> tuple[PolicyCandidate, ...]:
        """All legal candidates in ``state``; empty when branch not actionable.

        Deterministic order: object id ascending × registry registration
        order. Every candidate carries a FRESH ActionId (the Policy Engine
        rejects duplicate action ids within one evaluation).
        """
        if not branch_actionable:
            return ()
        if not state.object_states:
            # empty snapshot: no objects, no candidates
            return ()

        candidates: list[PolicyCandidate] = []
        for object_id in sorted(state.object_states, key=str):
            current = state.object_states[object_id]
            for definition in self._registry.list_all():
                if not definition.allows_source_state(current):
                    continue
                action = ResearchAction(
                    action_id=ActionId(self._action_id_factory()),
                    action_type=definition.action_type,
                    project_id=state.project_id,
                    branch_id=state.branch_id,
                    target_object_id=object_id,
                    actor_type=self._actor_type,
                )
                candidates.append(
                    PolicyCandidate(
                        action=action,
                        signals=self._signals.signals_for(action, definition, state),
                        definition=definition,
                    )
                )
        return tuple(candidates)


def is_branch_actionable(branch_status: object) -> bool:
    """True when ``branch_status`` permits ordinary research actions."""
    return branch_status in ACTIONABLE_BRANCH_STATUSES


__all__ = [
    "ActionCandidateEnumerator",
    "SignalProvider",
    "is_branch_actionable",
]
