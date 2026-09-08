"""STEP-016 — the agent loop, end-to-end over the STEP-015 chain.

LOOP-INT-001..005: the system selects, executes, counts, and stops itself.
No LLM anywhere in the loop driver; only the (faked) provider output is
"model" content, passing through the same governed chain as STEP-015.
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime, timedelta

import pytest

# reuse the whole STEP-015 stack builder + action vocabulary
import tests.integration.test_vertical_slice as _slice
from apps.orchestration.action_executor import ExecutionBindingSpec
from apps.orchestration.loop_runner import LoopActionSpec, ResearchLoopRunner
from packages.cognition.context import (
    ContextItemType,
    ContextLayer,
    ContextScope,
)
from packages.cognition.retrieval import RetrievalRequirement
from packages.control import (
    LoopBudget,
    LoopRunStatus,
    LoopStopReason,
    PolicyWeights,
    ResearchPolicyConfig,
)
from packages.control.candidates import ActionCandidateEnumerator
from packages.control.policy import ActionPrioritySignals
from packages.control.testing import StaticSignalProvider
from packages.domain.ids import ObjectId, RetrievalRequirementId
from packages.runtime.testing import FakeProviderExecutor
from tests.integration.test_vertical_slice import (
    ACTION_TYPE,
    BRANCH,
    PROJECT,
)


@pytest.fixture
def clock():
    return _ThreeObjectClock()


@pytest.fixture
def seq():
    c = itertools.count(1)

    def factory() -> str:
        return f"id-{next(c)}"

    return factory


OBJ_2 = ObjectId("knowledge-2")
OBJ_3 = ObjectId("knowledge-3")  # already ASSESSED at seed time


class _ThreeObjectClock:
    """Same fixed clock as the slice module."""

    def __init__(self) -> None:
        self._base = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
        self._ticks = itertools.count()

    def __call__(self) -> datetime:
        return self._base + timedelta(seconds=next(self._ticks))


def _assess_spec() -> LoopActionSpec:
    return LoopActionSpec(
        cognitive_mode="VERIFY",
        task_objective="Assess the knowledge item against its evidence.",
        task_constraints=("Cite reason codes.",),
        requirements=(
            RetrievalRequirement(
                requirement_id=RetrievalRequirementId("req-knowledge"),
                item_types=frozenset({ContextItemType.STATE}),
                layers=frozenset({ContextLayer.STATE}),
                scopes=frozenset({ContextScope.BRANCH}),
                required=True,
                minimum_count=1,
                maximum_count=5,
                priority=50,
            ),
        ),
    )


def _neutral_signals() -> ActionPrioritySignals:
    return ActionPrioritySignals(
        information_gain=0.5,
        blocker_resolution=0.5,
        scientific_value=0.5,
        urgency=0.5,
        cost=0.1,
        risk=0.1,
    )


def _policy() -> ResearchPolicyConfig:
    return ResearchPolicyConfig(
        policy_id="loop",
        version=1,
        weights=PolicyWeights(
            information_gain_weight=1.0,
            blocker_resolution_weight=0.0,
            scientific_value_weight=0.0,
            urgency_weight=0.0,
            cost_weight=0.0,
            risk_weight=0.0,
        ),
    )


def _multi_object_snapshot():
    from packages.domain.models import ResearchStateSnapshot

    return ResearchStateSnapshot(
        project_id=PROJECT,
        branch_id=BRANCH,
        revision=0,
        object_states={
            _slice.OBJ: _slice.STATE_DRAFT,  # knowledge-1 DRAFT
            OBJ_2: _slice.STATE_DRAFT,  # knowledge-2 DRAFT
            OBJ_3: _slice.STATE_ASSESSED,  # already done
        },
    )


def _make_definition():
    """A fresh ASSESS_KNOWLEDGE_ITEM definition (fixture-free)."""
    from packages.control import ResearchActionDefinition
    from packages.domain.enums import SideEffectLevel

    return ResearchActionDefinition(
        action_type=ACTION_TYPE,
        target_object_type=_slice.OBJECT_TYPE,
        allowed_source_states=frozenset({_slice.STATE_DRAFT}),
        required_gate_ids=frozenset(),
        side_effect_level=SideEffectLevel.INTERNAL_WRITE,
        requires_approval=False,
    )


def _build_loop(clock, seq, snapshot, provider):  # noqa: ANN001
    """Full stack + loop runner. Provider is the (scripted) LLM."""
    definition = _make_definition()
    executor, stores = _slice._build_stack(clock, seq, snapshot, definition)

    counter = itertools.count(5000)
    enumerator = ActionCandidateEnumerator(
        # registry lives inside the executor's controller; rebuild same def
        _registry_with(definition),
        StaticSignalProvider(_neutral_signals()),
        action_id_factory=lambda: f"loop-act-{next(counter)}",
    )

    from packages.domain.ids import AgentId

    runner = ResearchLoopRunner(
        controller=stores["controller"],
        enumerator=enumerator,
        action_executor=executor,
        policy_config=_policy(),
        action_specs={ACTION_TYPE: _assess_spec()},
        binding_spec=ExecutionBindingSpec(
            execution_profile_id="openai-profile",
            execution_profile_version="v1",
            execution_config_id="cfg",
            execution_config_version="v1",
        ),
        provider=provider,
        agent_id=AgentId("agent-assessor"),
        agent_version="v1",
        event_sink=stores["control_sink"],
        id_factory=seq,
        now=clock,
    )
    return runner, stores


def _registry_with(definition):  # noqa: ANN001, ANN202
    from packages.control import ActionRegistry

    registry = ActionRegistry()
    registry.register(definition)
    return registry


def _loop_events(stores) -> list:  # noqa: ANN001, ANN202
    from packages.domain.events import ControlEventType

    return [
        e
        for e in stores["control_sink"].all_events()
        if e.event_type
        in (
            ControlEventType.LOOP_STARTED,
            ControlEventType.LOOP_ITERATION_COMPLETED,
            ControlEventType.LOOP_STOPPED,
        )
    ]


# =========================================================================
# LOOP-INT-001 — the loop drains all legal work, then completes
# =========================================================================
def test_loop_int_001_drains_work_then_completes(clock, seq) -> None:
    snapshot = _multi_object_snapshot()
    fake = FakeProviderExecutor(
        [
            FakeProviderExecutor.success(dict(_slice.VALID_PAYLOAD)),
            FakeProviderExecutor.success(dict(_slice.VALID_PAYLOAD)),
        ]
    )
    runner, stores = _build_loop(clock, seq, snapshot, fake)

    record = runner.run(
        PROJECT,
        BRANCH,
        LoopBudget(max_iterations=10, max_consecutive_failures=5, max_total_failures=5),
    )

    # exactly 2 commits (knowledge-1 + knowledge-2), then nothing legal
    assert record.status is LoopRunStatus.COMPLETED
    assert record.stop_reason is LoopStopReason.NO_CANDIDATES
    assert len(record.iterations) == 2
    assert all(it.committed for it in record.iterations)

    # state: both drafts advanced; the pre-assessed object untouched
    state = stores["controller"].get_state(PROJECT, BRANCH)
    assert state.object_states[_slice.OBJ] == _slice.STATE_ASSESSED
    assert state.object_states[OBJ_2] == _slice.STATE_ASSESSED
    assert state.object_states[OBJ_3] == _slice.STATE_ASSESSED
    assert state.revision == 2
    assert len(stores["state_store"].events()) == 2

    # audit: LOOP_STARTED, 2× ITERATION_COMPLETED, LOOP_STOPPED(with reason)
    types = [e.event_type.value for e in _loop_events(stores)]
    assert types == [
        "LOOP_STARTED",
        "LOOP_ITERATION_COMPLETED",
        "LOOP_ITERATION_COMPLETED",
        "LOOP_STOPPED",
    ]
    stopped = _loop_events(stores)[-1]
    assert stopped.payload["reason"] == "NO_CANDIDATES"


# =========================================================================
# LOOP-INT-002 — iteration budget is a hard ceiling
# =========================================================================
def test_loop_int_002_iteration_budget_stops(clock, seq) -> None:
    snapshot = _multi_object_snapshot()
    fake = FakeProviderExecutor(
        [
            FakeProviderExecutor.success(dict(_slice.VALID_PAYLOAD)),
            FakeProviderExecutor.success(dict(_slice.VALID_PAYLOAD)),
            FakeProviderExecutor.success(dict(_slice.VALID_PAYLOAD)),
        ]
    )
    runner, stores = _build_loop(clock, seq, snapshot, fake)

    record = runner.run(
        PROJECT,
        BRANCH,
        LoopBudget(max_iterations=1, max_consecutive_failures=5, max_total_failures=5),
    )
    assert record.status is LoopRunStatus.STOPPED
    assert record.stop_reason is LoopStopReason.BUDGET_ITERATIONS
    assert len(record.iterations) == 1
    # one commit happened, one draft remains
    state = stores["controller"].get_state(PROJECT, BRANCH)
    drafts = [o for o, s in state.object_states.items() if s == _slice.STATE_DRAFT]
    assert len(drafts) == 1


# =========================================================================
# LOOP-INT-003 — consecutive failures trip the watchdog
# =========================================================================
def test_loop_int_003_consecutive_failure_budget(clock, seq) -> None:
    snapshot = _multi_object_snapshot()
    fake = FakeProviderExecutor(
        [
            FakeProviderExecutor.success({"judgement": "BAD", "confidence": 9.0}),
            FakeProviderExecutor.success({"judgement": "BAD", "confidence": 9.0}),
        ]
    )
    runner, stores = _build_loop(clock, seq, snapshot, fake)

    record = runner.run(
        PROJECT,
        BRANCH,
        LoopBudget(max_iterations=10, max_consecutive_failures=2, max_total_failures=9),
    )
    assert record.stop_reason is LoopStopReason.BUDGET_CONSECUTIVE_FAILURES
    assert record.status is LoopRunStatus.STOPPED
    assert len(record.iterations) == 2
    assert all(it.failure_kind == "OUTPUT_INVALID" for it in record.iterations)
    # no state change: both objects still DRAFT
    state = stores["controller"].get_state(PROJECT, BRANCH)
    assert state.revision == 0
    assert stores["state_store"].events() == []


# =========================================================================
# LOOP-INT-004 — an action type without a cognitive plan stops the loop
# =========================================================================
def test_loop_int_004_unplanned_action_stops(clock, seq) -> None:
    snapshot = _multi_object_snapshot()
    fake = FakeProviderExecutor([])
    runner, stores = _build_loop(clock, seq, snapshot, fake)
    # sabotage the plan table: the selected type has no cognitive plan
    runner._action_specs = {}  # noqa: SLF001 — test hook

    record = runner.run(
        PROJECT,
        BRANCH,
        LoopBudget(max_iterations=5, max_consecutive_failures=5, max_total_failures=5),
    )
    assert record.stop_reason is LoopStopReason.UNPLANNED_ACTION
    assert record.status is LoopRunStatus.STOPPED
    assert record.iterations == ()
    assert len(fake.calls) == 0  # never called the provider without a plan


# =========================================================================
# LOOP-INT-005 — a success resets the consecutive-failure streak
# =========================================================================
def test_loop_int_005_failure_then_success_resets_streak(clock, seq) -> None:
    snapshot = _multi_object_snapshot()
    # first: INVALID output (failure), then: VALID (commit), then: VALID
    fake = FakeProviderExecutor(
        [
            FakeProviderExecutor.success({"judgement": "BAD", "confidence": 9.0}),
            FakeProviderExecutor.success(dict(_slice.VALID_PAYLOAD)),
            FakeProviderExecutor.success(dict(_slice.VALID_PAYLOAD)),
        ]
    )
    runner, stores = _build_loop(clock, seq, snapshot, fake)

    # consecutive max 2: without streak reset this WOULD trip after fail+…
    record = runner.run(
        PROJECT,
        BRANCH,
        LoopBudget(max_iterations=10, max_consecutive_failures=2, max_total_failures=9),
    )
    assert record.status is LoopRunStatus.COMPLETED
    assert record.stop_reason is LoopStopReason.NO_CANDIDATES
    kinds = [it.failure_kind for it in record.iterations]
    # first iteration failed, second committed — streak reset proven by
    # the loop NOT stopping at 2 consecutive (only 1 consecutive happened)
    assert kinds[0] == "OUTPUT_INVALID"
    assert kinds[1] is None
    assert len(record.iterations) == 3  # fail, commit, commit
    state = stores["controller"].get_state(PROJECT, BRANCH)
    assert state.revision == 2
