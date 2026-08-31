"""Typed contracts for the vertical-slice composition root (STEP-015).

These are application-edge DTOs. They carry references and outcomes across
the control / cognition / runtime planes; they are NOT Research Objects and
carry no ``dict[str, Any]`` payloads.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from packages.cognition.context import ContextBundle
from packages.cognition.output import OutputValidationResult
from packages.cognition.prompt import PromptPackage
from packages.cognition.retrieval import RetrievalResolution
from packages.control.engine import TransitionExecutionResult
from packages.control.tasks import ResearchTask
from packages.domain.enums import ActorType
from packages.domain.ids import (
    ActionId,
    AgentId,
    BranchId,
    CognitiveResultId,
    ObjectId,
    ProjectId,
)
from packages.runtime.contracts import RuntimeRun
from packages.runtime.provider import ProviderExecutionOutcome


@dataclass(frozen=True)
class ActionExecutionRequest:
    """One end-to-end action execution: State -> ... -> Transition -> Event.

    ``requirements`` are the declared context needs (STEP-007) resolved
    against the injected catalog. ``task_objective`` / ``task_constraints``
    feed the TASK_FRAME prompt template.
    """

    project_id: ProjectId
    branch_id: BranchId
    action_id: ActionId
    target_object_id: ObjectId

    agent_id: AgentId
    agent_version: str

    cognitive_mode: str
    task_objective: str
    task_constraints: tuple[str, ...] = ()

    requirements: tuple = ()
    actor_type: ActorType = ActorType.SYSTEM


@dataclass(frozen=True)
class ActionExecutionFailure:
    """Structured failure classification (runtime vs scientific, §26).

    ``kind`` is one of: PROVIDER_FAILED, OUTPUT_INVALID, TRANSITION_REJECTED.
    Runtime failures may be retried; OUTPUT_INVALID / TRANSITION_REJECTED are
    scientific outcomes that must enter analysis, never auto-retry.
    """

    kind: str
    reason_codes: tuple[str, ...] = ()


@dataclass(frozen=True)
class ActionExecutionRecord:
    """The immutable, auditable record of one action execution (STEP-015).

    Carries every intermediate artifact so a run can be answered per §45:
    which task, which bundle, which prompt, which run, which validation,
    which transition, which events.
    """

    request: ActionExecutionRequest
    task: ResearchTask
    state_revision: int

    resolution: RetrievalResolution | None = None
    bundle: ContextBundle | None = None
    prompt_package: PromptPackage | None = None

    run: RuntimeRun | None = None
    outcome: ProviderExecutionOutcome | None = None

    validation: OutputValidationResult | None = None
    cognitive_result_id: CognitiveResultId | None = None

    transition: TransitionExecutionResult | None = None

    failure: ActionExecutionFailure | None = None
    metadata: dict = field(default_factory=dict)


__all__ = [
    "ActionExecutionFailure",
    "ActionExecutionRequest",
    "ActionExecutionRecord",
]
