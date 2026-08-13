"""StateStore port — the Persistence adapter interface (Ports & Adapters).

The Control Plane depends on this ``Protocol``, never on a concrete
persistence implementation (RULE-07). ``commit_transition`` MUST be atomic
and MUST validate ``expected_revision`` (optimistic concurrency).

A real PostgreSQL adapter implements this later; an in-memory adapter lives
in ``packages/control/testing.py`` for tests/dev (STEP-002 §19). Both
satisfy the same port, so swapping the SoT is an adapter change, not a
rewrite.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..domain.events import DomainEvent
from ..domain.ids import BranchId, ProjectId
from ..domain.models import ResearchStateSnapshot
from .proposals import StateTransitionProposal


@runtime_checkable
class StateStore(Protocol):
    """Abstract, atomic store of Research State snapshots."""

    def get_snapshot(self, project_id: ProjectId, branch_id: BranchId) -> ResearchStateSnapshot:
        """Return the current snapshot for (project, branch).

        Implementations decide how to represent "not found" (e.g. empty
        snapshot at revision 0, or raise). The in-memory adapter seeds an
        initial snapshot.
        """
        ...

    def commit_transition(
        self,
        proposal: StateTransitionProposal,
        event: DomainEvent,
    ) -> ResearchStateSnapshot:
        """Atomically apply a committed transition.

        Implementations MUST:
            * verify ``proposal.expected_revision`` == current revision, else
              raise ``StaleStateError``;
            * verify ``proposal.from_state`` == current object state, else
              raise ``InvariantViolationError``;
            * increment revision by exactly 1;
            * update the target object's state;
            * record ``event``;
            * return a NEW immutable snapshot.
        """
        ...


__all__ = ["StateStore"]
