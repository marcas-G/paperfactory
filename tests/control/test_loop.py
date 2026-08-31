"""STEP-016 — loop budget & stop-semantics tests.

LOOP-001..014: budget validation, evaluate_stop reason matrix, status
mapping, record invariants.
"""

from __future__ import annotations

import pytest

from packages.control import (
    InvalidLoopBudgetError,
    LoopBudget,
    LoopError,
    LoopRunRecord,
    LoopRunStatus,
    LoopStopDecision,
    LoopStopReason,
    evaluate_stop,
    status_for_stop_reason,
)

BUDGET = LoopBudget(max_iterations=5, max_consecutive_failures=2, max_total_failures=4)


# =========================================================================
# LOOP-001..004 — budget validation
# =========================================================================
def test_loop_001_budget_requires_positive_limits() -> None:
    assert BUDGET.max_iterations == 5


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("max_iterations", 0),
        ("max_consecutive_failures", 0),
        ("max_total_failures", -1),
    ],
)
def test_loop_002_invalid_budget_rejected(field: str, value: int) -> None:
    kwargs = {
        "max_iterations": 3,
        "max_consecutive_failures": 2,
        "max_total_failures": 3,
    }
    kwargs[field] = value
    with pytest.raises(InvalidLoopBudgetError):
        LoopBudget(**kwargs)


def test_loop_003_bool_budget_rejected() -> None:
    with pytest.raises(InvalidLoopBudgetError):
        LoopBudget(max_iterations=True, max_consecutive_failures=1, max_total_failures=1)  # type: ignore[arg-type]


# =========================================================================
# LOOP-004..011 — evaluate_stop reason matrix (frozen order)
# =========================================================================
def test_loop_004_continue_when_healthy() -> None:
    d = evaluate_stop(
        iteration=1, consecutive_failures=0, total_failures=0,
        budget=BUDGET, branch_actionable=True,
    )
    assert d.should_stop is False
    assert d.reason is None


def test_loop_005_external_stop_wins_over_everything() -> None:
    d = evaluate_stop(
        iteration=99, consecutive_failures=99, total_failures=99,
        budget=BUDGET, branch_actionable=False, stop_flag=True,
    )
    assert d.reason is LoopStopReason.EXTERNAL_STOP


def test_loop_006_branch_not_actionable_beats_budgets() -> None:
    d = evaluate_stop(
        iteration=99, consecutive_failures=99, total_failures=0,
        budget=BUDGET, branch_actionable=False,
    )
    assert d.reason is LoopStopReason.BRANCH_NOT_ACTIONABLE


def test_loop_007_iteration_budget() -> None:
    d = evaluate_stop(
        iteration=5, consecutive_failures=0, total_failures=0,
        budget=BUDGET, branch_actionable=True,
    )
    assert d.reason is LoopStopReason.BUDGET_ITERATIONS
    # one below the limit continues
    d2 = evaluate_stop(
        iteration=4, consecutive_failures=0, total_failures=0,
        budget=BUDGET, branch_actionable=True,
    )
    assert d2.should_stop is False


def test_loop_008_consecutive_failure_budget() -> None:
    d = evaluate_stop(
        iteration=1, consecutive_failures=2, total_failures=2,
        budget=BUDGET, branch_actionable=True,
    )
    assert d.reason is LoopStopReason.BUDGET_CONSECUTIVE_FAILURES


def test_loop_009_total_failure_budget() -> None:
    d = evaluate_stop(
        iteration=1, consecutive_failures=1, total_failures=4,
        budget=BUDGET, branch_actionable=True,
    )
    assert d.reason is LoopStopReason.BUDGET_TOTAL_FAILURES


def test_loop_010_iteration_checked_before_failures() -> None:
    # both iteration and consecutive budgets exceeded: iteration wins
    d = evaluate_stop(
        iteration=5, consecutive_failures=2, total_failures=0,
        budget=BUDGET, branch_actionable=True,
    )
    assert d.reason is LoopStopReason.BUDGET_ITERATIONS


def test_loop_011_consecutive_before_total() -> None:
    d = evaluate_stop(
        iteration=1, consecutive_failures=2, total_failures=4,
        budget=BUDGET, branch_actionable=True,
    )
    assert d.reason is LoopStopReason.BUDGET_CONSECUTIVE_FAILURES


# =========================================================================
# LOOP-012..014 — decision invariants & status mapping
# =========================================================================
def test_loop_012_stop_requires_reason() -> None:
    with pytest.raises(LoopError):
        LoopStopDecision(should_stop=True, reason=None)


def test_loop_013_continue_has_no_reason() -> None:
    with pytest.raises(LoopError):
        LoopStopDecision(should_stop=False, reason=LoopStopReason.EXTERNAL_STOP)


def test_loop_014_status_mapping() -> None:
    assert status_for_stop_reason(LoopStopReason.NO_CANDIDATES) is LoopRunStatus.COMPLETED
    for reason in (
        LoopStopReason.BUDGET_ITERATIONS,
        LoopStopReason.BUDGET_CONSECUTIVE_FAILURES,
        LoopStopReason.BUDGET_TOTAL_FAILURES,
        LoopStopReason.BRANCH_NOT_ACTIONABLE,
        LoopStopReason.UNPLANNED_ACTION,
        LoopStopReason.EXTERNAL_STOP,
    ):
        assert status_for_stop_reason(reason) is LoopRunStatus.STOPPED


def test_loop_015_run_record_defaults() -> None:
    record = LoopRunRecord(
        project_id="p", branch_id="b", budget=BUDGET,
        status=LoopRunStatus.COMPLETED, stop_reason=LoopStopReason.NO_CANDIDATES,
    )
    assert record.iterations == ()
    assert record.started_at is None
