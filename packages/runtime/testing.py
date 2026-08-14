"""In-memory runtime adapters — test/dev only (STEP-011 §27..30).

NOT production persistence. save() rejects duplicates; update() rejects
missing IDs — never silent upsert.
"""

from __future__ import annotations

from ..domain.ids import ExecutionAttemptId, RuntimeRunId, RuntimeSessionId
from .contracts import ExecutionAttempt, RuntimeRun, RuntimeSession
from .errors import DuplicateRuntimeObjectError, RuntimeObjectNotFoundError
from .events import RuntimeEvent


class InMemoryRuntimeSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[RuntimeSessionId, RuntimeSession] = {}

    def save(self, session: RuntimeSession) -> None:
        if session.session_id in self._sessions:
            raise DuplicateRuntimeObjectError(f"session already saved: {session.session_id}")
        self._sessions[session.session_id] = session

    def get(self, session_id: RuntimeSessionId) -> RuntimeSession:
        return self._sessions[session_id]

    def list_for_project(self, project_id, branch_id):  # type: ignore[no-untyped-def]
        return [
            s for s in self._sessions.values()
            if s.project_id == project_id and s.branch_id == branch_id
        ]

    def update(self, session: RuntimeSession) -> None:
        if session.session_id not in self._sessions:
            raise RuntimeObjectNotFoundError(f"session not found: {session.session_id}")
        self._sessions[session.session_id] = session


class InMemoryRuntimeRunStore:
    def __init__(self) -> None:
        self._runs: dict[RuntimeRunId, RuntimeRun] = {}

    def save(self, run: RuntimeRun) -> None:
        if run.run_id in self._runs:
            raise DuplicateRuntimeObjectError(f"run already saved: {run.run_id}")
        self._runs[run.run_id] = run

    def get(self, run_id: RuntimeRunId) -> RuntimeRun:
        return self._runs[run_id]

    def list_for_session(self, session_id: RuntimeSessionId) -> list[RuntimeRun]:
        return [r for r in self._runs.values() if r.session_id == session_id]

    def update(self, run: RuntimeRun) -> None:
        if run.run_id not in self._runs:
            raise RuntimeObjectNotFoundError(f"run not found: {run.run_id}")
        self._runs[run.run_id] = run


class InMemoryExecutionAttemptStore:
    def __init__(self) -> None:
        self._attempts: dict[ExecutionAttemptId, ExecutionAttempt] = {}

    def save(self, attempt: ExecutionAttempt) -> None:
        if attempt.attempt_id in self._attempts:
            raise DuplicateRuntimeObjectError(f"attempt already saved: {attempt.attempt_id}")
        self._attempts[attempt.attempt_id] = attempt

    def get(self, attempt_id):  # type: ignore[no-untyped-def]
        return self._attempts[attempt_id]

    def list_for_run(self, run_id: RuntimeRunId) -> list[ExecutionAttempt]:
        return [a for a in self._attempts.values() if a.run_id == run_id]

    def update(self, attempt: ExecutionAttempt) -> None:
        if attempt.attempt_id not in self._attempts:
            raise RuntimeObjectNotFoundError(f"attempt not found: {attempt.attempt_id}")
        self._attempts[attempt.attempt_id] = attempt


class InMemoryRuntimeEventSink:
    def __init__(self) -> None:
        self._events: list[RuntimeEvent] = []

    def append(self, event: RuntimeEvent) -> None:
        self._events.append(event)

    def list_for_session(self, session_id: RuntimeSessionId) -> list[RuntimeEvent]:
        return [e for e in self._events if e.session_id == session_id]

    def list_for_run(self, run_id: RuntimeRunId) -> list[RuntimeEvent]:
        return [e for e in self._events if e.run_id == run_id]


__all__ = [
    "FakeProviderExecutor",
    "InMemoryExecutionAttemptStore",
    "InMemoryRuntimeEventSink",
    "InMemoryRuntimeRunStore",
    "InMemoryRuntimeSessionStore",
    "InMemoryProviderExecutionRequestStore",
    "InMemoryProviderExecutionResponseStore",
    # STEP-013 agent registries/binding store are NOT exported here — they
    # remain accessible as attributes of the module but are intentionally
    # omitted from __all__ to keep them out of the public runtime API.
]


# =========================================================================
# Agent Definition / Profile / Binding stores (STEP-013) — test/dev only
# =========================================================================
from .agent import (  # noqa: E402
    AgentDefinition,
    AgentExecutionBinding,
    ModelExecutionProfile,
)
from .errors import AgentAlreadyBoundError  # noqa: E402


