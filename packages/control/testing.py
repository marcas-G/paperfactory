"""InMemoryStateStore — a test / dev StateStore adapter.

This is NOT a Domain object and NOT a production persistence adapter. It
exists so the Control Kernel can be exercised end-to-end without a database
(STEP-002 §19, ADR-003). Production code MUST NOT depend on it; only tests
and dev harnesses import from here.

``seed_snapshot`` is a test/dev helper and intentionally NOT part of the
``StateStore`` Protocol — production control APIs have no seeding path.
"""

from __future__ import annotations

from copy import deepcopy

from ..domain.events import DomainEvent
from ..domain.ids import BranchId, ProjectId
from ..domain.models import ResearchStateSnapshot
from .errors import InvariantViolationError, StaleStateError
from .proposals import StateTransitionProposal


class InMemoryStateStore:
    """In-memory implementation of the StateStore port."""

    def __init__(self) -> None:
        # keyed by (project_id, branch_id)
        self._snapshots: dict[tuple[ProjectId, BranchId], ResearchStateSnapshot] = {}
        self._events: list[DomainEvent] = []

    # --- test/dev helpers (NOT on the StateStore Protocol) --------------
    def seed_snapshot(self, snapshot: ResearchStateSnapshot) -> None:
        """Seed an initial snapshot. Test/dev only — no production path."""
        key = (snapshot.project_id, snapshot.branch_id)
        if key in self._snapshots:
            raise InvariantViolationError(
                f"snapshot already seeded for {snapshot.project_id}/{snapshot.branch_id}"
            )
        self._snapshots[key] = snapshot

    def events(self) -> list[DomainEvent]:
        """Return a copy of all committed events (test assertion helper)."""
        return list(self._events)

    # --- StateStore Protocol --------------------------------------------
    def get_snapshot(self, project_id: ProjectId, branch_id: BranchId) -> ResearchStateSnapshot:
        key = (project_id, branch_id)
        if key not in self._snapshots:
            # Empty branch — revision 0, no objects.
            return ResearchStateSnapshot(
                project_id=project_id, branch_id=branch_id, revision=0
            )
        return self._snapshots[key]

    def commit_transition(
        self,
        proposal: StateTransitionProposal,
        event: DomainEvent,
    ) -> ResearchStateSnapshot:
        current = self.get_snapshot(proposal.project_id, proposal.branch_id)

        # 1. optimistic-concurrency guard
        if proposal.expected_revision != current.revision:
            raise StaleStateError(
                f"stale revision: expected={proposal.expected_revision} "
                f"actual={current.revision}"
            )

        # 2. from_state invariant
        actual_state = current.object_states.get(proposal.target_object_id)
        if actual_state != proposal.from_state:
            raise InvariantViolationError(
                f"from_state mismatch: proposal={proposal.from_state!r} "
                f"actual={actual_state!r}"
            )

        # 3. build new immutable snapshot: copy states, update target, +1 rev
        new_states = dict(current.object_states)
        new_states[proposal.target_object_id] = proposal.to_state
        new_snapshot = ResearchStateSnapshot(
            project_id=current.project_id,
            branch_id=current.branch_id,
            revision=current.revision + 1,
            object_states=new_states,
            metadata=deepcopy(dict(current.metadata)),
        )

        # 4. commit atomically (dict update + event append are the "tx")
        key = (current.project_id, current.branch_id)
        self._snapshots[key] = new_snapshot
        self._events.append(event)

        return new_snapshot


__all__ = ["InMemoryStateStore"]
