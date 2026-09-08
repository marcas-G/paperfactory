"""Shared helpers for STEP-014 (model execution config + selection) tests.

These build the small typed objects (profiles, configs, agents, stacks) used
across the CFG / SEL / E2E / integration tests. Kept here to avoid repeating
the boilerplate in every test module.
"""

from __future__ import annotations

import itertools
from collections.abc import Callable
from datetime import UTC, datetime

from packages.domain.ids import (
    AgentId,
    BranchId,
    ModelExecutionConfigId,
    ModelExecutionProfileId,
    ProjectId,
)
from packages.runtime import (
    AgentBindingManager,
    AgentDefinition,
    ModelCapability,
    ModelExecutionConfig,
    ModelExecutionProfile,
    ModelExecutionProfileRef,
    ModelIdentifier,
    ModelParameter,
    ProviderIdentifier,
    RuntimeRunManager,
    RuntimeSessionManager,
)
from packages.runtime.testing import (
    InMemoryExecutionAttemptStore,
    InMemoryRuntimeEventSink,
    InMemoryRuntimeRunStore,
    InMemoryRuntimeSessionStore,
)

PROJECT = ProjectId("P1")
BRANCH = BranchId("B1")
TZ = datetime(2026, 1, 1, tzinfo=UTC)
FAKE_PROVIDER = ProviderIdentifier(name="fake")
OPENAI_PROVIDER = ProviderIdentifier(name="openai")
FAKE_MODEL_V1 = ModelIdentifier(name="fake-model-v1")
FAKE_MODEL_V2 = ModelIdentifier(name="fake-model-v2")
TEXT = frozenset({ModelCapability.TEXT_GENERATION})
TEXT_STRUCT = frozenset({ModelCapability.TEXT_GENERATION, ModelCapability.STRUCTURED_OUTPUT})
PARAMS_BASIC = frozenset({ModelParameter.TEMPERATURE, ModelParameter.MAX_OUTPUT_UNITS})
PARAMS_NONE = frozenset()


class Counter:
    _global = itertools.count(1)

    def __init__(self, prefix: str) -> None:
        self._prefix = prefix

    def __call__(self) -> str:
        return f"{self._prefix}-{next(Counter._global)}"


def make_profile(
    pid="profile-A",
    version="v1",
    *,
    provider=FAKE_PROVIDER,
    model=FAKE_MODEL_V1,
    capabilities=TEXT_STRUCT,
    supported_parameters=PARAMS_BASIC,
):
    return ModelExecutionProfile(
        profile_id=ModelExecutionProfileId(pid),
        version=version,
        name=f"{pid} {version}",
        description="d",
        provider=provider,
        model=model,
        capabilities=capabilities,
        supported_parameters=supported_parameters,
    )


def make_config(
    cid="config-A",
    version="v1",
    *,
    profile_ref=None,
    settings=(),
):
    if profile_ref is None:
        profile_ref = ModelExecutionProfileRef(ModelExecutionProfileId("profile-A"), "v1")
    return ModelExecutionConfig(
        config_id=ModelExecutionConfigId(cid),
        version=version,
        name=f"{cid} {version}",
        description="d",
        profile_ref=profile_ref,
        parameter_settings=tuple(settings),
    )


def make_agent(aid="agent-A", version="v1", refs=None):
    if refs is None:
        refs = (ModelExecutionProfileRef(ModelExecutionProfileId("profile-A"), "v1"),)
    return AgentDefinition(
        agent_id=AgentId(aid),
        version=version,
        name=f"{aid} {version}",
        description="d",
        allowed_execution_profiles=refs,
    )


def build_stack(clock: Callable[[], datetime] | None = None):
    sess_store = InMemoryRuntimeSessionStore()
    run_store = InMemoryRuntimeRunStore()
    att_store = InMemoryExecutionAttemptStore()
    sink = InMemoryRuntimeEventSink()
    now = clock or (lambda: TZ)
    sm = RuntimeSessionManager(
        sess_store,
        run_store,
        sink,
        session_id_factory=Counter("sess"),
        event_id_factory=Counter("evt"),
        now=now,
    )
    rm = RuntimeRunManager(
        sess_store,
        run_store,
        att_store,
        sink,
        run_id_factory=Counter("run"),
        attempt_id_factory=Counter("att"),
        event_id_factory=Counter("evt"),
        now=now,
    )
    return sm, rm, sink, sess_store, run_store, att_store, now


def build_manager(
    sess_store, run_store, agent_reg, profile_reg, config_reg, binding_store, sink, now
):
    return AgentBindingManager(
        sess_store,
        run_store,
        agent_reg,
        profile_reg,
        config_reg,
        binding_store,
        sink,
        binding_id_factory=Counter("bind"),
        event_id_factory=Counter("evt"),
        now=now,
    )
