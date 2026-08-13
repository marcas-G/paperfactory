"""M1 — Research Control Plane: deterministic transition kernel + task /
approval control semantics (STEP-002 + STEP-003).

Public kernel surface:
    * errors        — ControlError taxonomy
    * actions       — ResearchActionDefinition / ResearchAction
    * gates         — GateResult + deterministic aggregation
    * proposals     — StateTransitionProposal
    * registry      — ActionRegistry
    * tasks         — ResearchTask / TaskStatus
    * pending       — PendingTransition / PendingTransitionStatus
    * approvals     — ApprovalRequest / ApprovalStatus
    * engine        — TransitionEngine + TransitionExecutionResult
    * store         — StateStore / TaskStore / PendingTransitionStore /
                      ApprovalStore / ControlEventSink Protocols
    * managers      — TaskManager / ApprovalManager
    * controller    — ResearchController facade

The in-memory test adapters live in ``packages.control.testing`` and are NOT
re-exported here (they are a test/dev concern, not a public control API).
"""

from __future__ import annotations

from .actions import ResearchAction, ResearchActionDefinition
from .approval_manager import ApprovalManager
from .approvals import ApprovalRequest, ApprovalStatus
from .controller import ResearchController
from .engine import (
    TransitionEngine,
    TransitionExecutionResult,
    assert_action_legal,
)
from .errors import (
    ActionNotRegisteredError,
    ControlError,
    DuplicateActionError,
    IllegalActionError,
    InvariantViolationError,
    StaleStateError,
    TransitionRejectedError,
)
from .gates import GateResult, aggregate_gates
from .pending import PendingTransition, PendingTransitionStatus
from .proposals import StateTransitionProposal
from .registry import ActionRegistry
from .store import (
    ApprovalStore,
    ControlEventSink,
    PendingTransitionStore,
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
    # engine result
    "TransitionExecutionResult",
    # ports
    "ApprovalStore",
    "ControlEventSink",
    "PendingTransitionStore",
    "StateStore",
    "TaskStore",
    # managers
    "ApprovalManager",
    "TaskManager",
    # engine / controller
    "TransitionEngine",
    "assert_action_legal",
    "ResearchController",
    # errors
    "ActionNotRegisteredError",
    "ControlError",
    "DuplicateActionError",
    "IllegalActionError",
    "InvariantViolationError",
    "StaleStateError",
    "TransitionRejectedError",
]
