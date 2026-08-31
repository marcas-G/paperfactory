"""Immutable event contracts.

Two event shapes coexist:

* ``DomainEvent`` — the STEP-002 record of a *committed Research State
  transition* (carries previous/new state + revision).
* ``ControlEvent`` — a general control-plane fact (Task lifecycle,
  PendingTransition, Approval, ...). Carries a typed ``event_type`` and a
  free-form ``aggregate_id`` + payload. Used by ``ControlEventSink``.

Both are immutable fact records, not commands. Persistence is out of scope
(events are kept in memory for tests). Timestamps are timezone-aware.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from .enums import ActorType
from .ids import ActionId, BranchId, EventId, ObjectId, ProjectId

# A free-form event-type tag for DomainEvent.
EventType = str
StateLabel = str
Revision = int


class ControlEventType(StrEnum):
    """Typed control-plane event kinds (STEP-003 §31, STEP-004 §18).

    A lightweight, control-only enum — NOT a full research event ontology.
    """

    # State transitions
    OBJECT_STATE_CHANGED = "OBJECT_STATE_CHANGED"

    # Task lifecycle
    TASK_CREATED = "TASK_CREATED"
    TASK_STATE_CHANGED = "TASK_STATE_CHANGED"

    # Pending transitions
    TRANSITION_WAITING = "TRANSITION_WAITING"
    TRANSITION_RESUMED = "TRANSITION_RESUMED"

    # Approvals — reject / cancel / expire are DISTINCT audit events so audit
    # can tell "explicitly denied" from "withdrawn" from "timed out"
    # (STEP-004 §3).
    APPROVAL_REQUESTED = "APPROVAL_REQUESTED"
    APPROVAL_APPROVED = "APPROVAL_APPROVED"
    APPROVAL_REJECTED = "APPROVAL_REJECTED"
    APPROVAL_CANCELLED = "APPROVAL_CANCELLED"
    APPROVAL_EXPIRED = "APPROVAL_EXPIRED"

    # Branch lifecycle (STEP-004 §18)
    BRANCH_CREATED = "BRANCH_CREATED"
    BRANCH_FORKED = "BRANCH_FORKED"
    BRANCH_PAUSED = "BRANCH_PAUSED"
    BRANCH_RESUMED = "BRANCH_RESUMED"
    BRANCH_ARCHIVED = "BRANCH_ARCHIVED"
    BRANCH_REJECTED = "BRANCH_REJECTED"
    BRANCH_MERGE_PREPARED = "BRANCH_MERGE_PREPARED"
    BRANCH_MERGED = "BRANCH_MERGED"

    # Research Policy (STEP-005 §23)
    POLICY_EVALUATED = "POLICY_EVALUATED"

    # Agent Loop (STEP-016, constitution §15.10 Explicit Stop)
    LOOP_STARTED = "LOOP_STARTED"
    LOOP_ITERATION_COMPLETED = "LOOP_ITERATION_COMPLETED"
    LOOP_STOPPED = "LOOP_STOPPED"


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


@dataclass(frozen=True)
class ControlEvent:
    """An immutable, general control-plane fact record.

    ``aggregate_id`` is an opaque string identity of whatever the event is
    about (a task id, an approval id, a proposal id, an object id, ...).
    ``payload`` carries event-specific structured detail.
    """

    event_id: EventId
    project_id: ProjectId
    branch_id: BranchId | None

    event_type: ControlEventType
    aggregate_id: str

    actor_type: ActorType
    created_at: datetime
    payload: Mapping[str, object] = field(default_factory=dict)


__all__ = [
    "ControlEvent",
    "ControlEventType",
    "DomainEvent",
    "EventType",
    "Revision",
    "StateLabel",
]
