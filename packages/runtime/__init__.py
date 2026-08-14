"""M3 — Agent Runtime: deterministic lifecycle core (STEP-011).

First phase of M3. Establishes the execution lifecycle model:

    RuntimeSession (branch-scoped)
        → RuntimeRun (one logical execution)
            → ExecutionAttempt (one concrete attempt)

with pause/resume/cancel/timeout, failure taxonomy, RuntimeEvents
(distinct from Domain Events), store ports, and deterministic
managers. No provider execution, no LLM, no Temporal, no retry.

Public surface: RuntimeSessionManager, RuntimeRunManager, contracts,
RuntimeEvent/RuntimeEventType, and error taxonomy.
"""

from __future__ import annotations

from .agent import (
    AgentBindingManager,
    AgentDefinition,
    AgentDefinitionRegistry,
    AgentExecutionBinding,
    AgentExecutionBindingStore,
    AgentProviderExecutionRequestFactory,
    ModelExecutionProfile,
    ModelExecutionProfileRef,
    ModelExecutionProfileRegistry,
)
from .contracts import (
    ATTEMPT_TERMINAL,
    RUN_NON_TERMINAL,
    RUN_TERMINAL,
    SESSION_TERMINAL,
    AttemptStatus,
    ExecutionAttempt,
    RunStatus,
    RuntimeFailure,
    RuntimeFailureCategory,
    RuntimeInputRef,
    RuntimeOutputRef,
    RuntimeRun,
    RuntimeSession,
    RuntimeSessionStatus,
    RunWaitReason,
)
from .errors import (
    AgentAlreadyBoundError,
    AgentBindingScopeError,
    AgentBindingStoreError,
    AgentDefinitionError,
    AgentDefinitionNotFoundError,
    AgentExecutionProfileNotAllowedError,
    AgentRuntimeError,
    DuplicateRuntimeObjectError,
    IllegalAgentBindingStateError,
    IllegalAttemptTransitionError,
    IllegalRunTransitionError,
    IllegalSessionTransitionError,
    ModelExecutionProfileNotFoundError,
    ProviderExecutionError,
    ProviderExecutionInputMismatchError,
    ProviderExecutionScopeError,
    ProviderExecutionStoreError,
    RuntimeAttemptNotFoundError,
    RuntimeInvariantViolationError,
    RuntimeObjectNotFoundError,
    RuntimeRunNotFoundError,
    RuntimeScopeMismatchError,
    RuntimeSessionNotFoundError,
    SessionBusyError,
)
from .events import RuntimeEvent, RuntimeEventType
from .execution import RuntimeExecutionCoordinator
from .lifecycle import RuntimeRunManager, RuntimeSessionManager
from .provider import (
    ModelIdentifier,
    ProviderExecutionOutcome,
    ProviderExecutionOutcomeStatus,
    ProviderExecutionPort,
    ProviderExecutionRequest,
    ProviderExecutionResponse,
    ProviderIdentifier,
    ProviderUsage,
)
from .store import (
    ExecutionAttemptStore,
    ProviderExecutionRequestStore,
    ProviderExecutionResponseStore,
    RuntimeEventSink,
    RuntimeRunStore,
    RuntimeSessionStore,
)

__all__ = [
    # contracts
    "ATTEMPT_TERMINAL",
    "AttemptStatus",
    "ExecutionAttempt",
    "RUN_NON_TERMINAL",
    "RUN_TERMINAL",
    "RunStatus",
    "RunWaitReason",
    "RuntimeFailure",
    "RuntimeFailureCategory",
    "RuntimeInputRef",
    "RuntimeOutputRef",
    "RuntimeRun",
    "RuntimeSession",
    "RuntimeSessionStatus",
    "SESSION_TERMINAL",
    # agent definition / binding (STEP-013)
    "AgentBindingManager",
    "AgentDefinition",
    "AgentDefinitionRegistry",
    "AgentExecutionBinding",
    "AgentExecutionBindingStore",
    "AgentProviderExecutionRequestFactory",
    "ModelExecutionProfile",
    "ModelExecutionProfileRef",
    "ModelExecutionProfileRegistry",
    # provider execution
    "ModelIdentifier",
    "ProviderExecutionOutcome",
    "ProviderExecutionOutcomeStatus",
    "ProviderExecutionPort",
    "ProviderExecutionRequest",
    "ProviderExecutionResponse",
    "ProviderIdentifier",
    "ProviderUsage",
    "RuntimeExecutionCoordinator",
    # events
    "RuntimeEvent",
    "RuntimeEventType",
    # managers
    "RuntimeRunManager",
    "RuntimeSessionManager",
    # stores
    "ExecutionAttemptStore",
    "ProviderExecutionRequestStore",
    "ProviderExecutionResponseStore",
    "RuntimeEventSink",
    "RuntimeRunStore",
    "RuntimeSessionStore",
    # errors
    "AgentAlreadyBoundError",
    "AgentBindingScopeError",
    "AgentBindingStoreError",
    "AgentDefinitionError",
    "AgentDefinitionNotFoundError",
    "AgentExecutionProfileNotAllowedError",
    "AgentRuntimeError",
    "DuplicateRuntimeObjectError",
    "IllegalAgentBindingStateError",
    "IllegalAttemptTransitionError",
    "IllegalRunTransitionError",
    "IllegalSessionTransitionError",
    "ModelExecutionProfileNotFoundError",
    "RuntimeObjectNotFoundError",
    "RuntimeAttemptNotFoundError",
    "RuntimeInvariantViolationError",
    "RuntimeRunNotFoundError",
    "RuntimeScopeMismatchError",
    "RuntimeSessionNotFoundError",
    "SessionBusyError",
]
