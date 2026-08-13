"""M1 — Research Control Plane: deterministic transition kernel (STEP-002).

Public kernel surface:
    * errors      — ControlError taxonomy
    * actions     — ResearchActionDefinition / ResearchAction
    * gates       — GateResult + deterministic aggregation
    * proposals   — StateTransitionProposal
    * registry    — ActionRegistry
    * store       — StateStore Protocol (port)
    * engine      — TransitionEngine + assert_action_legal
    * controller  — ResearchController facade

The in-memory test adapter lives in ``packages.control.testing`` and is NOT
re-exported here (it is a test/dev concern, not a public control API).
"""

from __future__ import annotations

from .actions import ResearchAction, ResearchActionDefinition
from .controller import ResearchController
from .engine import TransitionEngine, assert_action_legal
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
from .proposals import StateTransitionProposal
from .registry import ActionRegistry
from .store import StateStore

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
    # store / engine / controller
    "StateStore",
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
