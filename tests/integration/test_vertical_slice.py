"""STEP-015 — the first end-to-end vertical slice.

INT-SLICE-001/002/003: State -> Action -> Context -> Prompt -> Provider
(test double) -> Output validation -> Gate -> Transition -> Domain Event.

Integration tests MAY import multiple planes and the composition root.
Production packages must NOT cross-import (enforced by tests/architecture).
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime, timedelta

import pytest

from apps.orchestration import (
    ActionExecutionRequest,
    ResearchActionExecutor,
)
from apps.orchestration.action_executor import ExecutionBindingSpec
from packages.cognition import (
    BlindingPolicy,
    ContextCompiler,
    ContextLayer,
    ContextPolicy,
    ContextScope,
    OpenAIProjector,
    OutputContract,
    OutputSchemaRef,
    OutputValidationEngine,
    PromptAssembler,
    PromptPolicy,
    PromptTemplate,
    PromptTemplateKind,
    RetrievalPolicy,
    RetrievalRequirement,
    RetrievalResolver,
)
from packages.cognition.context import (
    ContextBudget,
    ContextItem,
    ContextItemType,
    ContextSourceRef,
)
from packages.cognition.testing import (
    ExampleCognitiveAssessmentValidator,
    InMemoryCognitiveResultStore,
    InMemoryContextBundleStore,
    InMemoryContextCatalog,
    InMemoryOutputContractRegistry,
    InMemoryOutputValidationResultStore,
    InMemoryPromptPackageStore,
    InMemoryPromptTemplateRegistry,
    InMemoryRetrievalResolutionStore,
    InMemoryStructuredOutputValidatorRegistry,
)
from packages.control import (
    ActionRegistry,
    ApprovalManager,
    BranchManager,
    ResearchActionDefinition,
    ResearchPolicyEngine,
    TaskManager,
    TransitionEngine,
)
from packages.control.controller import ResearchController
from packages.control.testing import (
    InMemoryApprovalStore,
    InMemoryBranchStore,
    InMemoryControlEventSink,
    InMemoryForkPointStore,
    InMemoryMergeStore,
    InMemoryPendingTransitionStore,
    InMemoryPolicyRecommendationStore,
    InMemoryStateStore,
    InMemoryTaskStore,
)
from packages.domain.enums import SideEffectLevel
from packages.domain.ids import (
    ActionId,
    AgentId,
    BranchId,
    ContextItemId,
    ModelExecutionConfigId,
    ModelExecutionProfileId,
    ObjectId,
    ProjectId,
    PromptTemplateId,
    RetrievalRequirementId,
)
from packages.domain.models import ResearchStateSnapshot
from packages.runtime import (
    AgentBindingManager,
    AgentDefinition,
    AgentProviderExecutionRequestFactory,
    ModelCapability,
    ModelExecutionConfig,
    ModelExecutionProfile,
    ModelExecutionProfileRef,
    RuntimeExecutionCoordinator,
    RuntimeRunManager,
    RuntimeSessionManager,
)
from packages.runtime.testing import (
    FakeProviderExecutor,
    InMemoryAgentDefinitionRegistry,
    InMemoryAgentExecutionBindingStore,
    InMemoryExecutionAttemptStore,
    InMemoryModelExecutionConfigRegistry,
    InMemoryModelExecutionProfileRegistry,
    InMemoryProviderExecutionRequestStore,
    InMemoryProviderExecutionResponseStore,
    InMemoryRuntimeEventSink,
    InMemoryRuntimeRunStore,
    InMemoryRuntimeSessionStore,
)

# --- slice constants -----------------------------------------------------
PROJECT = ProjectId("P1")
BRANCH = BranchId("B1")
OBJ = ObjectId("knowledge-1")
OBJECT_TYPE = "KNOWLEDGE_ITEM"
ACTION_TYPE = "ASSESS_KNOWLEDGE_ITEM"
ACTION = ActionId("act-1")
AGENT = AgentId("agent-assessor")

STATE_DRAFT = "DRAFT"
STATE_ASSESSED = "ASSESSED"

VALID_PAYLOAD = {
    "judgement": "SUPPORT",
    "confidence": 0.9,
    "reason_codes": ["EVIDENCE_CITED"],
}
INVALID_PAYLOAD = {"judgement": "BAD", "confidence": 9.0}

TZ = datetime(2026, 1, 1, tzinfo=UTC)


class _Clock:
    def __init__(self) -> None:
        self._base = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
        self._ticks = itertools.count()

    def __call__(self) -> datetime:
        return self._base + timedelta(seconds=next(self._ticks))


@pytest.fixture
def clock() -> _Clock:
    return _Clock()


@pytest.fixture
def seq():
    c = itertools.count(1)

    def factory() -> str:
        return f"id-{next(c)}"

    return factory


@pytest.fixture
def snapshot() -> ResearchStateSnapshot:
    return ResearchStateSnapshot(
        project_id=PROJECT,
        branch_id=BRANCH,
        revision=0,
        object_states={OBJ: STATE_DRAFT},
    )


@pytest.fixture
def definition() -> ResearchActionDefinition:
    return ResearchActionDefinition(
        action_type=ACTION_TYPE,
        target_object_type=OBJECT_TYPE,
        allowed_source_states=frozenset({STATE_DRAFT}),
        required_gate_ids=frozenset(),
        side_effect_level=SideEffectLevel.INTERNAL_WRITE,
        requires_approval=False,
    )


def _register_templates(registry: InMemoryPromptTemplateRegistry) -> None:
    harness = PromptTemplate(
        template_id=PromptTemplateId("harness"),
        version=1,
        kind=PromptTemplateKind.HARNESS_GUARDRAIL,
        body="You are a research cognition engine. Follow the output contract exactly.",
        variables=frozenset(),
    )
    task = PromptTemplate(
        template_id=PromptTemplateId("task"),
        version=1,
        kind=PromptTemplateKind.TASK_FRAME,
        body=(
            "Objective: $task_objective\n"
            "Action: $action_id\n"
            "Mode: $cognitive_mode\n"
            "$task_constraints_rendered"
        ),
        variables=frozenset(
            {"task_objective", "task_constraints_rendered", "action_id", "cognitive_mode"}
        ),
    )
    registry.register(harness)
    registry.register(task)
    from packages.cognition.modes import CognitiveMode

    for mode in CognitiveMode:
        registry.register(
            PromptTemplate(
                template_id=PromptTemplateId(f"mode-{mode.value}"),
                version=1,
                kind=PromptTemplateKind.MODE_GUIDANCE,
                body=f"Think in {mode.value} mode.",
                variables=frozenset(),
            )
        )


def _build_stack(clock, seq, snapshot, definition):
    """Wire the full in-memory stack; return (executor, stores bundle)."""
    # --- control plane ----------------------------------------------------
    registry = ActionRegistry()
    registry.register(definition)
    state_store = InMemoryStateStore()
    task_store = InMemoryTaskStore()
    pending_store = InMemoryPendingTransitionStore()
    approval_store = InMemoryApprovalStore()
    branch_store = InMemoryBranchStore()
    fork_store = InMemoryForkPointStore()
    merge_store = InMemoryMergeStore()
    rec_store = InMemoryPolicyRecommendationStore()
    control_sink = InMemoryControlEventSink()

    controller = ResearchController(
        registry,
        TransitionEngine(state_store),
        TaskManager(task_store, control_sink, id_factory=seq, now=clock),
        ApprovalManager(approval_store, control_sink, id_factory=seq, now=clock),
        BranchManager(
            branch_store,
            fork_store,
            state_store,
            merge_store,
            task_store,
            control_sink,
            id_factory=seq,
            now=clock,
        ),
        ResearchPolicyEngine(registry, rec_store, control_sink, id_factory=seq, now=clock),
        pending_store=pending_store,
        task_store=task_store,
        approval_store=approval_store,
        branch_store=branch_store,
        recommendation_store=rec_store,
        event_sink=control_sink,
        proposal_id_factory=seq,
        id_factory=seq,
        now=clock,
    )
    controller.create_main_branch(project_id=PROJECT, branch_id=BRANCH, initial_snapshot=snapshot)

    # --- cognition plane ----------------------------------------------------
    catalog = InMemoryContextCatalog()
    catalog.add(
        ContextItem(
            item_id=ContextItemId("item-knowledge-1"),
            layer=ContextLayer.STATE,
            scope=ContextScope.BRANCH,
            source_ref=ContextSourceRef(
                source_type="knowledge_item", source_id=str(OBJ), version="1"
            ),
            content="KnowledgeItem: transformers need positional encoding.",
            estimated_tokens=12,
            priority=50,
            item_type=ContextItemType.STATE,
            project_id=PROJECT,
            branch_id=BRANCH,
        )
    )
    retrieval_resolver = RetrievalResolver(
        catalog,
        InMemoryRetrievalResolutionStore(),
        resolution_id_factory=seq,  # type: ignore[arg-type]
        now=clock,
    )
    context_policy = ContextPolicy(
        policy_id="slice",
        version=1,
        layer_order=(ContextLayer.GLOBAL, ContextLayer.STATE, ContextLayer.TASK),
        default_blinding_policy=BlindingPolicy(policy_id="none", version=1),
    )
    compiler = ContextCompiler(
        InMemoryContextBundleStore(),
        bundle_id_factory=seq,
        now=clock,  # type: ignore[arg-type]
    )
    template_registry = InMemoryPromptTemplateRegistry()
    _register_templates(template_registry)
    assembler = PromptAssembler(InMemoryPromptPackageStore(), now=clock)
    from packages.cognition.modes import CognitiveMode
    from packages.cognition.prompt import TemplateRef
    from packages.domain.ids import (
        OutputContractId,
        OutputSchemaId,
        PromptPolicyId,
        RetrievalPolicyId,
    )

    prompt_policy = PromptPolicy(
        policy_id=PromptPolicyId("slice"),
        version=1,
        harness_template_ref=TemplateRef(PromptTemplateId("harness"), 1),
        task_template_ref=TemplateRef(PromptTemplateId("task"), 1),
        mode_template_refs={
            m: TemplateRef(PromptTemplateId(f"mode-{m.value}"), 1) for m in CognitiveMode
        },
    )
    contract_registry = InMemoryOutputContractRegistry()
    contract_registry.register(
        OutputContract(
            contract_id=OutputContractId("example-assessment"),
            version=1,
            schema_ref=OutputSchemaRef(OutputSchemaId("example-assessment"), 1),
            strict=True,
            description="slice test contract",
        )
    )
    validator_registry = InMemoryStructuredOutputValidatorRegistry()
    validator_registry.register(ExampleCognitiveAssessmentValidator())
    output_validator = OutputValidationEngine(
        contract_registry,
        validator_registry,
        InMemoryOutputValidationResultStore(),
        InMemoryCognitiveResultStore(),
        validation_id_factory=seq,  # type: ignore[arg-type]
        result_id_factory=seq,  # type: ignore[arg-type]
        now=clock,
    )

    # --- runtime plane ------------------------------------------------------
    session_store = InMemoryRuntimeSessionStore()
    run_store = InMemoryRuntimeRunStore()
    attempt_store = InMemoryExecutionAttemptStore()
    runtime_sink = InMemoryRuntimeEventSink()
    session_mgr = RuntimeSessionManager(
        session_store,
        run_store,
        runtime_sink,
        session_id_factory=seq,
        event_id_factory=seq,
        now=clock,
    )
    run_mgr = RuntimeRunManager(
        session_store,
        run_store,
        attempt_store,
        runtime_sink,
        run_id_factory=seq,
        attempt_id_factory=seq,
        event_id_factory=seq,
        now=clock,
    )
    profile_registry = InMemoryModelExecutionProfileRegistry()
    profile = ModelExecutionProfile(
        profile_id=ModelExecutionProfileId("openai-profile"),
        version="v1",
        name="openai fake",
        description="slice",
        provider=__import__(
            "packages.runtime.provider", fromlist=["ProviderIdentifier"]
        ).ProviderIdentifier(name="openai"),
        model=__import__("packages.runtime.provider", fromlist=["ModelIdentifier"]).ModelIdentifier(
            name="fake-model"
        ),
        capabilities=frozenset(
            {ModelCapability.TEXT_GENERATION, ModelCapability.STRUCTURED_OUTPUT}
        ),
    )
    profile_registry.register(profile)
    config_registry = InMemoryModelExecutionConfigRegistry()
    config_registry.register(
        ModelExecutionConfig(
            config_id=ModelExecutionConfigId("cfg"),
            version="v1",
            name="c",
            description="d",
            profile_ref=ModelExecutionProfileRef(ModelExecutionProfileId("openai-profile"), "v1"),
            parameter_settings=(),
        )
    )
    agent_registry = InMemoryAgentDefinitionRegistry()
    agent_registry.register(
        AgentDefinition(
            agent_id=AGENT,
            version="v1",
            name="assessor",
            description="d",
            allowed_execution_profiles=(
                ModelExecutionProfileRef(ModelExecutionProfileId("openai-profile"), "v1"),
            ),
        )
    )
    binding_store = InMemoryAgentExecutionBindingStore()
    binding_mgr = AgentBindingManager(
        session_store,
        run_store,
        agent_registry,
        profile_registry,
        config_registry,
        binding_store,
        runtime_sink,
        binding_id_factory=seq,
        event_id_factory=seq,
        now=clock,
    )
    request_factory = AgentProviderExecutionRequestFactory(attempt_store)
    coordinator = RuntimeExecutionCoordinator(
        run_mgr,
        InMemoryProviderExecutionRequestStore(),
        InMemoryProviderExecutionResponseStore(),
        runtime_sink,
        event_id_factory=seq,
        now=clock,
    )

    executor = ResearchActionExecutor(
        controller=controller,
        retrieval_resolver=retrieval_resolver,
        context_compiler=compiler,
        prompt_assembler=assembler,
        projector=OpenAIProjector(),
        output_validator=output_validator,
        session_manager=session_mgr,
        run_manager=run_mgr,
        binding_manager=binding_mgr,
        request_factory=request_factory,
        execution_coordinator=coordinator,
        context_policy=context_policy,
        blinding_policy=BlindingPolicy(policy_id="none", version=1),
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("slice"), version=1),
        prompt_policy=prompt_policy,
        budget=ContextBudget(max_tokens=8192),
        output_contract_id=OutputContractId("example-assessment"),
        output_contract_version=1,
        template_registry=template_registry,
        target_states={ACTION_TYPE: STATE_ASSESSED},
        context_request_id_factory=seq,
        prompt_request_id_factory=seq,
        provider_request_id_factory=seq,
        candidate_id_factory=seq,
    )
    stores = {
        "state_store": state_store,
        "control_sink": control_sink,
        "runtime_sink": runtime_sink,
        "controller": controller,
    }
    return executor, stores


def _make_request() -> ActionExecutionRequest:
    return ActionExecutionRequest(
        project_id=PROJECT,
        branch_id=BRANCH,
        action_id=ACTION,
        target_object_id=OBJ,
        agent_id=AGENT,
        agent_version="v1",
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


def _binding_spec() -> ExecutionBindingSpec:
    return ExecutionBindingSpec(
        execution_profile_id="openai-profile",
        execution_profile_version="v1",
        execution_config_id="cfg",
        execution_config_version="v1",
    )


def test_int_slice_001_happy_path_commits(clock, seq, snapshot, definition):
    """Full chain: fake provider VALID -> Gate PASS -> COMMIT -> DomainEvent."""
    from packages.control.tasks import TaskStatus
    from packages.domain.enums import TransitionDecision
    from packages.domain.events import ControlEventType, DomainEvent
    from packages.runtime.contracts import RunStatus

    executor, stores = _build_stack(clock, seq, snapshot, definition)
    fake = FakeProviderExecutor([FakeProviderExecutor.success(dict(VALID_PAYLOAD))])

    record = executor.execute(_make_request(), definition, _binding_spec(), fake)

    # provider called exactly once with the projected prompt
    assert len(fake.calls) == 1

    # cognition: bundle + package compiled at the pre-execution revision
    assert record.bundle is not None and record.bundle.state_revision == 0
    assert record.prompt_package is not None
    assert record.validation is not None
    assert record.validation.status.value == "VALID"
    assert record.cognitive_result_id is not None

    # runtime: run SUCCEEDED
    assert record.run is not None
    assert record.run.status is RunStatus.SUCCEEDED

    # control: COMMIT, task SUCCEEDED, object ASSESSED, revision+1
    assert record.transition is not None
    assert record.transition.decision is TransitionDecision.COMMIT
    assert record.task.status is TaskStatus.SUCCEEDED
    new_state = stores["controller"].get_state(PROJECT, BRANCH)
    assert new_state.revision == 1
    assert new_state.object_states[OBJ] == STATE_ASSESSED
    assert record.failure is None

    # domain + control + runtime events all recorded (auditability §45)
    events = stores["state_store"].events()
    assert any(isinstance(e, DomainEvent) and e.new_state == STATE_ASSESSED for e in events)
    control_types = [e.event_type for e in stores["control_sink"].all_events()]
    assert ControlEventType.TASK_CREATED in control_types
    assert ControlEventType.OBJECT_STATE_CHANGED in control_types


def test_int_slice_002_invalid_output_no_commit(clock, seq, snapshot, definition):
    """Provider succeeded but cognitive INVALID: Run stays SUCCEEDED, no
    transition, no domain event, task FAILED, revision unchanged."""
    from packages.control.tasks import TaskStatus
    from packages.domain.enums import TransitionDecision
    from packages.runtime.contracts import RunStatus

    executor, stores = _build_stack(clock, seq, snapshot, definition)
    fake = FakeProviderExecutor([FakeProviderExecutor.success(dict(INVALID_PAYLOAD))])

    record = executor.execute(_make_request(), definition, _binding_spec(), fake)

    assert record.run is not None
    assert record.run.status is RunStatus.SUCCEEDED  # runtime ≠ scientific
    assert record.validation is not None
    assert record.validation.status.value == "INVALID"
    assert record.cognitive_result_id is None

    # Gate FAIL -> REJECT (aggregate_gates), not a silent drop
    assert record.transition is not None
    assert record.transition.decision is TransitionDecision.REJECT
    assert record.task.status is TaskStatus.FAILED
    assert record.failure is not None
    assert record.failure.kind == "OUTPUT_INVALID"

    new_state = stores["controller"].get_state(PROJECT, BRANCH)
    assert new_state.revision == 0
    assert new_state.object_states[OBJ] == STATE_DRAFT
    assert stores["state_store"].events() == []


def test_int_slice_003_provider_failure(clock, seq, snapshot, definition):
    """Provider exception: Run FAILED, task FAILED, no commit. Classified as
    runtime failure (retryable class), never a scientific verdict."""
    from packages.control.tasks import TaskStatus
    from packages.runtime.contracts import RunStatus

    executor, stores = _build_stack(clock, seq, snapshot, definition)
    fake = FakeProviderExecutor([])  # exhaustion raises inside executor

    record = executor.execute(_make_request(), definition, _binding_spec(), fake)

    assert record.run is not None
    assert record.run.status is RunStatus.FAILED
    assert record.validation is None
    assert record.failure is not None
    assert record.failure.kind == "PROVIDER_FAILED"
    assert record.task.status is TaskStatus.FAILED

    new_state = stores["controller"].get_state(PROJECT, BRANCH)
    assert new_state.revision == 0
    assert stores["state_store"].events() == []


def test_int_slice_004_stale_revision_guard(clock, seq, snapshot, definition):
    """A second execution against the same object re-reads state: after the
    first COMMIT the object is ASSESSED and the DRAFT-only action is now
    illegal — the controller refuses a second run of the same action."""
    from packages.control.errors import IllegalActionError

    executor, stores = _build_stack(clock, seq, snapshot, definition)
    fake1 = FakeProviderExecutor([FakeProviderExecutor.success(dict(VALID_PAYLOAD))])
    executor.execute(_make_request(), definition, _binding_spec(), fake1)

    fake2 = FakeProviderExecutor([FakeProviderExecutor.success(dict(VALID_PAYLOAD))])
    with pytest.raises(IllegalActionError):
        executor.execute(_make_request(), definition, _binding_spec(), fake2)
