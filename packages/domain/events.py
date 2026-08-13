"""Immutable Domain Event contracts.

A Domain Event is a *fact record*: it states "this state transition
happened". It is NOT a command and carries no executable behavior. Events
are produced only by the Transition Engine upon a successful commit.

Persistence is out of scope here (STEP-002 §12): events are kept in memory
for tests. The ``created_at`` timestamp is timezone-aware.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime

from .enums import ActorType
from .ids import ActionId, BranchId, EventId, ObjectId, ProjectId

# A free-form event-type tag, e.g. "OBJECT_STATE_CHANGED". Typed event-type
# enums arrive with real research semantics in later steps.
EventType = str
StateLabel = str
Revision = int


@dataclass(frozen=True)
class DomainEvent:
    """An immutable record of a committed Research State transition."""

    event_id: EventId
    project_id: ProjectId
    branch_id: BranchId

    event_type: EventType
    aggregate_id: ObjectId

    previous_state: StateLabel | None
    new_state: StateLabel

    previous_revision: Revision
    new_revision: Revision

    action_id: ActionId | None
    actor_type: ActorType

    created_at: datetime
    metadata: Mapping[str, object] = field(default_factory=dict)


__all__ = ["DomainEvent", "EventType", "Revision", "StateLabel"]
