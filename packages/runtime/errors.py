"""Agent Runtime error taxonomy (STEP-011 §49).

Root name is ``AgentRuntimeError`` to avoid collision with the Python
built-in ``RuntimeError``. Exception types encode failure category; messages
are human context only.
"""

from __future__ import annotations


class AgentRuntimeError(Exception):
    """Base class for all Agent Runtime failures."""


class RuntimeSessionNotFoundError(AgentRuntimeError):
    """A referenced RuntimeSession does not exist."""


class RuntimeRunNotFoundError(AgentRuntimeError):
    """A referenced RuntimeRun does not exist."""


class RuntimeAttemptNotFoundError(AgentRuntimeError):
    """A referenced ExecutionAttempt does not exist."""


class IllegalSessionTransitionError(AgentRuntimeError):
    """A RuntimeSession lifecycle transition is not legal.

    Also raised when attempting to modify a terminal session.
    """


class IllegalRunTransitionError(AgentRuntimeError):
    """A RuntimeRun lifecycle transition is not legal."""


class IllegalAttemptTransitionError(AgentRuntimeError):
    """An ExecutionAttempt lifecycle transition is not legal."""


class SessionBusyError(AgentRuntimeError):
    """A Session has non-terminal Runs and cannot be closed/cancelled."""


class RuntimeScopeMismatchError(AgentRuntimeError):
    """A Run's project/branch does not match its Session scope."""


class RuntimeInvariantViolationError(AgentRuntimeError):
    """A runtime invariant was violated (e.g. two active RUNNING attempts)."""


class DuplicateRuntimeObjectError(AgentRuntimeError):
    """A runtime object with the same ID already exists (save duplicate)."""


class RuntimeObjectNotFoundError(AgentRuntimeError):
    """An update was requested for an object that has not been saved yet."""


class ProviderExecutionError(AgentRuntimeError):
    """Base class for provider execution failures."""


class ProviderExecutionScopeError(ProviderExecutionError):
    """A ProviderExecutionRequest's scope does not match the Run/Attempt."""


class ProviderExecutionInputMismatchError(ProviderExecutionError):
    """The request's input_ref does not match the Run's input_ref."""


class ProviderExecutionStoreError(ProviderExecutionError):
    """A provider execution store operation failed."""



__all__ = [
    "AgentRuntimeError",
    "DuplicateRuntimeObjectError",
    "IllegalAttemptTransitionError",
    "IllegalRunTransitionError",
    "IllegalSessionTransitionError",
    "ProviderExecutionError",
    "ProviderExecutionInputMismatchError",
    "ProviderExecutionScopeError",
    "ProviderExecutionStoreError",
    "RuntimeObjectNotFoundError",
    "RuntimeAttemptNotFoundError",
    "RuntimeInvariantViolationError",
    "RuntimeRunNotFoundError",
    "RuntimeScopeMismatchError",
    "RuntimeSessionNotFoundError",
    "SessionBusyError",
]
