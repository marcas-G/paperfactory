"""Generic, immutable Research State snapshot contract.

This is deliberately NOT a full research-state model. It is a domain-agnostic
container the Controller uses to reason about object states, revisions, and
metadata. It contains no ResearchQuestion / Hypothesis / Experiment semantics
(STEP-002 §7, §24).

Invariants:
    * immutable (frozen);
    * ``revision`` is explicit and monotonic per (project, branch);
    * there is NO ``set_status(...)`` / mutation API — transitions must go
      through the Transition Engine.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from .ids import BranchId, ObjectId, ProjectId

Revision = int
StateLabel = str


@dataclass(frozen=True)
class ResearchStateSnapshot:
    """An immutable point-in-time view of a branch's object states.

    ``object_states`` maps an object id to its current state label. The
    labels are opaque to the kernel (e.g. ``"DRAFT"``); semantic meaning is
    supplied by Action Definitions' ``allowed_source_states``.
    """

    project_id: ProjectId
    branch_id: BranchId
    revision: Revision
    object_states: Mapping[ObjectId, StateLabel] = field(default_factory=dict)
    metadata: Mapping[str, object] = field(default_factory=dict)


__all__ = ["ResearchStateSnapshot", "Revision", "StateLabel"]
