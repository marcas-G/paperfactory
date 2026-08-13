"""M1 — Research Control Plane: deterministic transition kernel + task /
approval control semantics + research branch control
(STEP-002 + STEP-003 + STEP-004).

Public kernel surface:
    * errors        — ControlError taxonomy
    * actions       — ResearchActionDefinition / ResearchAction
    * gates         — GateResult + deterministic aggregation
    * proposals     — StateTransitionProposal
    * registry      — ActionRegistry
    * tasks         — ResearchTask / TaskStatus
    * pending       — PendingTransition / PendingTransitionStatus
    * approvals     — ApprovalRequest / ApprovalStatus
    * branches      — ResearchBranch / BranchStatus / BranchForkPoint
    * merges        — BranchMergeProposal / MergeStatus / MergeConflict
    * engine        — TransitionEngine + TransitionExecutionResult
    * store         — StateStore / TaskStore / PendingTransitionStore /
                      ApprovalStore / BranchStore / ForkPointStore /
                      MergeStore / ControlEventSink Protocols
    * managers      — TaskManager / ApprovalManager / BranchManager
    * controller    — ResearchController facade

The in-memory test adapters live in ``packages.control.testing`` and are NOT
re-exported here (they are a test/dev concern, not a public control API).
"""

from __future__ import annotations

from .actions import ResearchAction, ResearchActionDefinition
from .approval_manager import ApprovalManager
from .approvals import ApprovalRequest, ApprovalStatus
from .branch_manager import BranchManager
from .branches import BranchForkPoint, BranchStatus, ResearchBranch
from .controller import ResearchController
from .engine import (
    TransitionEngine,
    TransitionExecutionResult,
    assert_action_legal,
)
from .errors import (
    ActionNotRegisteredError,
    BranchBusyError,
    BranchError,
    BranchMergeError,
    BranchNotFoundError,
    BranchScopeMismatchError,
    ControlError,
    CrossBranchDependencyError,
    DuplicateActionError,
    DuplicateBranchError,
    DuplicatePolicyCandidateError,
    IllegalActionError,
    IllegalBranchTransitionError,
    InvalidPolicyConfigError,
    InvalidPolicySignalError,
    InvariantViolationError,
    PolicyError,
    StaleStateError,
    TransitionRejectedError,
)
from .gates import GateResult, aggregate_gates
from .merges import BranchMergeProposal, MergeConflict, MergeStatus
from .pending import PendingTransition, PendingTransitionStatus
from .policy import (
    ActionPrioritySignals,
    ExcludedPolicyCandidate,
    PolicyCandidate,
    PolicyRecommendation,
    PolicyScoreComponents,
    PolicyStatus,
    PolicyWeights,
    RankedAction,
    ResearchPolicyConfig,
    score_candidate,
)
from .policy_engine import ResearchPolicyEngine
from .proposals import StateTransitionProposal
from .registry import ActionRegistry
from .store import (
    ApprovalStore,
    BranchStore,
    ControlEventSink,
    ForkPointStore,
    MergeStore,
    PendingTransitionStore,
    PolicyRecommendationStore,
    StateStore,
    TaskStore,
)
from .task_manager import TaskManager
from .tasks import ResearchTask, TaskStatus

__all__ = [
    # actions
    "ResearchAction",
    "ResearchActionDefinition",
    # gates
    "GateResult",
    "aggregate_gates",
    # proposals
    "StateTransitionProposal",
    # registry
    "ActionRegistry",
    # tasks
    "ResearchTask",
    "TaskStatus",
    # pending
    "PendingTransition",
    "PendingTransitionStatus",
    # approvals
    "ApprovalRequest",
    "ApprovalStatus",
    # branches
    "BranchForkPoint",
    "BranchStatus",
    "ResearchBranch",
    # merges
    "BranchMergeProposal",
    "MergeConflict",
    "MergeStatus",
    # policy
    "ActionPrioritySignals",
    "ExcludedPolicyCandidate",
    "PolicyCandidate",
    "PolicyRecommendation",
    "PolicyScoreComponents",
    "PolicyStatus",
    "PolicyWeights",
    "RankedAction",
    "ResearchPolicyConfig",
    "score_candidate",
    # engine result
    "TransitionExecutionResult",
    # ports
    "ApprovalStore",
    "BranchStore",
    "ControlEventSink",
    "ForkPointStore",
    "MergeStore",
    "PendingTransitionStore",
    "PolicyRecommendationStore",
    "StateStore",
    "TaskStore",
    # managers
    "ApprovalManager",
    "BranchManager",
    "ResearchPolicyEngine",
    "TaskManager",
    # engine / controller
    "TransitionEngine",
    "assert_action_legal",
    "ResearchController",
    # errors
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
