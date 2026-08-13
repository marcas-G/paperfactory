"""Core control-plane enumerations.

These are the first batch of global control enums shared by the whole
kernel. They are deliberately small and closed; do not add speculative
values here without a consuming contract that needs them.
"""

from __future__ import annotations

from enum import StrEnum


class GateStatus(StrEnum):
    """Outcome of evaluating a single Gate.

    The Controller MUST decide on ``status``, never by parsing ``message``
    text. Aggregation rules over multiple ``GateStatus`` values live in the
    Control Plane (see ``packages/control/gates.py``).
    """

    PASS = "PASS"
    FAIL = "FAIL"
    UNCERTAIN = "UNCERTAIN"
    BLOCKED = "BLOCKED"


class TransitionDecision(StrEnum):
    """Deterministic decision produced by the Transition Engine.

    COMMIT
        All required conditions hold; the transition may be committed.

    REJECT
        The transition is illegal, or at least one Gate explicitly FAILED.

    WAIT
        Not committed now because of UNCERTAIN / BLOCKED / pending approval.
        The proposal may be retried once the blocker resolves.
    """

    COMMIT = "COMMIT"
    REJECT = "REJECT"
    WAIT = "WAIT"


class ActorType(StrEnum):
    """Who initiated an Action / produced an Event."""

    USER = "USER"
    AGENT = "AGENT"
    SYSTEM = "SYSTEM"


class SideEffectLevel(StrEnum):
    """Reserved permission / side-effect severity ladder.

    Defined now so future contracts can reference it; the Permission Engine
    is NOT implemented in this step (STEP-002 §6.4).
    """

    NONE = "NONE"
    READ = "READ"
    INTERNAL_WRITE = "INTERNAL_WRITE"
    COMPUTE = "COMPUTE"
    EXTERNAL_WRITE = "EXTERNAL_WRITE"


__all__ = [
    "ActorType",
    "GateStatus",
    "SideEffectLevel",
    "TransitionDecision",
]
