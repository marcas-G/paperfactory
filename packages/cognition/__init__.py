"""M2 — Cognitive Control Plane (STEP-006 + STEP-007).

Deterministic, no LLM, no prompt, no semantic retrieval backend.

Context kernel (STEP-006) — *what an agent should see*:
    * CognitiveMode (FRAME/EXPLORE/MAP/COMPARE/FALSIFY/DIAGNOSE/
      DISCRIMINATE/VERIFY/SYNTHESIZE/DECIDE)
    * Context contracts: layers (GLOBAL/STATE/TASK), scopes
      (SYSTEM/PROJECT/BRANCH), protection tags, item types, items, sources
    * ContextPolicy / BlindingPolicy (versioned)
    * ContextRequest (revision-bound, explicit required/optional/forbidden)
    * ContextCompiler (validate -> scope -> blind -> require -> budget)
    * ContextBundle (immutable, item-boundary-preserving, auditable)

Retrieval (STEP-007) — *which items satisfy a declared need*:
    * ContextItemType (INSTRUCTION/STATE/EVIDENCE/.../NOTE)
    * RetrievalRequirement / RetrievalPolicy (versioned)
    * ContextCatalog port (read-only, enumerable)
    * RetrievalResolver (deterministic metadata-based resolution)
    * RetrievalResolution -> ContextRequest conversion

NOT implemented yet (later M2 steps): PromptPolicy / PromptAssembler,
semantic/vector retrieval, Memory, LLM, OutputValidator, agent execution.

The in-memory test adapters live in ``packages.cognition.testing`` and are NOT
re-exported here.
"""

from __future__ import annotations

from .clock import TimeProvider  # re-exported for compiler/resolver callers
from .compiler import ContextCompiler
from .context import (
    ContextBudget,
    ContextBundle,
    ContextItem,
    ContextItemType,
    ContextLayer,
    ContextProtectionTag,
    ContextRequest,
    ContextScope,
    ContextSourceRef,
    ExcludedContextItem,
    ExcludedContextReason,
    is_bundle_current,
    is_request_current,
)
from .errors import (
    CognitionError,
    ContextBudgetExceededError,
    DuplicateContextItemError,
    DuplicateRetrievalRequirementError,
    InvalidContextItemError,
    InvalidContextPolicyError,
    InvalidContextRequestError,
    InvalidRetrievalPolicyError,
    InvalidRetrievalRequirementError,
    RequiredContextBlindedError,
    RequiredContextMissingError,
    RequiredContextScopeError,
    RequiredRetrievalRequirementUnsatisfiedError,
    RetrievalError,
    StaleContextRequestError,
)
from .modes import CognitiveMode
from .policies import COMPILER_VERSION, BlindingPolicy, ContextPolicy
from .retrieval import (
    RESOLVER_VERSION,
    RequirementResolution,
    RetrievalDeduplicationStrategy,
    RetrievalExclusion,
    RetrievalExclusionReason,
    RetrievalPolicy,
    RetrievalRequirement,
    RetrievalResolution,
)
from .retrieval_engine import RetrievalResolver
from .store import ContextBundleStore, ContextCatalog, RetrievalResolutionStore

__all__ = [
    # modes
    "CognitiveMode",
    # context contracts
    "ContextBudget",
    "ContextBundle",
    "ContextItem",
    "ContextItemType",
    "ContextLayer",
    "ContextProtectionTag",
    "ContextRequest",
    "ContextScope",
    "ContextSourceRef",
    "ExcludedContextItem",
    "ExcludedContextReason",
    "is_bundle_current",
    "is_request_current",
    # policies
    "COMPILER_VERSION",
    "BlindingPolicy",
    "ContextPolicy",
    # compiler / stores
    "ContextBundleStore",
    "ContextCatalog",
    "ContextCompiler",
    "RetrievalResolutionStore",
    "TimeProvider",
    # retrieval contracts
    "RESOLVER_VERSION",
    "RequirementResolution",
    "RetrievalDeduplicationStrategy",
    "RetrievalExclusion",
    "RetrievalExclusionReason",
    "RetrievalPolicy",
    "RetrievalRequirement",
    "RetrievalResolution",
    "RetrievalResolver",
    # errors
    "CognitionError",
    "ContextBudgetExceededError",
    "DuplicateContextItemError",
    "DuplicateRetrievalRequirementError",
    "InvalidContextItemError",
    "InvalidContextPolicyError",
    "InvalidContextRequestError",
    "InvalidRetrievalPolicyError",
    "InvalidRetrievalRequirementError",
    "RequiredContextBlindedError",
    "RequiredContextMissingError",
    "RequiredContextScopeError",
    "RequiredRetrievalRequirementUnsatisfiedError",
    "RetrievalError",
    "StaleContextRequestError",
]
