"""ResearchActionExecutor — the STEP-015 vertical-slice composition service.

Wires the three planes into ONE governed chain (constitution §49):

    Control task (RUNNING)
      -> RetrievalResolver.resolve          (cognition, deterministic)
      -> ContextCompiler.compile            (cognition, deterministic)
      -> PromptAssembler.assemble           (cognition, deterministic)
      -> OpenAIProjector.project            (cognition, deterministic)
      -> Session / Run / Binding / Execute  (runtime, deterministic)
      -> OutputValidationEngine.validate    (cognition, deterministic)
      -> GateResult (derived, deterministic)
      -> propose + execute transition       (control — sole state authority)
      -> DomainEvent on COMMIT

Governance axioms honored here:

    * LLM proposes (raw provider output); the system decides (validation +
      gate aggregation + transition engine). No prose ever mutates state.
    * Runtime failure != scientific failure: a provider FAILED outcome and a
      cognitive INVALID are classified separately and NEVER auto-retried.
    * This module owns no business rules — it sequences engines that do.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass

from packages.cognition.compiler import ContextCompiler
from packages.cognition.context import ContextBudget, ContextRequestId
from packages.cognition.output import (
    OutputCandidateId,
    OutputValidationStatus,
    StructuredOutputCandidate,
)
from packages.cognition.output_validation import OutputValidationEngine
from packages.cognition.policies import BlindingPolicy, ContextPolicy
from packages.cognition.prompt import PromptPolicy, PromptRequest
from packages.cognition.prompt_engine import PromptAssembler
from packages.cognition.provider_projection import ProviderPromptProjector
from packages.cognition.retrieval import RetrievalPolicy
from packages.cognition.retrieval_engine import RetrievalResolver
from packages.control.actions import ResearchAction, ResearchActionDefinition
from packages.control.controller import ResearchController
from packages.control.gates import GateResult
from packages.domain.enums import GateStatus, TransitionDecision
from packages.runtime.agent import (
    AgentBindingManager,
    AgentProviderExecutionRequestFactory,
)
from packages.runtime.contracts import RuntimeInputRef
from packages.runtime.execution import RuntimeExecutionCoordinator
from packages.runtime.lifecycle import RuntimeRunManager, RuntimeSessionManager
from packages.runtime.provider import (
    ProviderExecutionPort,
    ProviderExecutionRequestId,
)

from .contracts import (
    ActionExecutionFailure,
    ActionExecutionRecord,
    ActionExecutionRequest,
)

# Deterministic gate ids for the vertical slice (STEP-015). The controller
# consumes GateResult.status; ids are for audit only.
_GATE_OUTPUT_CONFORMANCE = "OUTPUT_CONFORMANCE"

# Failure kinds (see ActionExecutionFailure).
_FAILURE_PROVIDER = "PROVIDER_FAILED"
_FAILURE_INVALID = "OUTPUT_INVALID"
_FAILURE_REJECTED = "TRANSITION_REJECTED"


@dataclass(frozen=True)
class ExecutionBindingSpec:
    """The caller's explicit agent/profile/config pinning (STEP-014 policy:
    selection recommends, the caller binds)."""

    execution_profile_id: str
    execution_profile_version: str
    execution_config_id: str
    execution_config_version: str


class ResearchActionExecutor:
    """Sequences one action end-to-end. All engines/stores are injected."""

    def __init__(
        self,
        *,
        controller: ResearchController,
        retrieval_resolver: RetrievalResolver,
        context_compiler: ContextCompiler,
        prompt_assembler: PromptAssembler,
        projector: ProviderPromptProjector,
        output_validator: OutputValidationEngine,
        session_manager: RuntimeSessionManager,
        run_manager: RuntimeRunManager,
        binding_manager: AgentBindingManager,
        request_factory: AgentProviderExecutionRequestFactory,
        execution_coordinator: RuntimeExecutionCoordinator,
        context_policy: ContextPolicy,
        blinding_policy: BlindingPolicy,
        retrieval_policy: RetrievalPolicy,
        prompt_policy: PromptPolicy,
        budget: ContextBudget,
        output_contract_id,
        output_contract_version: int,
        template_registry,
        target_states,
        context_request_id_factory: Callable[[], str],
        prompt_request_id_factory: Callable[[], str],
        provider_request_id_factory: Callable[[], str],
        candidate_id_factory: Callable[[], str],
        input_version: str = "1",
    ) -> None:
        self._controller = controller
        self._retrieval = retrieval_resolver
        self._compiler = context_compiler
        self._assembler = prompt_assembler
        self._projector = projector
        self._validator = output_validator
        self._sessions = session_manager
        self._runs = run_manager
        self._bindings = binding_manager
        self._request_factory = request_factory
        self._coordinator = execution_coordinator
        self._context_policy = context_policy
        self._blinding_policy = blinding_policy
        self._retrieval_policy = retrieval_policy
        self._prompt_policy = prompt_policy
        self._budget = budget
        self._output_contract_id = output_contract_id
        self._output_contract_version = output_contract_version
        self._registry = template_registry
        self._target_states = dict(target_states)
        self._context_request_id_factory = context_request_id_factory
        self._prompt_request_id_factory = prompt_request_id_factory
        self._provider_request_id_factory = provider_request_id_factory
        self._candidate_id_factory = candidate_id_factory
        self._input_version = input_version

    def execute(
        self,
        request: ActionExecutionRequest,
        definition: ResearchActionDefinition,
        binding_spec: ExecutionBindingSpec,
        executor: ProviderExecutionPort,
    ) -> ActionExecutionRecord:
        """Run the full chain synchronously (the only async hop — the
        provider port — is awaited via asyncio.run)."""
        # --- 1. Control: task + state revision ---------------------------
        task = self._controller.create_task(
            project_id=request.project_id,
            branch_id=request.branch_id,
            action_id=request.action_id,
            action_type=definition.action_type,
            target_object_id=request.target_object_id,
            created_by=request.actor_type,
        )
        self._controller._tasks.mark_running(task.task_id)  # noqa: SLF001 — facade gap, documented
        task = self._controller.get_task(task.task_id)

        state = self._controller.get_state(request.project_id, request.branch_id)
        revision = state.revision

        record = ActionExecutionRecord(
            request=request, task=task, state_revision=revision
        )

        # --- 2. Cognition: retrieve -> compile ---------------------------
        resolution = self._retrieval.resolve(
            project_id=request.project_id,
            branch_id=request.branch_id,
            state_revision=revision,
            action_id=request.action_id,
            cognitive_mode=request.cognitive_mode,
            requirements=request.requirements,
            retrieval_policy=self._retrieval_policy,
            context_policy=self._context_policy,
        )
        context_request = resolution.to_context_request(
            request_id=ContextRequestId(self._context_request_id_factory()),
            context_policy=self._context_policy,
            budget=self._budget,
        )
        candidates = self._retrieval._catalog.list_items(  # noqa: SLF001 — catalog read via resolver's own catalog
            project_id=request.project_id,
            branch_id=request.branch_id,
        )
        bundle = self._compiler.compile(
            context_request,
            self._context_policy,
            self._blinding_policy,
            candidates,
            revision,
        )

        # --- 3. Cognition: assemble + project ----------------------------
        prompt_request = PromptRequest(
            request_id=self._prompt_request_id_factory(),  # type: ignore[arg-type]
            project_id=request.project_id,
            branch_id=request.branch_id,
            state_revision=revision,
            action_id=request.action_id,
            cognitive_mode=request.cognitive_mode,
            context_bundle_id=bundle.bundle_id,
            output_contract_id=self._output_contract_id,
            output_contract_version=self._output_contract_version,
            task_objective=request.task_objective,
            task_constraints=request.task_constraints,
            prompt_policy_id=self._prompt_policy.policy_id,
            prompt_policy_version=self._prompt_policy.version,
        )
        package = self._assembler.assemble(
            prompt_request,
            bundle,
            self._prompt_policy,
            self._registry,
            revision,
        )
        projection = self._projector.project(package)

        # --- 4. Runtime: session -> run -> bind -> execute ---------------
        session = self._sessions.create_session(
            project_id=request.project_id, branch_id=request.branch_id
        )
        input_ref = RuntimeInputRef(
            source_type="prompt_package",
            source_id=str(package.package_id),
            version=self._input_version,
        )
        run = self._runs.create_run(
            session_id=session.session_id, input_ref=input_ref
        )
        from packages.domain.ids import AgentId as _AgentId

        binding = self._bindings.bind_agent(
            session_id=session.session_id,
            run_id=run.run_id,
            agent_id=_AgentId(str(request.agent_id)),
            agent_version=request.agent_version,
            execution_profile_id=self._profile_id(binding_spec),  # type: ignore[arg-type]
            execution_profile_version=binding_spec.execution_profile_version,
            execution_config_id=self._config_id(binding_spec),  # type: ignore[arg-type]
            execution_config_version=binding_spec.execution_config_version,
        )
        self._runs.mark_ready(run.run_id)
        started_run, attempt = self._runs.start_run(run.run_id)
        provider_request = self._request_factory.build(
            binding=binding,
            session=session,
            run=started_run,
            attempt=attempt,
            request_id=ProviderExecutionRequestId(
                self._provider_request_id_factory()
            ),
            projected_input=projection,
            created_at=started_run.started_at or started_run.created_at,
        )
        final_run, outcome = asyncio.run(
            self._coordinator.execute(provider_request, executor)
        )
        record = ActionExecutionRecord(
            request=record.request,
            task=record.task,
            state_revision=record.state_revision,
            resolution=resolution,
            bundle=bundle,
            prompt_package=package,
            run=final_run,
            outcome=outcome,
        )

        # --- 5. Cognition: validate structured output --------------------
        gate_results: tuple[GateResult, ...] = ()
        validation = None
        cognitive_result_id = None
        if outcome.response is not None:
            candidate = StructuredOutputCandidate(
                candidate_id=OutputCandidateId(self._candidate_id_factory()),
                project_id=request.project_id,
                branch_id=request.branch_id,
                state_revision=revision,
                action_id=request.action_id,
                cognitive_mode=request.cognitive_mode,
                prompt_package_id=package.package_id,
                output_contract_id=prompt_request.output_contract_id,
                output_contract_version=prompt_request.output_contract_version,
                payload=outcome.response.raw_output,
            )
            validation = self._validator.validate(candidate, package, revision)
            cognitive_result_id = validation.cognitive_result_id
            gate_results = (
                GateResult(
                    gate_id=_GATE_OUTPUT_CONFORMANCE,
                    status=(
                        GateStatus.PASS
                        if validation.status is OutputValidationStatus.VALID
                        else GateStatus.FAIL
                    ),
                    reason_codes=tuple(
                        issue.code for issue in validation.issues
                    ),
                ),
            )
        else:
            # Provider failed: runtime failure, not a scientific verdict.
            # FAIL, not UNCERTAIN: an unexecuted action must not silently
            # WAIT on the state machine — the task fails and a retry is a
            # NEW action execution with a fresh proposal.
            failure = outcome.failure
            gate_results = (
                GateResult(
                    gate_id=_GATE_OUTPUT_CONFORMANCE,
                    status=GateStatus.FAIL,
                    reason_codes=(
                        (failure.code,) if failure is not None else ("UNKNOWN",)
                    ),
                ),
            )

        # --- 6. Control: propose + execute transition ---------------------
        action = ResearchAction(
            action_id=request.action_id,
            action_type=definition.action_type,
            project_id=request.project_id,
            branch_id=request.branch_id,
            target_object_id=request.target_object_id,
            actor_type=request.actor_type,
        )
        proposal = self._controller.propose_transition(
            action,
            definition,
            to_state=self._target_states[str(definition.action_type)],
            gate_results=gate_results,
        )
        transition = self._controller.execute_transition(
            proposal,
            definition,
            actor_type=request.actor_type,
            task_id=task.task_id,
        )

        # --- 7. Classify + return ----------------------------------------
        failure: ActionExecutionFailure | None = None
        if outcome.response is None:
            failure = ActionExecutionFailure(
                kind=_FAILURE_PROVIDER,
                reason_codes=(
                    (outcome.failure.code,) if outcome.failure else ("UNKNOWN",)
                ),
            )
        elif validation is not None and validation.status is OutputValidationStatus.INVALID:
            failure = ActionExecutionFailure(
                kind=_FAILURE_INVALID,
                reason_codes=tuple(issue.code for issue in validation.issues),
            )
        elif transition.decision is TransitionDecision.REJECT:
            failure = ActionExecutionFailure(
                kind=_FAILURE_REJECTED, reason_codes=transition.reason_codes
            )

        return ActionExecutionRecord(
            request=request,
            task=self._controller.get_task(task.task_id),
            state_revision=record.state_revision,
            resolution=resolution,
            bundle=bundle,
            prompt_package=package,
            run=final_run,
            outcome=outcome,
            validation=validation,
            cognitive_result_id=cognitive_result_id,
            transition=transition,
            failure=failure,
        )

    # --- injected-policy accessors (kept dumb on purpose) ----------------
    def _profile_id(self, spec: ExecutionBindingSpec):  # noqa: ANN202
        from packages.domain.ids import ModelExecutionProfileId

        return ModelExecutionProfileId(spec.execution_profile_id)

    def _config_id(self, spec: ExecutionBindingSpec):  # noqa: ANN202
        from packages.domain.ids import ModelExecutionConfigId

        return ModelExecutionConfigId(spec.execution_config_id)


__all__ = [
    "ExecutionBindingSpec",
    "ResearchActionExecutor",
]
