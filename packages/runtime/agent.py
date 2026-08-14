"""Agent Definition, Model Execution Profile & Run Binding (STEP-013).

Establishes the versioned, immutable Agent Runtime Definition and the
explicit, run-scoped binding between an exact AgentDefinition version and an
exact ModelExecutionProfile version.

Core question this module answers:

    "Which exact Agent version, bound to which exact model execution profile
     version, is pinned to this RuntimeRun?"

Hard rules (STEP-013):

* AgentDefinition is a versioned RUNTIME definition, NOT mutable agent state.
* AgentDefinition does NOT own PromptPolicy / ContextPolicy / RetrievalPolicy
  / OutputContract / cognitive_mode / tools / skills / subagents / memory.
* No default profile, no latest resolution, no auto selection.
* Binding is allowed ONLY on a CREATED Run, exactly once per Run, immutable.
* Binding stores a provider/model snapshot resolved from the Profile.
* Binding is run-scoped, NOT attempt-scoped (no attempt_id on the binding).
* Binding does NOT transition the Run and does NOT create an Attempt.
* The Request Factory's provider/model/input_ref come from the Binding/Run;
  the caller CANNOT override them.
* Runtime imports neither cognition nor control here.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol, runtime_checkable

from ..domain.enums import ActorType
from ..domain.ids import (
    AgentExecutionBindingId,
    AgentId,
    BranchId,
    ModelExecutionProfileId,
    ProjectId,
    ProviderExecutionRequestId,
    RuntimeEventId,
    RuntimeRunId,
    RuntimeSessionId,
)
from .contracts import (
    AttemptStatus,
    ExecutionAttempt,
    RunStatus,
    RuntimeRun,
    RuntimeSession,
)
from .errors import (
    AgentAlreadyBoundError,
    AgentBindingScopeError,
    AgentBindingStoreError,
    AgentExecutionProfileNotAllowedError,
    IllegalAgentBindingStateError,
    RuntimeInvariantViolationError,
    RuntimeRunNotFoundError,
    RuntimeSessionNotFoundError,
)
from .events import RuntimeEvent, RuntimeEventType
from .provider import (
    ModelIdentifier,
    ProviderExecutionRequest,
    ProviderIdentifier,
)


# =========================================================================
# Helpers
# =========================================================================
def _check_non_empty(value: str, field_name: str, owner: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{owner} {field_name} must be a non-empty string")


def _check_tz(dt: datetime, name: str) -> None:
    if dt.tzinfo is None or dt.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware")


# =========================================================================
# ModelExecutionProfileRef
# =========================================================================
@dataclass(frozen=True)
class ModelExecutionProfileRef:
    """An immutable, exact reference to a profile version (STEP-013 §7).

    The AgentDefinition only stores refs — the binding resolves the actual
    Profile at bind time. Neither field may be empty.
    """

    profile_id: ModelExecutionProfileId
    version: str

    def __post_init__(self) -> None:
        _check_non_empty(str(self.profile_id), "profile_id", "ModelExecutionProfileRef")
        _check_non_empty(self.version, "version", "ModelExecutionProfileRef")


# =========================================================================
# ModelExecutionProfile
# =========================================================================
@dataclass(frozen=True)
class ModelExecutionProfile:
    """An immutable, versioned model execution profile (STEP-013 §8/§9).

    Pins ONLY provider identity + model identity. It deliberately does NOT
    carry generation parameters (temperature/top_p/max_tokens/seed/...) —
    those belong to a future ModelExecutionConfig. It also does NOT smuggle
    them via a generic ``parameters: dict``.
    """

    profile_id: ModelExecutionProfileId
    version: str
    name: str
    description: str
    provider: ProviderIdentifier
    model: ModelIdentifier
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _check_non_empty(str(self.profile_id), "profile_id", "ModelExecutionProfile")
        _check_non_empty(self.version, "version", "ModelExecutionProfile")
        _check_non_empty(self.name, "name", "ModelExecutionProfile")
        _check_non_empty(self.description, "description", "ModelExecutionProfile")

    @property
    def ref(self) -> ModelExecutionProfileRef:
        return ModelExecutionProfileRef(
            profile_id=self.profile_id, version=self.version,
        )


# =========================================================================
# AgentDefinition
# =========================================================================
@dataclass(frozen=True)
class AgentDefinition:
    """An immutable, versioned Agent Runtime Definition (STEP-013 §4/§11).

    Declares ONLY identity, version, and allowed model execution profiles.
    It is NOT a Prompt, NOT a CognitiveMode, NOT a Research Role, and NOT
    mutable agent state. It owns NO cognitive policy and NO tool/skill/
    subagent wiring. It carries NO default/preferred/primary profile.
    """

    agent_id: AgentId
    version: str
    name: str
    description: str
    allowed_execution_profiles: tuple[ModelExecutionProfileRef, ...]
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _check_non_empty(str(self.agent_id), "agent_id", "AgentDefinition")
        _check_non_empty(self.version, "version", "AgentDefinition")
        _check_non_empty(self.name, "name", "AgentDefinition")
        _check_non_empty(self.description, "description", "AgentDefinition")
        if not isinstance(self.allowed_execution_profiles, tuple):
            raise ValueError("allowed_execution_profiles must be a tuple")
        if len(self.allowed_execution_profiles) < 1:
            raise ValueError("AgentDefinition requires at least one allowed profile")
        seen: set[tuple[str, str]] = set()
        for ref in self.allowed_execution_profiles:
            key = (str(ref.profile_id), ref.version)
            if key in seen:
                raise ValueError(
                    f"duplicate allowed profile ref: {ref.profile_id}/{ref.version}"
                )
            seen.add(key)


# =========================================================================
# AgentExecutionBinding
# =========================================================================
@dataclass(frozen=True)
class AgentExecutionBinding:
    """An immutable, run-scoped binding (STEP-013 §15/§16/§38).

    Pins an exact AgentDefinition version and an exact ModelExecutionProfile
    version to a single RuntimeRun. The provider/model fields are a SNAPSHOT
    resolved from the Profile at bind time — so an existing Run can always
    answer "what provider/model was actually bound" even if the registry
    changes later.

    Run-scoped, NOT attempt-scoped: there is NO attempt_id here. Future
    retries (attempt #1, #2, ...) share the same Run binding.
    """

    binding_id: AgentExecutionBindingId
    session_id: RuntimeSessionId
    run_id: RuntimeRunId
    project_id: ProjectId
    branch_id: BranchId

    agent_id: AgentId
    agent_version: str
    execution_profile_id: ModelExecutionProfileId
    execution_profile_version: str

    provider: ProviderIdentifier
    model: ModelIdentifier

    created_by: ActorType
    created_at: datetime
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _check_non_empty(str(self.binding_id), "binding_id", "AgentExecutionBinding")
        _check_non_empty(str(self.agent_id), "agent_id", "AgentExecutionBinding")
        _check_non_empty(self.agent_version, "agent_version", "AgentExecutionBinding")
        _check_non_empty(
            str(self.execution_profile_id), "execution_profile_id", "AgentExecutionBinding",
        )
        _check_non_empty(
            self.execution_profile_version, "execution_profile_version", "AgentExecutionBinding",
        )
        _check_tz(self.created_at, "created_at")


# =========================================================================
# Registries (Ports)
# =========================================================================
@runtime_checkable
class ModelExecutionProfileRegistry(Protocol):
    """Exact-version profile registry (STEP-013 §10).

    NO get_latest / get_default / get_first. Resolution is always by exact
    (profile_id, version).
    """

    def register(self, profile: ModelExecutionProfile) -> None:
        """Create. MUST reject a duplicate (profile_id, version)."""
        ...

    def get(
        self, profile_id: ModelExecutionProfileId, version: str,
    ) -> ModelExecutionProfile:
        """Resolve by EXACT version. Raise if not found (no fallback)."""
        ...

    def list_versions(self, profile_id: ModelExecutionProfileId) -> list[str]:
        ...


@runtime_checkable
class AgentDefinitionRegistry(Protocol):
    """Exact-version agent registry (STEP-013 §13).

    NO get_latest / latest_agent / resolve_latest.
    """

    def register(self, definition: AgentDefinition) -> None:
        """Create. MUST reject a duplicate (agent_id, version)."""
        ...

    def get(self, agent_id: AgentId, version: str) -> AgentDefinition:
        """Resolve by EXACT version. Raise if not found (no fallback)."""
        ...

    def list_versions(self, agent_id: AgentId) -> list[str]:
        ...


@runtime_checkable
class AgentExecutionBindingStore(Protocol):
    """Append-only store of immutable bindings (STEP-013 §21/§26).

    Provides NO business update (no upsert/overwrite). ``discard`` exists
    ONLY so AgentBindingManager can roll back a half-committed binding when
    AGENT_BOUND event emission fails — it removes an unobservable, never-
    emitted binding record. It is NOT a mutation of a committed binding.
    """

    def save(self, binding: AgentExecutionBinding) -> None:
        """Create. MUST reject a duplicate binding_id AND a second binding
        for the same Run."""
        ...

    def get(self, binding_id: AgentExecutionBindingId) -> AgentExecutionBinding:
        ...

    def get_for_run(self, run_id: RuntimeRunId) -> AgentExecutionBinding | None:
        ...

    def list_for_session(self, session_id: RuntimeSessionId) -> list[AgentExecutionBinding]:
        ...

    def discard(self, binding_id: AgentExecutionBindingId) -> None:
        """Roll back a binding whose AGENT_BOUND event was never emitted.
        Raises if the binding does not exist. NOT a business mutation."""
        ...


# =========================================================================
# AgentBindingManager
# =========================================================================
class AgentBindingManager:
    """Strict binding orchestrator (STEP-013 §29/§30).

    Responsibilities, in order:

        1. resolve Session
        2. resolve Run
        3. validate scope
        4. validate Run == CREATED
        5. ensure Run has no Binding
        6. resolve exact AgentDefinition
        7. resolve exact ModelExecutionProfile
        8. validate selected Profile is allowed
        9. construct immutable Binding (with provider/model snapshot)
       10. save Binding
       11. emit AGENT_BOUND  (on failure: discard the binding — no half state)
       12. return Binding

    It does NOT mark_ready, start_run, create an Attempt, execute a
    provider, select a model, or modify the Run.
    """

    def __init__(
        self,
        session_store: object,
        run_store: object,
        agent_registry: AgentDefinitionRegistry,
        profile_registry: ModelExecutionProfileRegistry,
        binding_store: AgentExecutionBindingStore,
        event_sink: object,
        *,
        binding_id_factory: Callable[[], str] | None = None,
        event_id_factory: Callable[[], str] | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._session_store = session_store
        self._run_store = run_store
        self._agents = agent_registry
        self._profiles = profile_registry
        self._bindings = binding_store
        self._sink = event_sink
        self._binding_id_factory = binding_id_factory or (lambda: uuid.uuid4().hex)
        self._event_id_factory = event_id_factory or (lambda: uuid.uuid4().hex)
        self._now = now or _default_now

    def bind_agent(
        self,
        *,
        session_id: RuntimeSessionId,
        run_id: RuntimeRunId,
        agent_id: AgentId,
        agent_version: str,
        execution_profile_id: ModelExecutionProfileId,
        execution_profile_version: str,
        actor: ActorType = ActorType.SYSTEM,
    ) -> AgentExecutionBinding:
        # 1. resolve Session + 2. resolve Run
        session = self._resolve_session(session_id)
        run = self._resolve_run(run_id)
        # 3. validate scope
        self._validate_scope(session, run)
        # 4. validate Run == CREATED
        if run.status is not RunStatus.CREATED:
            raise IllegalAgentBindingStateError(
                f"run {run_id} is {run.status.value}; must be CREATED to bind"
            )
        # 5. ensure Run has no Binding
        if self._bindings.get_for_run(run_id) is not None:
            raise AgentAlreadyBoundError(f"run {run_id} already has a binding")
        # 6. resolve exact AgentDefinition
        definition = self._agents.get(agent_id, agent_version)
        # 7. resolve exact ModelExecutionProfile
        profile = self._profiles.get(execution_profile_id, execution_profile_version)
        # 8. validate selected Profile is allowed
        selected_ref = ModelExecutionProfileRef(
            profile_id=execution_profile_id, version=execution_profile_version,
        )
        if selected_ref not in definition.allowed_execution_profiles:
            raise AgentExecutionProfileNotAllowedError(
                f"profile {execution_profile_id}/{execution_profile_version} "
                f"is not allowed for agent {agent_id}/{agent_version}"
            )

        # 9. construct immutable Binding with provider/model snapshot
        ts = self._now()
        binding = AgentExecutionBinding(
            binding_id=AgentExecutionBindingId(self._binding_id_factory()),
            session_id=session.session_id,
            run_id=run.run_id,
            project_id=run.project_id,
            branch_id=run.branch_id,
            agent_id=definition.agent_id,
            agent_version=definition.version,
            execution_profile_id=profile.profile_id,
            execution_profile_version=profile.version,
            provider=profile.provider,
            model=profile.model,
            created_by=actor,
            created_at=ts,
        )

        # 10. save Binding
        try:
            self._bindings.save(binding)
        except Exception as exc:
            # Store failure: do NOT emit AGENT_BOUND (AGT-056).
            raise AgentBindingStoreError(f"failed to save binding: {exc}") from exc

        # 11. emit AGENT_BOUND — on failure, discard the binding (AGT-057)
        try:
            self._emit_agent_bound(binding, session, ts, actor)
        except Exception as exc:
            try:
                self._bindings.discard(binding.binding_id)
            except Exception as discard_exc:  # pragma: no cover - defensive
                raise AgentBindingStoreError(
                    f"failed to roll back binding after event emission failure: "
                    f"{discard_exc}"
                ) from exc
            raise AgentBindingStoreError(
                f"failed to emit AGENT_BOUND; binding rolled back: {exc}"
            ) from exc

        # 12. return Binding
        return binding

    # --- resolution ------------------------------------------------------
    def _resolve_session(self, session_id: RuntimeSessionId) -> RuntimeSession:
        try:
            return self._session_store.get(session_id)  # type: ignore[attr-defined]
        except KeyError:
            raise RuntimeSessionNotFoundError(f"session not found: {session_id}") from None

    def _resolve_run(self, run_id: RuntimeRunId) -> RuntimeRun:
        try:
            return self._run_store.get(run_id)  # type: ignore[attr-defined]
        except KeyError:
            raise RuntimeRunNotFoundError(f"run not found: {run_id}") from None

    def _validate_scope(
        self, session: RuntimeSession, run: RuntimeRun,
    ) -> None:
        if run.session_id != session.session_id:
            raise AgentBindingScopeError(
                f"run.session_id {run.session_id} != session.session_id "
                f"{session.session_id}"
            )
        if run.project_id != session.project_id:
            raise AgentBindingScopeError("run/project project_id mismatch")
        if run.branch_id != session.branch_id:
            raise AgentBindingScopeError("run/branch branch_id mismatch")

    # --- events ----------------------------------------------------------
    def _emit_agent_bound(
        self,
        binding: AgentExecutionBinding,
        session: RuntimeSession,
        ts: datetime,
        actor: ActorType,
    ) -> None:
        self._sink.append(RuntimeEvent(  # type: ignore[attr-defined]
            event_id=RuntimeEventId(self._event_id_factory()),
            event_type=RuntimeEventType.AGENT_BOUND,
            session_id=session.session_id,
            run_id=binding.run_id,
            attempt_id=None,
            project_id=session.project_id,
            branch_id=session.branch_id,
            actor=actor,
            occurred_at=ts,
            previous_status=RunStatus.CREATED.value,
            new_status=RunStatus.CREATED.value,
            metadata={
                "binding_id": str(binding.binding_id),
                "agent_id": str(binding.agent_id),
                "agent_version": binding.agent_version,
                "execution_profile_id": str(binding.execution_profile_id),
                "execution_profile_version": binding.execution_profile_version,
                "provider": binding.provider.name,
                "model": binding.model.name,
            },
        ))


# =========================================================================
# AgentProviderExecutionRequestFactory
# =========================================================================
class AgentProviderExecutionRequestFactory:
    """Builds a ProviderExecutionRequest from a Binding (STEP-013 §32..§37).

    The provider/model come from the Binding snapshot; input_ref comes from
    the Run. The caller CANNOT override any of them — the API simply has no
    such parameters. This factory does NOT call the provider and does NOT
    persist the request.
    """

    def __init__(self, attempt_store: object) -> None:
        self._attempts = attempt_store

    def build(
        self,
        *,
        binding: AgentExecutionBinding,
        session: RuntimeSession,
        run: RuntimeRun,
        attempt: ExecutionAttempt,
        request_id: ProviderExecutionRequestId,
        projected_input: object,
        created_at: datetime,
        metadata: Mapping[str, object] | None = None,
    ) -> ProviderExecutionRequest:
        # Scope validation (§36)
        if binding.session_id != session.session_id:
            raise AgentBindingScopeError("binding.session_id != session.session_id")
        if binding.run_id != run.run_id:
            raise AgentBindingScopeError("binding.run_id != run.run_id")
        if binding.project_id != session.project_id:
            raise AgentBindingScopeError("binding/project project_id mismatch")
        if binding.branch_id != session.branch_id:
            raise AgentBindingScopeError("binding/branch branch_id mismatch")
        if run.session_id != session.session_id:
            raise AgentBindingScopeError("run/session session_id mismatch")
        if run.project_id != session.project_id:
            raise AgentBindingScopeError("run/session project_id mismatch")
        if run.branch_id != session.branch_id:
            raise AgentBindingScopeError("run/session branch_id mismatch")
        if attempt.run_id != run.run_id:
            raise AgentBindingScopeError("attempt.run_id != run.run_id")

        # Lifecycle checks (§36)
        if run.status is not RunStatus.RUNNING:
            raise IllegalAgentBindingStateError(
                f"run must be RUNNING, got {run.status.value}"
            )
        if attempt.status is not AttemptStatus.RUNNING:
            raise IllegalAgentBindingStateError(
                f"attempt must be RUNNING, got {attempt.status.value}"
            )

        # Current active attempt verification (§37)
        active = self._active_attempts(run.run_id)
        if len(active) == 0:
            raise RuntimeInvariantViolationError(
                f"run {run.run_id} has no active RUNNING attempt"
            )
        if len(active) > 1:
            raise RuntimeInvariantViolationError(
                f"run {run.run_id} has multiple active RUNNING attempts"
            )
        if active[0].attempt_id != attempt.attempt_id:
            raise AgentBindingScopeError(
                f"attempt {attempt.attempt_id} is not the current active attempt "
                f"{active[0].attempt_id}"
            )

        # Build request — provider/model/input_ref sourced exclusively from
        # the Binding/Run. The caller cannot override.
        return ProviderExecutionRequest(
            request_id=request_id,
            session_id=session.session_id,
            run_id=run.run_id,
            attempt_id=attempt.attempt_id,
            project_id=run.project_id,
            branch_id=run.branch_id,
            provider=binding.provider,
            model=binding.model,
            input_ref=run.input_ref,
            projected_input=projected_input,
            created_at=created_at,
            metadata=metadata if metadata is not None else {},
        )

    def _active_attempts(self, run_id: RuntimeRunId) -> list[ExecutionAttempt]:
        all_attempts: list[ExecutionAttempt] = self._attempts.list_for_run(run_id)  # type: ignore[attr-defined]
        return [a for a in all_attempts if a.status is AttemptStatus.RUNNING]


def _default_now() -> datetime:
    return datetime.now(UTC)


__all__ = [
    "AgentBindingManager",
    "AgentDefinition",
    "AgentDefinitionRegistry",
    "AgentExecutionBinding",
    "AgentExecutionBindingStore",
    "AgentProviderExecutionRequestFactory",
    "ModelExecutionProfile",
    "ModelExecutionProfileRef",
    "ModelExecutionProfileRegistry",
]
