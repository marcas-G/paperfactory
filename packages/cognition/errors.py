"""Cognition-plane error taxonomy (STEP-006 §21).

Small, purposeful hierarchy. Exception types encode the failure category;
messages are human context only.
"""

from __future__ import annotations


class CognitionError(Exception):
    """Base class for all Cognitive Control Plane failures."""


class InvalidContextItemError(CognitionError):
    """A ContextItem is malformed (bad priority/tokens/content/scope)."""


class InvalidContextRequestError(CognitionError):
    """A ContextRequest is malformed (duplicate id, overlapping
    required/optional/forbidden sets, bad budget)."""


class InvalidContextPolicyError(CognitionError):
    """A ContextPolicy is malformed (bad layer order, version)."""


class RequiredContextMissingError(CognitionError):
    """A required ContextItem is not present among candidates."""


class RequiredContextBlindedError(CognitionError):
    """A required ContextItem is hidden by the BlindingPolicy.

    Blinding takes precedence over required inclusion (STEP-006 §27)."""


class RequiredContextScopeError(CognitionError):
    """A required ContextItem's scope does not match the request scope."""


class ContextBudgetExceededError(CognitionError):
    """Required items alone exceed the ContextBudget."""


class StaleContextRequestError(CognitionError):
    """The ContextRequest was built for a different state revision than the
    current one."""


class DuplicateContextItemError(CognitionError):
    """The same ContextItemId appears twice in one compilation's candidates."""


__all__ = [
    "CognitionError",
    "ContextBudgetExceededError",
    "DuplicateContextItemError",
    "InvalidContextItemError",
    "InvalidContextPolicyError",
    "InvalidContextRequestError",
    "RequiredContextBlindedError",
    "RequiredContextMissingError",
    "RequiredContextScopeError",
    "StaleContextRequestError",
]
