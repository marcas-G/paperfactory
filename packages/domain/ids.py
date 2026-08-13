"""Typed identity primitives for the Research Agent Platform.

These NewType wrappers prevent the kernel from propagating bare ``str``
identifiers across module/function boundaries (e.g. accidentally passing a
``ProjectId`` where a ``BranchId`` is expected). They carry zero runtime
overhead and introduce no UUID abstraction, no ID generator, and no base
entity inheritance — deliberately, per STEP-002 §5.

Construction is intentionally just ``ProjectId("...")``. Generation policy
(UUID v4, ULID, DB sequence, ...) is a persistence/adapter concern and is
NOT defined here.
"""

from __future__ import annotations

from typing import NewType

# --- Aggregate / scope identities ---------------------------------------
ProjectId = NewType("ProjectId", str)
"""Stable identity of a Research Project (the largest aggregate scope)."""

BranchId = NewType("BranchId", str)
"""Identity of a Research Branch within a project (main / H1 / H2 / ...)."""

# --- Object identities --------------------------------------------------
ObjectId = NewType("ObjectId", str)
"""Identity of a single Research Object instance within a branch."""

# --- Control-plane identities -------------------------------------------
ActionId = NewType("ActionId", str)
"""Identity of a concrete Action instance (an executed action, not a type)."""

TaskId = NewType("TaskId", str)
"""Identity of a Research Task (DAG node). Reserved for later steps."""

RunId = NewType("RunId", str)
"""Identity of an Agent Run. Reserved for the runtime layer."""

# --- Audit identity -----------------------------------------------------
EventId = NewType("EventId", str)
"""Identity of a Domain Event (immutable fact record)."""


__all__ = [
    "ActionId",
    "BranchId",
    "EventId",
    "ObjectId",
    "ProjectId",
    "RunId",
    "TaskId",
]
