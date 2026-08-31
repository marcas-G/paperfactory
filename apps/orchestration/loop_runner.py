"""ResearchLoopRunner — the STEP-016 agent loop, wired at the composition root.

The system's first self-driving component. Per iteration (all deterministic,
constitution §23 — the loop itself never calls an LLM):

    1. re-read Research State + branch status  -> evaluate_stop (§15.10)
    2. enumerate legal candidates              (control/candidates.py)
    3. rank via ResearchPolicyEngine           (audit: POLICY_EVALUATED)
    4. look up the cognitive plan for the selected action_type — a type
       without a plan STOPS the loop (UNPLANNED_ACTION): never guess a prompt
    5. execute via ResearchActionExecutor      (the STEP-015 chain)
    6. update failure counters; commit clears the consecutive streak
    7. LOOP_ITERATION_COMPLETED -> evaluate_stop -> LOOP_STOPPED

Every stopping reason is one of the closed ``LoopStopReason`` set and is
emitted in the LOOP_STOPPED payload (§33: "why did the run end?" is always
answerable from events alone).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass

from packages.control.candidates import ActionCandidateEnumerator
from packages.control.controller import ResearchController
from packages.control.loop import (
    LoopBudget,
    LoopIterationRecord,
    LoopRunRecord,
    LoopStopDecision,
    LoopStopReason,
    evaluate_stop,
    status_for_stop_reason,
)
from packages.control.policy import (
    PolicyCandidate,
    PolicyRecommendation,
    PolicyStatus,
    ResearchPolicyConfig,
)
from packages.domain.enums import ActorType
from packages.domain.events import ControlEvent, ControlEventType
from packages.domain.ids import BranchId, EventId, ProjectId
from packages.runtime.provider import ProviderExecutionPort

from .action_executor import ExecutionBindingSpec, ResearchActionExecutor
from .contracts import ActionExecutionRequest

# Reasons a loop ends BEFORE executing anything (not counter-driven).
_PRE_EXECUTION_STOPS: frozenset[LoopStopReason] = frozenset(
    {LoopStopReason.NO_CANDIDATES, LoopStopReason.UNPLANNED_ACTION}
)


@dataclass(frozen=True)
class LoopActionSpec:
    """The cognitive plan for one action_type (STEP-016).

    Selection picks WHICH action runs; this says what the executor should
    SEE and ASK. A selected action_type without a plan is a configuration
    gap — the loop stops rather than inventing a prompt.
    """

    cognitive_mode: str
    task_objective: str
    task_constraints: tuple[str, ...] = ()
    requirements: tuple = ()


class ResearchLoopRunner:
    """Drives N governed action executions until work or budget runs out."""

    def __init__(
        self,
        *,
        controller: ResearchController,
        enumerator: ActionCandidateEnumerator,
        action_executor: ResearchActionExecutor,
        policy_config: ResearchPolicyConfig,
        action_specs: Mapping[str, LoopActionSpec],
        binding_spec: ExecutionBindingSpec,
        provider: ProviderExecutionPort,
        agent_id,
        agent_version: str,
        event_sink,
        id_factory: Callable[[], str],
        now: Callable[[], object],
        stop_flag: Callable[[], bool] | None = None,
    ) -> None:
        self._provider = provider
        self._agent_id = agent_id
        self._agent_version = agent_version
        self._controller = controller
        self._enumerator = enumerator
        self._executor = action_executor
        self._policy_config = policy_config
        self._action_specs = dict(action_specs)
        self._binding_spec = binding_spec
        self._sink = event_sink
        self._id_factory = id_factory
        self._now = now
        self._stop_flag = stop_flag or (lambda: False)

    def run(
        self,
        project_id: ProjectId,
        branch_id: BranchId,
        budget: LoopBudget,
        *,
        actor_type: ActorType = ActorType.SYSTEM,
    ) -> LoopRunRecord:
        started_at = self._now()
        self._emit(
            ControlEventType.LOOP_STARTED,
            f"{project_id}/{branch_id}",
            project_id,
            branch_id,
            actor_type,
            {"max_iterations": budget.max_iterations},
        )

        iterations: list[LoopIterationRecord] = []
        consecutive_failures = 0
        total_failures = 0
        iteration = 0

        while True:
            state = self._controller.get_state(project_id, branch_id)
            branch_actionable = self._branch_actionable(branch_id)
            decision = evaluate_stop(
                iteration=iteration,
                consecutive_failures=consecutive_failures,
                total_failures=total_failures,
                budget=budget,
                branch_actionable=branch_actionable,
                stop_flag=self._stop_flag(),
            )
            if decision.should_stop:
                return self._finish(
                    project_id, branch_id, budget, iterations, decision,
                    started_at, actor_type,
                )

            # --- enumerate + rank (audit even when empty) -------------------
            candidates = self._enumerator.enumerate(
                state, branch_actionable=branch_actionable
            )
            recommendation = self._controller.recommend_next_action(
                branch_id=branch_id,
                candidates=candidates,
                policy_config=self._policy_config,
                actor_type=actor_type,
            )
            if recommendation.status is not PolicyStatus.RECOMMENDED:
                return self._finish(
                    project_id, branch_id, budget, iterations,
                    LoopStopDecision(
                        should_stop=True,
                        reason=LoopStopReason.NO_CANDIDATES,
                        detail="policy returned NO_ACTION",
                    ),
                    started_at, actor_type, recommendation,
                )

            selected = recommendation.ranked_actions[0]
            spec = self._action_specs.get(selected.action_type)
            if spec is None:
                return self._finish(
                    project_id, branch_id, budget, iterations,
                    LoopStopDecision(
                        should_stop=True,
                        reason=LoopStopReason.UNPLANNED_ACTION,
                        detail=f"no cognitive plan for {selected.action_type!r}",
                    ),
                    started_at, actor_type, recommendation,
                )

            # --- execute through the full STEP-015 governed chain -----------
            request = ActionExecutionRequest(
                project_id=project_id,
                branch_id=branch_id,
                action_id=selected.action_id,
                target_object_id=selected.target_object_id,
                agent_id=self._agent_id,
                agent_version=self._agent_version,
                cognitive_mode=spec.cognitive_mode,
                task_objective=spec.task_objective,
                task_constraints=spec.task_constraints,
                requirements=spec.requirements,
                actor_type=actor_type,
            )
            definition = self._definition_for(selected, candidates)
            record = self._executor.execute(
                request, definition, self._binding_spec, self._provider
            )

            iteration += 1
            failed = record.failure is not None
            if failed:
                total_failures += 1
                consecutive_failures += 1
            else:
                consecutive_failures = 0

            iterations.append(
                LoopIterationRecord(
                    iteration=iteration,
                    action_id=str(selected.action_id),
                    action_type=selected.action_type,
                    target_object_id=str(selected.target_object_id),
                    committed=not failed,
                    failure_kind=record.failure.kind if failed else None,
                    recommendation=recommendation,
                    action_record=record,
                )
            )
            self._emit(
                ControlEventType.LOOP_ITERATION_COMPLETED,
                str(selected.action_id),
                project_id,
                branch_id,
                actor_type,
                {
                    "iteration": iteration,
                    "action_type": selected.action_type,
                    "committed": not failed,
                    "failure_kind": record.failure.kind if failed else None,
                },
            )

    # -------------------------------------------------------------------
    # internals
    # -------------------------------------------------------------------
    def _finish(
        self,
        project_id: ProjectId,
        branch_id: BranchId,
        budget: LoopBudget,
        iterations: list[LoopIterationRecord],
        decision: LoopStopDecision,
        started_at,
        actor_type: ActorType,
        recommendation: PolicyRecommendation | None = None,
    ) -> LoopRunRecord:
        assert decision.reason is not None
        status = status_for_stop_reason(decision.reason)
        self._emit(
            ControlEventType.LOOP_STOPPED,
            f"{project_id}/{branch_id}",
            project_id,
            branch_id,
            actor_type,
            {
                "reason": decision.reason.value,
                "detail": decision.detail,
                "iterations": len(iterations),
                "status": status.value,
            },
        )
        return LoopRunRecord(
            project_id=str(project_id),
            branch_id=str(branch_id),
            budget=budget,
            status=status,
            stop_reason=decision.reason,
            iterations=tuple(iterations),
            started_at=started_at,
            completed_at=self._now(),
            metadata={"last_recommendation": recommendation},
        )

    def _branch_actionable(self, branch_id: BranchId) -> bool:
        try:
            branch = self._controller.get_branch(branch_id)
        except Exception:  # noqa: BLE001 — unknown branch = not actionable
            return False
        from packages.control.branches import ACTIONABLE_BRANCH_STATUSES

        return branch.status in ACTIONABLE_BRANCH_STATUSES

    def _definition_for(
        self, selected, candidates: tuple[PolicyCandidate, ...]
    ):
        for cand in candidates:
            if (
                cand.action.action_id == selected.action_id
                and cand.definition is not None
            ):
                return cand.definition
        raise LookupError(
            f"selected action {selected.action_id} has no candidate definition"
        )

    def _emit(
        self,
        event_type: ControlEventType,
        aggregate_id: str,
        project_id: ProjectId,
        branch_id: BranchId,
        actor_type: ActorType,
        payload: dict,
    ) -> None:
        self._sink.append(
            ControlEvent(
                event_id=EventId(self._id_factory()),
                project_id=project_id,
                branch_id=branch_id,
                event_type=event_type,
                aggregate_id=aggregate_id,
                actor_type=actor_type,
                created_at=self._now(),
                payload=payload,
            )
        )


__all__ = ["LoopActionSpec", "ResearchLoopRunner"]
