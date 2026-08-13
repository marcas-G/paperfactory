"""M4 — Research Domain contracts.

STEP-002 adds the *domain-agnostic primitives* shared by every future
Research Object and by the Control Plane:

    * typed identities (ids)
    * core control enums (GateStatus, TransitionDecision, ActorType,
      SideEffectLevel)
    * immutable DomainEvent contract
    * immutable ResearchStateSnapshot contract

Concrete research objects (ResearchProject, ResearchQuestion, Gap,
Hypothesis, ...) are NOT implemented yet — this layer stays
framework-independent (no FastAPI / SQLAlchemy / LLM SDKs).
"""

from __future__ import annotations

from .enums import ActorType, GateStatus, SideEffectLevel, TransitionDecision
from .events import ControlEvent, ControlEventType, DomainEvent
from .ids import (
    ActionId,
    ApprovalId,
    BranchId,
    EventId,
    MergeId,
    ObjectId,
    ProjectId,
    ProposalId,
    RunId,
    TaskId,
)
from .models import ResearchStateSnapshot

__all__ = [
    # ids
    "ActionId",
    "ApprovalId",
    "BranchId",
    "EventId",
    "MergeId",
    "ObjectId",
    "ProjectId",
    "ProposalId",
    "RunId",
    "TaskId",
    # enums
    "ActorType",
    "GateStatus",
    "SideEffectLevel",
    "TransitionDecision",
    # contracts
    "ControlEvent",
    "ControlEventType",
    "DomainEvent",
    "ResearchStateSnapshot",
]
