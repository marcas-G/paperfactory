"""M4 — Research Domain contracts.

STEP-002 adds the *domain-agnostic primitives* shared by every future
Research Object and by the Control Plane:

    * typed identities (ids)
    * core control enums (GateStatus, TransitionDecision, ActorType,
      SideEffectLevel)
    * immutable DomainEvent contract
    * immutable ResearchStateSnapshot contract

Concrete research objects (ResearchProject, ResearchQuestion, Gap,
Hypothesis, ...) are NOT implemented yet — this layer stays
framework-independent (no FastAPI / SQLAlchemy / LLM SDKs).
"""

from __future__ import annotations

from .enums import ActorType, GateStatus, SideEffectLevel, TransitionDecision
from .events import ControlEvent, ControlEventType, DomainEvent
from .ids import (
    ActionId,
    ApprovalId,
    BlindingPolicyId,
    BranchId,
    CognitiveResultId,
    ContextBundleId,
    ContextItemId,
    ContextPolicyId,
    ContextRequestId,
    EventId,
    ExecutionAttemptId,
    MergeId,
    ObjectId,
    OutputCandidateId,
    OutputContractId,
    OutputSchemaId,
    OutputValidationId,
    PolicyEvaluationId,
    ProjectId,
    PromptPackageId,
    PromptPolicyId,
    PromptRequestId,
    PromptSegmentId,
    PromptTemplateId,
    ProposalId,
    ProviderExecutionRequestId,
    ProviderExecutionResponseId,
    RetrievalPolicyId,
    RetrievalRequirementId,
    RetrievalResolutionId,
    RunId,
    RuntimeArtifactId,
    RuntimeEventId,
    RuntimeRunId,
    RuntimeSessionId,
    TaskId,
)
from .models import ResearchStateSnapshot

__all__ = [
    # ids
    "ActionId",
    "ApprovalId",
    "BlindingPolicyId",
    "BranchId",
    "CognitiveResultId",
    "ContextBundleId",
    "ContextItemId",
    "ContextPolicyId",
    "ContextRequestId",
    "EventId",
    "MergeId",
    "ObjectId",
    "OutputCandidateId",
    "OutputContractId",
    "OutputSchemaId",
    "OutputValidationId",
    "PolicyEvaluationId",
    "ProjectId",
    "PromptPackageId",
    "PromptPolicyId",
    "PromptRequestId",
    "PromptSegmentId",
    "PromptTemplateId",
    "ProposalId",
    "RetrievalPolicyId",
    "RetrievalRequirementId",
    "RetrievalResolutionId",
    "ProviderExecutionRequestId",
    "ProviderExecutionResponseId",
    "RuntimeArtifactId",
    "RuntimeEventId",
    "RuntimeRunId",
    "RuntimeSessionId",
    "RunId",
    "TaskId",
    # enums
    "ActorType",
    "GateStatus",
    "SideEffectLevel",
    "TransitionDecision",
    # contracts
    "ControlEvent",
    "ControlEventType",
    "DomainEvent",
    "ResearchStateSnapshot",
]