class InMemoryModelExecutionProfileRegistry:
    """Exact-version profile registry (STEP-013 §10). No latest/default."""

    def __init__(self) -> None:
        self._profiles: dict[tuple[str, str], ModelExecutionProfile] = {}

    def register(self, profile: ModelExecutionProfile) -> None:
        key = (str(profile.profile_id), profile.version)
        if key in self._profiles:
            raise DuplicateRuntimeObjectError(
                f"profile already registered: {profile.profile_id}/{profile.version}"
            )
        self._profiles[key] = profile

    def get(self, profile_id, version):  # type: ignore[no-untyped-def]
        key = (str(profile_id), version)
        if key not in self._profiles:
            from .errors import ModelExecutionProfileNotFoundError
            raise ModelExecutionProfileNotFoundError(
                f"profile not found: {profile_id}/{version}"
            )
        return self._profiles[key]

    def list_versions(self, profile_id):  # type: ignore[no-untyped-def]
        pid = str(profile_id)
        return sorted(v for (p, v) in self._profiles if p == pid)


class InMemoryAgentDefinitionRegistry:
    """Exact-version agent registry (STEP-013 §13). No latest resolution."""

    def __init__(self) -> None:
        self._agents: dict[tuple[str, str], AgentDefinition] = {}

    def register(self, definition: AgentDefinition) -> None:
        key = (str(definition.agent_id), definition.version)
        if key in self._agents:
            raise DuplicateRuntimeObjectError(
                f"agent already registered: {definition.agent_id}/{definition.version}"
            )
        self._agents[key] = definition

    def get(self, agent_id, version):  # type: ignore[no-untyped-def]
        key = (str(agent_id), version)
        if key not in self._agents:
            from .errors import AgentDefinitionNotFoundError
            raise AgentDefinitionNotFoundError(
                f"agent not found: {agent_id}/{version}"
            )
        return self._agents[key]

    def list_versions(self, agent_id):  # type: ignore[no-untyped-def]
        aid = str(agent_id)
        return sorted(v for (a, v) in self._agents if a == aid)


class InMemoryAgentExecutionBindingStore:
    """Append-only binding store (STEP-013 §21/§26/§30).

    No business update. ``discard`` exists solely for binding atomicity
    rollback when AGENT_BOUND emission fails.
    """

    def __init__(self) -> None:
        self._by_id: dict[str, AgentExecutionBinding] = {}
        self._by_run: dict[str, AgentExecutionBinding] = {}

    def save(self, binding: AgentExecutionBinding) -> None:
        bid = str(binding.binding_id)
        rid = str(binding.run_id)
        if bid in self._by_id:
            raise DuplicateRuntimeObjectError(
                f"binding already saved: {binding.binding_id}"
            )
        if rid in self._by_run:
            raise AgentAlreadyBoundError(
                f"run {binding.run_id} already has a binding"
            )
        self._by_id[bid] = binding
        self._by_run[rid] = binding

    def get(self, binding_id):  # type: ignore[no-untyped-def]
        return self._by_id[str(binding_id)]

    def get_for_run(self, run_id):  # type: ignore[no-untyped-def]
        return self._by_run.get(str(run_id))

    def list_for_session(self, session_id):  # type: ignore[no-untyped-def]
        sid = str(session_id)
        return [b for b in self._by_id.values() if str(b.session_id) == sid]

    def discard(self, binding_id) -> None:  # type: ignore[no-untyped-def]
        bid = str(binding_id)
        if bid not in self._by_id:
            raise RuntimeObjectNotFoundError(
                f"binding not found for discard: {binding_id}"
            )
        binding = self._by_id.pop(bid)
        self._by_run.pop(str(binding.run_id), None)


# =========================================================================
# Model Execution Config registry + Selection Recommendation store (STEP-014)
# =========================================================================
from .model_execution import ModelExecutionConfig  # noqa: E402
from .model_selection import ModelSelectionRecommendation  # noqa: E402


class InMemoryModelExecutionConfigRegistry:
    """Exact-version config registry (STEP-014 §15). No latest/default."""

    def __init__(self) -> None:
        self._configs: dict[tuple[str, str], ModelExecutionConfig] = {}

    def register(self, config: ModelExecutionConfig) -> None:
        key = (str(config.config_id), config.version)
        if key in self._configs:
            raise DuplicateRuntimeObjectError(
                f"config already registered: {config.config_id}/{config.version}"
            )
        self._configs[key] = config

    def get(self, config_id, version):  # type: ignore[no-untyped-def]
        key = (str(config_id), version)
        if key not in self._configs:
            from .errors import ModelExecutionConfigNotFoundError
            raise ModelExecutionConfigNotFoundError(
                f"config not found: {config_id}/{version}"
            )
        return self._configs[key]

    def list_versions(self, config_id):  # type: ignore[no-untyped-def]
        cid = str(config_id)
        return sorted(v for (c, v) in self._configs if c == cid)


