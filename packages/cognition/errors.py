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


# --- Retrieval errors (STEP-007 §34/§35) -------------------------------
class RetrievalError(CognitionError):
    """Base class for context retrieval failures."""


class InvalidRetrievalRequirementError(RetrievalError):
    """A RetrievalRequirement is malformed (empty sets, bad counts, etc.)."""


class InvalidRetrievalPolicyError(RetrievalError):
    """A RetrievalPolicy is malformed."""


class DuplicateRetrievalRequirementError(RetrievalError):
    """The same requirement_id appears twice in one resolution input."""


class RequiredRetrievalRequirementUnsatisfiedError(RetrievalError):
    """A required RetrievalRequirement could not reach its minimum_count.

    Carries the requirement_id, minimum_count and actual_count so callers can
    report precisely (STEP-007 §34).
    """

    def __init__(
        self,
        *,
        requirement_id: str,
        minimum_count: int,
        actual_count: int,
    ) -> None:
        self.requirement_id = requirement_id
        self.minimum_count = minimum_count
        self.actual_count = actual_count
        super().__init__(
            f"required requirement {requirement_id!r} unsatisfied: "
            f"minimum={minimum_count}, actual={actual_count}"
        )


# --- Prompt errors (STEP-008 §14/§24/§25) ------------------------------
class PromptError(CognitionError):
    """Base class for prompt policy / assembly failures."""


class PromptTemplateError(PromptError):
    """A PromptTemplate is malformed or a render could not be completed."""


class PromptTemplateVariableError(PromptTemplateError):
    """Variables provided to a template do not exactly cover its declared set."""


class InvalidPromptPolicyError(PromptError):
    """A PromptPolicy is malformed (missing mode template, bad precedence)."""


class InvalidPromptRequestError(PromptError):
    """A PromptRequest is malformed (empty objective, dup constraints, naive dt)."""


class PromptContextMismatchError(PromptError):
    """A PromptRequest and its ContextBundle disagree on scope/revision/..."""


class StalePromptRequestError(PromptError):
    """A PromptRequest was built for a different state revision than current."""


# --- Provider projection errors (STEP-009) -----------------------------
class ProviderProjectionError(CognitionError):
    """Base class for provider prompt projection failures."""


class InvalidPromptPackageForProjectionError(ProviderProjectionError):
    """A PromptPackage is malformed/contradictory for projection (bad
    trust/kind/authority/order combination). Projection fails closed."""


class UnknownProviderError(ProviderProjectionError):
    """An unsupported ProviderKind was requested."""


class UnknownSegmentKindError(ProviderProjectionError):
    """A PromptSegmentKind not understood by the projector."""


# --- Structured output validation errors (STEP-010 §44) ----------------
class OutputValidationError(CognitionError):
    """Base class for structured output validation failures."""


class InvalidOutputContractError(OutputValidationError):
    """An OutputContract is malformed."""


class DuplicateOutputContractError(OutputValidationError):
    """(contract_id, version) already registered."""


class DuplicateOutputValidatorError(OutputValidationError):
    """(schema_id, version) already registered."""


class OutputCandidateMismatchError(OutputValidationError):
    """A StructuredOutputCandidate disagrees with its PromptPackage."""


class StaleOutputCandidateError(OutputValidationError):
    """A candidate's state_revision does not match the current revision."""


class OutputContractNotFoundError(OutputValidationError):
    """The referenced OutputContract is not in the registry (system error)."""


class OutputValidatorNotFoundError(OutputValidationError):
    """No validator is registered for the contract's schema_ref (system error)."""


class InvalidSchemaValidationOutcomeError(OutputValidationError):
    """A validator returned a contradictory SchemaValidationOutcome."""


__all__ = [
    "CognitionError",
    "ContextBudgetExceededError",
    "DuplicateContextItemError",
    "DuplicateOutputContractError",
    "DuplicateOutputValidatorError",
    "DuplicateRetrievalRequirementError",
    "InvalidContextItemError",
    "InvalidContextPolicyError",
    "InvalidContextRequestError",
    "InvalidOutputContractError",
    "InvalidPromptPackageForProjectionError",
    "InvalidPromptPolicyError",
    "InvalidPromptRequestError",
    "InvalidRetrievalPolicyError",
    "InvalidRetrievalRequirementError",
    "InvalidSchemaValidationOutcomeError",
    "OutputCandidateMismatchError",
    "OutputContractNotFoundError",
    "OutputValidationError",
    "OutputValidatorNotFoundError",
    "PromptContextMismatchError",
    "PromptError",
    "PromptTemplateError",
    "PromptTemplateVariableError",
    "ProviderProjectionError",
    "RequiredContextBlindedError",
    "RequiredContextMissingError",
    "RequiredContextScopeError",
    "RequiredRetrievalRequirementUnsatisfiedError",
    "RetrievalError",
    "StaleContextRequestError",
    "StaleOutputCandidateError",
    "StalePromptRequestError",
    "UnknownProviderError",
    "UnknownSegmentKindError",
]
