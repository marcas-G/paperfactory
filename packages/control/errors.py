"""Control-plane error taxonomy.

Domain control failures are expressed with these typed exceptions rather
than bare ``ValueError``. The exception *type* encodes the failure category;
the message is human-readable context only. Kept small on purpose
(STEP-002 §13).
"""

from __future__ import annotations


class ControlError(Exception):
    """Base class for all Research Control Plane failures."""


class IllegalActionError(ControlError):
    """An Action is not legal in the current state (wrong source state,
    missing target object, type mismatch, scope mismatch, ...)."""


class StaleStateError(ControlError):
    """A proposal's ``expected_revision`` does not match the current state
    revision — optimistic-concurrency guard tripped (STEP-002 §20)."""


class TransitionRejectedError(ControlError):
    """A transition was rejected by a Gate (at least one Gate FAILED) or
    otherwise cannot be committed."""


class InvariantViolationError(ControlError):
    """A transition would violate a kernel invariant (e.g. from_state
    mismatch, revision must increment by exactly one)."""


class ActionNotRegisteredError(ControlError):
    """A referenced action type has not been registered (subtype of
    IllegalActionError for finer handling)."""


class DuplicateActionError(ControlError):
    """An ActionDefinition with the same action_type was already registered."""


__all__ = [
    "ActionNotRegisteredError",
    "ControlError",
    "DuplicateActionError",
    "IllegalActionError",
    "InvariantViolationError",
    "StaleStateError",
    "TransitionRejectedError",
]
