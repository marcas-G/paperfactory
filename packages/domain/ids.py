"""Typed identity primitives for the Research Agent Platform.

These NewType wrappers prevent the kernel from propagating bare ``str``
identifiers across module/function boundaries (e.g. accidentally passing a
``ProjectId`` where a ``BranchId`` is expected). They carry zero runtime
overhead and introduce no UUID abstraction, no ID generator, and no base
entity inheritance — deliberately, per STEP-002 §5.

Construction is intentionally just ``ProjectId("...")``. Generation policy
(UUID v4, ULID, DB sequence, ...) is a persistence/adapter concern and is
NOT defined here.
"""

from __future__ import annotations

from typing import NewType

# --- Aggregate / scope identities ---------------------------------------
ProjectId = NewType("ProjectId", str)
"""Stable identity of a Research Project (the largest aggregate scope)."""

BranchId = NewType("BranchId", str)
"""Identity of a Research Branch within a project (main / H1 / H2 / ...)."""

# --- Object identities --------------------------------------------------
ObjectId = NewType("ObjectId", str)
"""Identity of a single Research Object instance within a branch."""

# --- Control-plane identities -------------------------------------------
ActionId = NewType("ActionId", str)
"""Identity of a concrete Action instance (an executed action, not a type)."""

TaskId = NewType("TaskId", str)
"""Identity of a Research Task (Control-plane DAG node)."""

ProposalId = NewType("ProposalId", str)
"""Identity of a (pending or committed) State Transition Proposal."""

ApprovalId = NewType("ApprovalId", str)
"""Identity of an ApprovalRequest (Human-in-the-loop decision)."""

MergeId = NewType("MergeId", str)
"""Identity of a BranchMergeProposal (merge preparation record)."""

PolicyEvaluationId = NewType("PolicyEvaluationId", str)
"""Identity of one Policy evaluation (a PolicyRecommendation record)."""

# --- Cognition identities (STEP-006) -----------------------------------
ContextItemId = NewType("ContextItemId", str)
"""Identity of one ContextItem (a cognitive projection, not a state object)."""

ContextRequestId = NewType("ContextRequestId", str)
"""Identity of one ContextRequest."""

ContextBundleId = NewType("ContextBundleId", str)
"""Identity of one compiled ContextBundle."""

ContextPolicyId = NewType("ContextPolicyId", str)
"""Identity of a ContextPolicy version-family."""

BlindingPolicyId = NewType("BlindingPolicyId", str)
"""Identity of a BlindingPolicy version-family."""

# --- Retrieval identities (STEP-007) -----------------------------------
RetrievalRequirementId = NewType("RetrievalRequirementId", str)
"""Identity of one RetrievalRequirement within a resolution."""

RetrievalPolicyId = NewType("RetrievalPolicyId", str)
"""Identity of a RetrievalPolicy version-family."""

RetrievalResolutionId = NewType("RetrievalResolutionId", str)
"""Identity of one RetrievalResolution."""

# --- Prompt identities (STEP-008) --------------------------------------
PromptTemplateId = NewType("PromptTemplateId", str)
"""Identity of a PromptTemplate version-family."""

PromptPolicyId = NewType("PromptPolicyId", str)
"""Identity of a PromptPolicy version-family."""

PromptRequestId = NewType("PromptRequestId", str)
"""Identity of one PromptRequest."""

PromptPackageId = NewType("PromptPackageId", str)
"""Identity of one compiled PromptPackage."""

PromptSegmentId = NewType("PromptSegmentId", str)
"""Identity of one PromptSegment within a package."""

# --- Structured output identities (STEP-010) ---------------------------
OutputContractId = NewType("OutputContractId", str)
"""Identity of an OutputContract version-family."""

OutputSchemaId = NewType("OutputSchemaId", str)
"""Identity of a logical output schema version-family."""

OutputCandidateId = NewType("OutputCandidateId", str)
"""Identity of one StructuredOutputCandidate (an untrusted model output)."""

OutputValidationId = NewType("OutputValidationId", str)
"""Identity of one OutputValidationResult."""

CognitiveResultId = NewType("CognitiveResultId", str)
"""Identity of one validated CognitiveResultEnvelope."""

# --- Runtime identities (STEP-011) -------------------------------------
RuntimeSessionId = NewType("RuntimeSessionId", str)
"""Identity of one RuntimeSession."""

RuntimeRunId = NewType("RuntimeRunId", str)
"""Identity of one RuntimeRun (distinct from M1 TaskId/RunId)."""

ExecutionAttemptId = NewType("ExecutionAttemptId", str)
"""Identity of one ExecutionAttempt within a Run."""

RuntimeEventId = NewType("RuntimeEventId", str)
"""Identity of one RuntimeEvent."""

RuntimeArtifactId = NewType("RuntimeArtifactId", str)
"""Identity of a Runtime artifact (reserved for future use)."""

RunId = NewType("RunId", str)
"""Identity of an Agent Run. Reserved for the runtime layer."""

# --- Audit identity -----------------------------------------------------
EventId = NewType("EventId", str)
"""Identity of a Domain Event (immutable fact record)."""


__all__ = [
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
    "ExecutionAttemptId",
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
    "RuntimeArtifactId",
    "RuntimeEventId",
    "RuntimeRunId",
    "RuntimeSessionId",
    "RunId",
    "TaskId",
]
