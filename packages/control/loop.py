"""Agent Loop budget & stop semantics — deterministic (STEP-016).

Constitution §15.10 (Explicit Stop): every loop must have explicit continue
and stop conditions plus budgets. This module is that contract, as pure data
and one pure function — no I/O, no engine access, no LLM.

Design rules:

    * ``LoopStopReason`` is a CLOSED enum — "why did the loop end" is always
      one of these, auditable via the LOOP_STOPPED event payload.
    * ``evaluate_stop`` check order is frozen (documented, tested):
        1. EXTERNAL_STOP     — injected stop flag (user / upstream)
        2. BRANCH_NOT_ACTIONABLE — no legal actions possible at all
        3. BUDGET_ITERATIONS — iteration count reached
        4. BUDGET_CONSECUTIVE_FAILURES — run is failing repeatedly
        5. BUDGET_TOTAL_FAILURES — run has failed too often overall
      (NO_CANDIDATES / UNPLANNED_ACTION are decided by the caller from
      policy output / plan lookup — they are not functions of counters.)
    * A loop that ends because there is nothing left to do (NO_CANDIDATES)
      is COMPLETED — a success. A loop ended by budget/branch/external is
      STOPPED. The distinction is deliberate: budget exhaustion is a
      watchdog event, never a research outcome.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from .errors import ControlError

if TYPE_CHECKING:
    from .policy import PolicyRecommendation


class LoopError(ControlError):
    """Base for agent-loop contract failures."""


class InvalidLoopBudgetError(LoopError):
    """A LoopBudget field is out of range."""


class LoopStopReason(StrEnum):
    """Closed set of reasons an agent loop ended (§33 auditability)."""

    NO_CANDIDATES = "NO_CANDIDATES"
    BUDGET_ITERATIONS = "BUDGET_ITERATIONS"
    BUDGET_CONSECUTIVE_FAILURES = "BUDGET_CONSECUTIVE_FAILURES"
    BUDGET_TOTAL_FAILURES = "BUDGET_TOTAL_FAILURES"
    BRANCH_NOT_ACTIONABLE = "BRANCH_NOT_ACTIONABLE"
    UNPLANNED_ACTION = "UNPLANNED_ACTION"
    EXTERNAL_STOP = "EXTERNAL_STOP"


@dataclass(frozen=True)
class LoopBudget:
    """Explicit resource ceilings (constitution §15.10).

    All limits are inclusive maximums and must be >= 1: a budget of 0 would
    mean "start a loop that may do nothing", which is expressed by not
    starting one.
    """

    max_iterations: int
    max_consecutive_failures: int
    max_total_failures: int

    def __post_init__(self) -> None:
        for name in (
            "max_iterations",
            "max_consecutive_failures",
            "max_total_failures",
        ):
            value = getattr(self, name)
            if not isinstance(value, int) or isinstance(value, bool):
                raise InvalidLoopBudgetError(f"{name} must be an int, got {value!r}")
            if value < 1:
                raise InvalidLoopBudgetError(f"{name} must be >= 1, got {value}")


@dataclass(frozen=True)
class LoopStopDecision:
    """Outcome of ``evaluate_stop`` — pure data, decided by code only."""

    should_stop: bool
    reason: LoopStopReason | None
    detail: str = ""

    def __post_init__(self) -> None:
        if self.should_stop and self.reason is None:
            raise LoopError("a stopping decision must carry a reason")
        if not self.should_stop and self.reason is not None:
            raise LoopError("a continue decision must not carry a reason")


_CONTINUE = LoopStopDecision(should_stop=False, reason=None)


def evaluate_stop(
    *,
    iteration: int,
    consecutive_failures: int,
    total_failures: int,
    budget: LoopBudget,
    branch_actionable: bool,
    stop_flag: bool = False,
) -> LoopStopDecision:
    """Frozen-order stop evaluation (see module docstring).

    ``iteration`` is the 1-based number of COMPLETED iterations.
    """
    if stop_flag:
        return LoopStopDecision(
            should_stop=True,
            reason=LoopStopReason.EXTERNAL_STOP,
            detail="stop flag raised",
        )
    if not branch_actionable:
        return LoopStopDecision(
            should_stop=True,
            reason=LoopStopReason.BRANCH_NOT_ACTIONABLE,
            detail="branch is not ACTIVE",
        )
    if iteration >= budget.max_iterations:
        return LoopStopDecision(
            should_stop=True,
            reason=LoopStopReason.BUDGET_ITERATIONS,
            detail=f"iteration {iteration} >= max {budget.max_iterations}",
        )
    if consecutive_failures >= budget.max_consecutive_failures:
        return LoopStopDecision(
            should_stop=True,
            reason=LoopStopReason.BUDGET_CONSECUTIVE_FAILURES,
            detail=(
                f"{consecutive_failures} consecutive failures "
                f">= max {budget.max_consecutive_failures}"
            ),
        )
    if total_failures >= budget.max_total_failures:
        return LoopStopDecision(
            should_stop=True,
            reason=LoopStopReason.BUDGET_TOTAL_FAILURES,
            detail=(
                f"{total_failures} total failures >= max {budget.max_total_failures}"
            ),
        )
    return _CONTINUE


class LoopRunStatus(StrEnum):
    """COMPLETED = ran out of (legal) work. STOPPED = watchdog tripped."""

    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    STOPPED = "STOPPED"


def status_for_stop_reason(reason: LoopStopReason) -> LoopRunStatus:
    """Map a stop reason onto the run status (frozen, tested)."""
    if reason is LoopStopReason.NO_CANDIDATES:
        return LoopRunStatus.COMPLETED
    return LoopRunStatus.STOPPED


@dataclass(frozen=True)
class LoopIterationRecord:
    """One executed loop iteration (STEP-016 audit trail).

    ``action_record`` is an opaque reference to the composition root's
    execution record — the control plane does not import the app layer.
    """

    iteration: int
    action_id: str
    action_type: str
    target_object_id: str
    committed: bool
    failure_kind: str | None
    recommendation: PolicyRecommendation | None = None
    action_record: object = None


@dataclass(frozen=True)
class LoopRunRecord:
    """The immutable, auditable record of one whole loop run."""

    project_id: str
    branch_id: str
    budget: LoopBudget
    status: LoopRunStatus
    stop_reason: LoopStopReason | None
    iterations: tuple[LoopIterationRecord, ...] = ()
    started_at: datetime | None = None
    completed_at: datetime | None = None
    metadata: dict = field(default_factory=dict)


__all__ = [
    "InvalidLoopBudgetError",
    "LoopBudget",
    "LoopError",
    "LoopIterationRecord",
    "LoopRunRecord",
    "LoopRunStatus",
    "LoopStopDecision",
    "LoopStopReason",
    "evaluate_stop",
    "status_for_stop_reason",
]