class InMemoryModelSelectionRecommendationStore:
    """Append-only recommendation store (STEP-014 §50). Audit artifact."""

    def __init__(self) -> None:
        self._by_id: dict[str, ModelSelectionRecommendation] = {}

    def save(self, recommendation: ModelSelectionRecommendation) -> None:
        eid = str(recommendation.evaluation_id)
        if eid in self._by_id:
            raise DuplicateRuntimeObjectError(
                f"recommendation already saved: {recommendation.evaluation_id}"
            )
        self._by_id[eid] = recommendation

    def get(self, evaluation_id):  # type: ignore[no-untyped-def]
        return self._by_id[str(evaluation_id)]

    def list_for_agent(self, agent_id):  # type: ignore[no-untyped-def]
        aid = str(agent_id)
        return [r for r in self._by_id.values() if str(r.agent_id) == aid]


# =========================================================================
# Provider Execution Stores + Fake Executor
# =========================================================================
class InMemoryProviderExecutionRequestStore:
    def __init__(self) -> None:
        self._records = {}

    def save(self, request) -> None:  # type: ignore[no-untyped-def]
        rid = request.request_id
        if rid in self._records:
            raise DuplicateRuntimeObjectError(f"request already saved: {rid}")
        self._records[rid] = request

    def get(self, request_id):  # type: ignore[no-untyped-def]
        return self._records[request_id]

    def list_for_run(self, run_id):  # type: ignore[no-untyped-def]
        return [r for r in self._records.values() if r.run_id == run_id]


class InMemoryProviderExecutionResponseStore:
    def __init__(self) -> None:
        self._records = {}

    def save(self, response) -> None:  # type: ignore[no-untyped-def]
        rid = response.response_id
        if rid in self._records:
            raise DuplicateRuntimeObjectError(f"response already saved: {rid}")
        self._records[rid] = response

    def get(self, response_id):  # type: ignore[no-untyped-def]
        return self._records[response_id]

    def list_for_run(self, run_id):  # type: ignore[no-untyped-def]
        return [r for r in self._records.values() if r.run_id == run_id]


class _FakeSuccess:
    """Internal marker for FakeProviderExecutor scripted success."""

    def __init__(self, raw_output):  # type: ignore[no-untyped-def]
        self.raw_output = raw_output


class FakeProviderExecutor:
    """Deterministic scripted provider executor (STEP-012 §21).

    Consumes outcomes in order. Raises on exhaustion.
    """

    def __init__(self, outcomes):  # type: ignore[no-untyped-def]
        self._outcomes = list(outcomes)
        self._index = 0
        self.calls: list = []

    async def execute(self, request):  # type: ignore[no-untyped-def]
        from ..domain.ids import (
            ProviderExecutionResponseId,
            RuntimeArtifactId,
        )
        from .provider import (
            ProviderExecutionOutcome,
            ProviderExecutionOutcomeStatus,
            ProviderExecutionResponse,
            ProviderUsage,
        )

        self.calls.append(request)
        if self._index >= len(self._outcomes):
            raise RuntimeError(
                f"FakeProviderExecutor: outcomes exhausted "
                f"(consumed {self._index})"
            )
        item = self._outcomes[self._index]
        self._index += 1

        if isinstance(item, _FakeSuccess):
            resp = ProviderExecutionResponse(
                response_id=ProviderExecutionResponseId(
                    f"resp-{self._index}"
                ),
                artifact_id=RuntimeArtifactId(f"art-{self._index}"),
                request_id=request.request_id,
                session_id=request.session_id,
                run_id=request.run_id,
                attempt_id=request.attempt_id,
                project_id=request.project_id,
                branch_id=request.branch_id,
                provider=request.provider,
                model=request.model,
                raw_output=item.raw_output,
                usage=ProviderUsage(input_units=10, output_units=20),
            )
            return ProviderExecutionOutcome(
                status=ProviderExecutionOutcomeStatus.SUCCEEDED,
                response=resp,
            )
        # Already a proper ProviderExecutionOutcome (FAILED)
        return item

    @staticmethod
    def success(raw_output):  # type: ignore[no-untyped-def]
        """Helper to create a SUCCEEDED outcome marker."""
        return _FakeSuccess(raw_output)

    @staticmethod
    def failure(failure):  # type: ignore[no-untyped-def]
        """Helper to create a FAILED outcome."""
        from .provider import (
            ProviderExecutionOutcome,
            ProviderExecutionOutcomeStatus,
        )
        return ProviderExecutionOutcome(
            status=ProviderExecutionOutcomeStatus.FAILED,
            failure=failure,
        )
