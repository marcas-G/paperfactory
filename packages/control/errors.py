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


# --- Branch errors (STEP-004 §30) --------------------------------------
class BranchError(ControlError):
    """Base class for Research Branch control failures."""


class BranchNotFoundError(BranchError):
    """A referenced branch does not exist."""


class IllegalBranchTransitionError(BranchError):
    """A branch lifecycle transition is not legal (e.g. reviving a terminal
    branch, transitioning from a terminal state)."""


class DuplicateBranchError(BranchError):
    """A branch with the same identity already exists (e.g. a second main
    branch for a project — BR-INV-01)."""


class BranchBusyError(BranchError):
    """A branch has RUNNING tasks and cannot be paused / archived / rejected
    (STEP-004 §38)."""


class CrossBranchDependencyError(BranchError):
    """A task dependency crosses branch boundaries (STEP-004 §20)."""


class BranchScopeMismatchError(BranchError):
    """An object (task/approval/pending transition) does not belong to the
    branch it is being applied to (STEP-004 §20/§21/§22)."""


class BranchMergeError(BranchError):
    """A merge precondition failed or a merge operation is illegal."""


# --- Policy errors (STEP-005 §35) --------------------------------------
class PolicyError(ControlError):
    """Base class for Research Policy failures."""


class InvalidPolicySignalError(PolicyError):
    """A priority signal value is outside [0, 1] or is NaN/inf."""


class InvalidPolicyConfigError(PolicyError):
    """A PolicyConfig is invalid (e.g. all weights zero, negative weight)."""


class DuplicatePolicyCandidateError(PolicyError):
    """The same action_id appears more than once in one evaluation input."""


__all__ = [
    "ActionNotRegisteredError",
    "BranchBusyError",
    "BranchError",
    "BranchMergeError",
    "BranchNotFoundError",
    "BranchScopeMismatchError",
    "ControlError",
    "CrossBranchDependencyError",
    "DuplicateActionError",
    "DuplicateBranchError",
    "DuplicatePolicyCandidateError",
    "IllegalActionError",
    "IllegalBranchTransitionError",
    "InvariantViolationError",
    "InvalidPolicyConfigError",
    "InvalidPolicySignalError",
    "PolicyError",
    "StaleStateError",
    "TransitionRejectedError",
]
