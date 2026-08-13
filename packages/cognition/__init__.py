"""M2 — Cognitive Control Plane: cognitive context kernel (STEP-006).

First phase of M2. Establishes *what an agent should see* — deterministic,
no LLM, no prompt, no retrieval backend:

    * CognitiveMode (FRAME/EXPLORE/MAP/COMPARE/FALSIFY/DIAGNOSE/
      DISCRIMINATE/VERIFY/SYNTHESIZE/DECIDE)
    * Context contracts: layers (GLOBAL/STATE/TASK), scopes
      (SYSTEM/PROJECT/BRANCH), protection tags, items, source refs
    * ContextPolicy / BlindingPolicy (versioned)
    * ContextRequest (revision-bound, explicit required/optional/forbidden)
    * ContextCompiler (validate -> scope -> blind -> require -> budget)
    * ContextBundle (immutable, item-boundary-preserving, auditable)

NOT implemented yet (later M2 steps): PromptPolicy / PromptAssembler,
RetrievalPolicy / semantic retrieval, Memory, LLM, OutputValidator, agent
execution.

The in-memory test adapter lives in ``packages.cognition.testing`` and is NOT
re-exported here.
"""

from __future__ import annotations

from .clock import TimeProvider  # re-exported for compiler callers
from .compiler import ContextCompiler
from .context import (
    ContextBudget,
    ContextBundle,
    ContextItem,
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
    InvalidContextItemError,
    InvalidContextPolicyError,
    InvalidContextRequestError,
    RequiredContextBlindedError,
    RequiredContextMissingError,
    RequiredContextScopeError,
    StaleContextRequestError,
)
from .modes import CognitiveMode
from .policies import COMPILER_VERSION, BlindingPolicy, ContextPolicy
from .store import ContextBundleStore

__all__ = [
    # modes
    "CognitiveMode",
    # context contracts
    "ContextBudget",
    "ContextBundle",
    "ContextItem",
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
    # compiler / store
    "ContextBundleStore",
    "ContextCompiler",
    "TimeProvider",
    # errors
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
