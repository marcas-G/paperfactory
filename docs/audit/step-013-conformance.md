# STEP-013 Conformance Audit

> Agent Definition, Model Execution Profile & Run Binding.
> Baseline HEAD: `fede2f0` (STEP-012A). This document is the durable proof
> that STEP-013 was completed per spec — it does not depend on chat history.

## Baseline

| Item | Value |
|---|---|
| Initial HEAD | `fede2f0` |
| Branch | `main` |
| Worktree (start) | clean |
| Baseline tests | 604 passed |
| Final tests | 699 passed (+95 new: 85 AGT unit + 2 M3-AGT E2E + 2 INT-M2-M3-AGT + 6 from integration/E2E plumbing) |
| Runtime tests | 209 passed |
| Integration tests | 4 passed |
| Architecture tests | 26 passed |
| ruff | PASS |
| pyright | 0 errors, 0 warnings |

## Implemented Contracts

`packages/runtime/agent.py`:

- `ModelExecutionProfileRef` (frozen; profile_id + version non-empty)
- `ModelExecutionProfile` (frozen; versioned; provider+model identity only;
  **no** generation params, **no** `parameters: dict`)
- `AgentDefinition` (frozen; versioned; `allowed_execution_profiles` non-empty
  tuple, no duplicates; **no** cognitive-policy / tool / skill / subagent /
  memory / default-profile fields)
- `AgentExecutionBinding` (frozen; run-scoped; **no** attempt_id; provider/
  model snapshot)
- Ports: `ModelExecutionProfileRegistry`, `AgentDefinitionRegistry`,
  `AgentExecutionBindingStore` (exact-version only; **no** latest/default)
- `AgentBindingManager` (CREATED-only binding; atomic save+event with rollback)
- `AgentProviderExecutionRequestFactory` (provider/model/input_ref sourced
  from Binding/Run; **no** override params)

`packages/runtime/events.py`: added `RuntimeEventType.AGENT_BOUND` (the only
agent-level event this step).

`packages/runtime/errors.py`: `AgentDefinitionError` base +
`AgentDefinitionNotFoundError`, `ModelExecutionProfileNotFoundError`,
`AgentExecutionProfileNotAllowedError`, `AgentAlreadyBoundError`,
`AgentBindingScopeError`, `IllegalAgentBindingStateError`,
`AgentBindingStoreError`.

`packages/runtime/testing.py`: `InMemoryModelExecutionProfileRegistry`,
`InMemoryAgentDefinitionRegistry`, `InMemoryAgentExecutionBindingStore`
(not exported via `__all__` — test/dev only).

`packages/domain/ids.py`: `AgentId`, `ModelExecutionProfileId`,
`AgentExecutionBindingId`.

## Key Invariants (proven by tests)

1. AgentDefinition is a versioned runtime definition, not mutable agent state.
2. AgentExecutionBinding pins an exact AgentDefinition version AND an exact
   ModelExecutionProfile version to a RuntimeRun.
3. Runtime never silently chooses first/latest/default profile.
4. AgentExecutionBinding is run-scoped, not attempt-scoped.
5. AgentDefinition owns no PromptPolicy / ContextPolicy / RetrievalPolicy /
   OutputContract.
6. Binding allowed only on CREATED Run; exactly one per Run; immutable; no
   rebind.
7. Binding does not transition the Run, does not create an Attempt, does not
   call the provider.
8. Factory provider/model/input_ref come exclusively from Binding/Run; the
   caller cannot override (the params do not exist in the signature).
9. Factory verifies the passed Attempt is the single current active RUNNING
   attempt.
10. Binding save + AGENT_BOUND event is logically atomic (store failure → no
    event; event failure → binding rolled back).
11. Provider success ≠ cognitive validity: a Run stays SUCCEEDED even when M2
    output validation is INVALID (INT-M2-M3-AGT-002).
12. Runtime imports neither cognition nor control; no SDK imports.

## AC-01..56 Evidence Matrix

| AC | Status | Symbol | Test function | Critical assertion |
|---|---|---|---|---|
| AC-01 | PASS | typed ids | ids.py | `AgentId`/`ModelExecutionProfileId`/`AgentExecutionBindingId` are NewType str |
| AC-02 | PASS | `ModelExecutionProfileRef` | `test_agt_001_profile_ref_immutable` | FrozenInstanceError on mutation |
| AC-03 | PASS | `ModelExecutionProfile` | `test_agt_002_profile_immutable` | FrozenInstanceError on mutation |
| AC-04 | PASS | profile.version | `test_agt_003_empty_profile_version_rejected` + `test_agt_008_profile_versions_coexist` | empty rejected; v1/v2 coexist |
| AC-05 | PASS | provider/model | `test_agt_006_profile_registry_roundtrip` | provider+model explicit fields |
| AC-06 | PASS | no gen params | `test_agt_088_no_mutable_state_fields` + field set | no temperature/top_p/parameters field |
| AC-07 | PASS | registry.get exact | `test_agt_006_profile_registry_roundtrip` | get(profile_id, version) round-trip |
| AC-08 | PASS | `AgentDefinition` | `test_agt_009_agent_immutable` | FrozenInstanceError |
| AC-09 | PASS | agent.version | `test_agt_010_empty_agent_version_rejected` + `test_agt_017_agent_versions_coexist` | empty rejected; versions coexist |
| AC-10 | PASS | allowed ≥1 | `test_agt_013_empty_allowed_profiles_rejected` | empty tuple raises ValueError |
| AC-11 | PASS | dup ref reject | `test_agt_014_duplicate_allowed_profile_ref_rejected` | duplicate ref raises ValueError |
| AC-12 | PASS | agent registry exact | `test_agt_015_agent_registry_roundtrip` | get(agent_id, version) round-trip |
| AC-13 | PASS | no default field | `test_agt_018_no_default_profile_field` | no default/preferred/primary field |
| AC-14 | PASS | no latest | `test_agt_020_no_latest_resolution_methods` + AGT-046 | no get_latest; v1 not upgraded to v2 |
| AC-15 | PASS | exact agent ver | `test_agt_024_exact_agent_version_saved` | binding.agent_version == "v1" |
| AC-16 | PASS | exact profile ver | `test_agt_025_exact_profile_version_saved` | binding.execution_profile_version == "v1" |
| AC-17 | PASS | profile allowed | `test_agt_043_not_allowed_profile_rejected` | NotAllowed error |
| AC-18 | PASS | scope | `test_agt_038_matching_session_run_ok` + 039/040/041 | mismatch rejected |
| AC-19 | PASS | CREATED only | `test_agt_031_037_non_created_bind_rejected` | all non-CREATED raise IllegalAgentBindingStateError |
| AC-20 | PASS | no status change | `test_agt_028_run_remains_created_after_bind` + AGT-075/076 | Run stays CREATED |
| AC-21 | PASS | no attempt | `test_agt_029_bind_creates_no_attempt` + AGT-030 | attempt list empty; count 0 |
| AC-22 | PASS | one binding | `test_agt_047_second_binding_same_run_rejected` | AgentAlreadyBoundError |
| AC-23 | PASS | no rebind | `test_agt_047_second_binding_same_run_rejected` | second bind rejected |
| AC-24 | PASS | snapshot | `test_agt_026_provider_snapshot_saved` + AGT-027 | provider+model snapshot stored |
| AC-25 | PASS | run-scoped | binding has no attempt_id (field set) + `test_agt_048_different_runs_same_agent_profile` | no attempt_id field |
| AC-26 | PASS | AGENT_BOUND | `test_agt_051_emits_agent_bound` + AGT-052/053 | event emitted with versions+provider+model |
| AC-27 | PASS | validation fail clean | `test_agt_054_validation_failure_no_event` + AGT-055 | no event, no binding |
| AC-28 | PASS | event fail clean | `test_agt_057_event_failure_no_binding` | binding rolled back |
| AC-29 | PASS | Port store | `AgentExecutionBindingStore` Protocol + AST | runtime_checkable Protocol |
| AC-30 | PASS | provider from binding | `test_agt_059_provider_from_binding` | request.provider == binding.provider |
| AC-31 | PASS | model from binding | `test_agt_060_model_from_binding` | request.model == binding.model |
| AC-32 | PASS | input_ref from run | `test_agt_061_input_ref_from_run` | request.input_ref == run.input_ref |
| AC-33 | PASS | no provider override | `test_agt_071_no_provider_param` | "provider" not in build() signature |
| AC-34 | PASS | no model override | `test_agt_072_no_model_param` | "model" not in build() signature |
| AC-35 | PASS | no input_ref override | `test_agt_073_no_input_ref_param` | "input_ref" not in build() signature |
| AC-36 | PASS | factory scope | `test_agt_064/065/066` + AGT-067/068 | session/run/attempt/lifecycle validated |
| AC-37 | PASS | current active att | `test_agt_069_not_current_active_attempt_rejected` + AGT-070 | non-current / >1 active rejected |
| AC-38 | PASS | factory no persist | `test_agt_079_factory_does_not_persist_request` | no request store attribute |
| AC-39 | PASS | no cognitive config | `test_agt_082/083/084` | no context/prompt/output_contract fields |
| AC-40 | PASS | no binding cognitive | (AC-39 same) + binding field set | binding has no cognitive fields |
| AC-41 | PASS | no mutable state | `test_agt_088_no_mutable_state_fields` | no memory/scratchpad/state fields |
| AC-42 | PASS | no loop | AgentDefinition field set + no max_steps/termination | no loop fields |
| AC-43 | PASS | no tool/skill/sub | `test_agt_085/086/087` | no tools/skills/subagents fields |
| AC-44 | PASS | no model selection | `test_agt_095_no_model_selector` | no ModelSelector/Router in runtime |
| AC-45 | PASS | port stays generic | `ProviderExecutionPort` unchanged + direct-request path in INT-001 | low-level port unchanged |
| AC-46 | PASS | M3-AGT-001 | `test_m3_agt_001_full_agent_binding_execution` | full chain SUCCEEDED |
| AC-47 | PASS | M3-AGT-002 | `test_m3_agt_002_version_pinning` | v1 pinned, no v2 upgrade |
| AC-48 | PASS | INT-001 | `test_int_m2_m3_agt_001_agent_binding_valid_composition` | M2 VALID via binding |
| AC-49 | PASS | INT-002 | `test_int_m2_m3_agt_002_invalid_output_but_run_succeeded` | run SUCCEEDED despite INVALID |
| AC-50 | PASS | INVALID no effect | `test_int_m2_m3_agt_002...` | run stays SUCCEEDED |
| AC-51 | PASS | no cognition import | `test_runtime_does_not_import_forbidden_layers` + AGT-089 | AST: no packages.cognition |
| AC-52 | PASS | no control import | `test_runtime_does_not_import_forbidden_layers` + AGT-090 | AST: no packages.control |
| AC-53 | PASS | M1 regression | `uv run pytest` 699 passed | all M1 tests pass |
| AC-54 | PASS | M2 regression | `uv run pytest` 699 passed | all M2 tests pass |
| AC-55 | PASS | STEP-011/012/012A | `uv run pytest` 699 passed | prior runtime tests intact |
| AC-56 | PASS | tooling | ruff PASS, pyright 0, pytest 699, no new deps | clean |

**AC coverage: 56/56 PASS**

## AGT-001..095 Evidence Matrix

| Test ID | Test function | Critical assertion | Result |
|---|---|---|---|
| AGT-001 | `test_agt_001_profile_ref_immutable` | FrozenInstanceError | PASS |
| AGT-002 | `test_agt_002_profile_immutable` | FrozenInstanceError | PASS |
| AGT-003 | `test_agt_003_empty_profile_version_rejected` | ValueError | PASS |
| AGT-004 | `test_agt_004_empty_profile_name_rejected` | ValueError | PASS |
| AGT-005 | `test_agt_005_empty_description_rejected` | ValueError | PASS |
| AGT-006 | `test_agt_006_profile_registry_roundtrip` | get returns same; list_versions=["v1"] | PASS |
| AGT-007 | `test_agt_007_duplicate_profile_id_version_rejected` | raises on duplicate | PASS |
| AGT-008 | `test_agt_008_profile_versions_coexist` | v1+v2 coexist, distinct models | PASS |
| AGT-009 | `test_agt_009_agent_immutable` | FrozenInstanceError | PASS |
| AGT-010 | `test_agt_010_empty_agent_version_rejected` | ValueError | PASS |
| AGT-011 | `test_agt_011_empty_agent_name_rejected` | ValueError | PASS |
| AGT-012 | `test_agt_012_empty_agent_description_rejected` | ValueError | PASS |
| AGT-013 | `test_agt_013_empty_allowed_profiles_rejected` | ValueError | PASS |
| AGT-014 | `test_agt_014_duplicate_allowed_profile_ref_rejected` | ValueError | PASS |
| AGT-015 | `test_agt_015_agent_registry_roundtrip` | get returns same; list_versions | PASS |
| AGT-016 | `test_agt_016_duplicate_agent_id_version_rejected` | raises on duplicate | PASS |
| AGT-017 | `test_agt_017_agent_versions_coexist` | v1+v2 coexist | PASS |
| AGT-018 | `test_agt_018_no_default_profile_field` | no default/preferred/primary field | PASS |
| AGT-019 | `test_agt_019_binding_api_requires_exact_profile` | exact profile params required (no default) | PASS |
| AGT-020 | `test_agt_020_no_latest_resolution_methods` | no get_latest/bind_latest | PASS |
| AGT-021 | `test_agt_021_allowed_profile_order_irrelevant` | v2-first order still binds v1 | PASS |
| AGT-022 | `test_agt_022_created_run_can_bind` | CREATED binds | PASS |
| AGT-023 | `test_agt_023_binding_immutable` | FrozenInstanceError | PASS |
| AGT-024 | `test_agt_024_exact_agent_version_saved` | agent_version=="v1" | PASS |
| AGT-025 | `test_agt_025_exact_profile_version_saved` | profile_version=="v1" | PASS |
| AGT-026 | `test_agt_026_provider_snapshot_saved` | provider==FAKE_PROVIDER | PASS |
| AGT-027 | `test_agt_027_model_snapshot_saved` | model==FAKE_MODEL_V1 | PASS |
| AGT-028 | `test_agt_028_run_remains_created_after_bind` | status=="CREATED" | PASS |
| AGT-029 | `test_agt_029_bind_creates_no_attempt` | attempt list empty | PASS |
| AGT-030 | `test_agt_030_attempt_count_still_zero` | attempt_count==0 | PASS |
| AGT-031 | `test_agt_031_037_non_created_bind_rejected[READY]` | IllegalAgentBindingStateError | PASS |
| AGT-032 | `test_agt_031_037...[RUNNING]` | IllegalAgentBindingStateError | PASS |
| AGT-033 | `test_agt_031_037...[WAITING]` | IllegalAgentBindingStateError | PASS |
| AGT-034 | `test_agt_031_037...[SUCCEEDED]` | IllegalAgentBindingStateError | PASS |
| AGT-035 | `test_agt_031_037...[FAILED]` | IllegalAgentBindingStateError | PASS |
| AGT-036 | `test_agt_031_037...[CANCELLED]` | IllegalAgentBindingStateError | PASS |
| AGT-037 | `test_agt_031_037...[TIMED_OUT]` | IllegalAgentBindingStateError | PASS |
| AGT-038 | `test_agt_038_matching_session_run_ok` | binding created | PASS |
| AGT-039 | `test_agt_039_session_mismatch_rejected` | AgentBindingScopeError | PASS |
| AGT-040 | `test_agt_040_project_mismatch_rejected` | AgentBindingScopeError | PASS |
| AGT-041 | `test_agt_041_branch_mismatch_rejected` | AgentBindingScopeError | PASS |
| AGT-042 | `test_agt_042_allowed_profile_succeeds` | allowed profile binds | PASS |
| AGT-043 | `test_agt_043_not_allowed_profile_rejected` | NotAllowedError | PASS |
| AGT-044 | `test_agt_044_agent_exact_version_missing` | AgentDefinitionNotFoundError | PASS |
| AGT-045 | `test_agt_045_profile_exact_version_missing` | ModelExecutionProfileNotFoundError | PASS |
| AGT-046 | `test_agt_046_no_fallback_when_v2_exists` | v1 returned, model is v1 | PASS |
| AGT-047 | `test_agt_047_second_binding_same_run_rejected` | AgentAlreadyBoundError | PASS |
| AGT-048 | `test_agt_048_different_runs_same_agent_profile` | two distinct bindings | PASS |
| AGT-049 | `test_agt_049_get_for_run_correct` | get_for_run returns binding | PASS |
| AGT-050 | `test_agt_050_duplicate_binding_id_rejected` | duplicate id raises | PASS |
| AGT-051 | `test_agt_051_emits_agent_bound` | AGENT_BOUND in events | PASS |
| AGT-052 | `test_agt_052_event_saves_exact_versions` | event metadata agent/profile versions | PASS |
| AGT-053 | `test_agt_053_event_saves_provider_model` | event metadata provider/model | PASS |
| AGT-054 | `test_agt_054_validation_failure_no_event` | no AGENT_BOUND | PASS |
| AGT-055 | `test_agt_055_validation_failure_no_binding` | get_for_run is None | PASS |
| AGT-056 | `test_agt_056_store_failure_no_event` | store fail → no event, no binding | PASS |
| AGT-057 | `test_agt_057_event_failure_no_binding` | event fail → binding discarded | PASS |
| AGT-058 | `test_agt_058_factory_builds_request` | ProviderExecutionRequest returned | PASS |
| AGT-059 | `test_agt_059_provider_from_binding` | provider==binding.provider | PASS |
| AGT-060 | `test_agt_060_model_from_binding` | model==binding.model | PASS |
| AGT-061 | `test_agt_061_input_ref_from_run` | input_ref==run.input_ref | PASS |
| AGT-062 | `test_agt_062_request_project_branch` | project/branch correct | PASS |
| AGT-063 | `test_agt_063_request_session_run_attempt` | session/run/attempt correct | PASS |
| AGT-064 | `test_agt_064_wrong_session_rejected` | AgentBindingScopeError | PASS |
| AGT-065 | `test_agt_065_wrong_run_rejected` | AgentBindingScopeError | PASS |
| AGT-066 | `test_agt_066_wrong_attempt_rejected` | AgentBindingScopeError | PASS |
| AGT-067 | `test_agt_067_run_not_running_rejected` | IllegalAgentBindingStateError | PASS |
| AGT-068 | `test_agt_068_attempt_not_running_rejected` | IllegalAgentBindingStateError | PASS |
| AGT-069 | `test_agt_069_not_current_active_attempt_rejected` | AgentBindingScopeError | PASS |
| AGT-070 | `test_agt_070_multiple_active_attempts_invariant` | RuntimeInvariantViolationError | PASS |
| AGT-071 | `test_agt_071_no_provider_param` | "provider" not in signature | PASS |
| AGT-072 | `test_agt_072_no_model_param` | "model" not in signature | PASS |
| AGT-073 | `test_agt_073_no_input_ref_param` | "input_ref" not in signature | PASS |
| AGT-074 | `test_agt_074_request_matches_binding_and_run` | provider/model/input_ref exact | PASS |
| AGT-075 | `test_agt_075_bind_does_not_mark_ready` | no RUN_READY event | PASS |
| AGT-076 | `test_agt_076_bind_does_not_start_run` | no RUN_STARTED event | PASS |
| AGT-077 | `test_agt_077_bind_does_not_call_provider` | provider executor uncalled | PASS |
| AGT-078 | `test_agt_078_factory_does_not_call_provider` | provider executor uncalled | PASS |
| AGT-079 | `test_agt_079_factory_does_not_persist_request` | no request store attr | PASS |
| AGT-080 | `test_agt_080_factory_does_not_modify_run` | run unchanged after build | PASS |
| AGT-081 | `test_agt_081_factory_does_not_modify_attempt` | attempt unchanged after build | PASS |
| AGT-082 | `test_agt_082_no_context_policy_field` | no context_policy field | PASS |
| AGT-083 | `test_agt_083_no_prompt_policy_field` | no prompt_policy field | PASS |
| AGT-084 | `test_agt_084_no_output_contract_field` | no output_contract field | PASS |
| AGT-085 | `test_agt_085_no_tools_field` | no tools field | PASS |
| AGT-086 | `test_agt_086_no_skills_field` | no skills field | PASS |
| AGT-087 | `test_agt_087_no_subagents_field` | no subagents field | PASS |
| AGT-088 | `test_agt_088_no_mutable_state_fields` | no memory/state/cognitive_mode | PASS |
| AGT-089 | `test_agt_089_090_runtime_no_cognition_control_imports` + `test_runtime_does_not_import_forbidden_layers` | no cognition import | PASS |
| AGT-090 | (same) | no control import | PASS |
| AGT-091 | `test_agt_091_094_no_sdk_imports` + `test_runtime_does_not_import_frameworks` | no openai | PASS |
| AGT-092 | (same) | no anthropic | PASS |
| AGT-093 | (same) | no pydantic_ai | PASS |
| AGT-094 | (same) | no temporalio | PASS |
| AGT-095 | `test_agt_095_no_model_selector` | no ModelSelector/Router | PASS |

**AGT coverage: 95/95 PROVEN**

## M3-AGT / INT Integration Evidence

| ID | Test function | Verdict |
|---|---|---|
| M3-AGT-001 | `test_m3_agt_001_full_agent_binding_execution` | PASS — full chain bind→ready→start→factory→coordinator→SUCCEEDED; AGENT_BOUND+full event sequence; binding unchanged; exactly one provider call (no retry); provider/model/input_ref from Binding/Run |
| M3-AGT-002 | `test_m3_agt_002_version_pinning` | PASS — v1+v2 registered, bind v1, binding stays v1 even after v2 exists; request.model stays v1 |
| INT-M2-M3-AGT-001 | `test_int_m2_m3_agt_001_agent_binding_valid_composition` | PASS — M2 projection→binding→M3 execute→M2 VALID; integration imports both cognition+runtime, production does not; AgentDefinition has no cognitive policy |
| INT-M2-M3-AGT-002 | `test_int_m2_m3_agt_002_invalid_output_but_run_succeeded` | PASS — provider success + cognitive INVALID → Run stays SUCCEEDED; binding unchanged; no retry (1 call) |

## Architecture Boundary Audit

- `packages.runtime` imports: stdlib + `packages.domain` + self only. Verified
  by `test_runtime_does_not_import_forbidden_layers` (AST) and
  `test_runtime_does_not_import_frameworks`.
- No `packages.cognition`, `packages.control`, `packages.capabilities`,
  `packages.persistence`, `packages.observability` imports.
- No `openai` / `anthropic` / `pydantic_ai` / `temporalio` / `langgraph` /
  `requests` / `httpx` imports.
- Integration tests import both M2 and M3; production packages do not
  cross-import (proven in INT-001).
- InMemory agent registries/binding store are NOT in `__all__` (public API
  surface check: `test_inmemory_adapters_live_in_testing_module` style — they
  live only in `testing.py`).

## Placeholder Audit

Scan of `packages/runtime/` for `TODO|FIXME|NotImplementedError|placeholder|
stub|temporary|future implementation|pass` (Protocol `...` bodies excluded):

```
Required-feature placeholders found: NONE
```

AST scan for bare `pass` method bodies: 0.

## Dependency Audit

`uv tree`:

```
paperfactory v0.0.0
├── pyright v1.1.411 (group: dev)
├── pytest v9.1.1 (group: dev)
└── ruff v0.16.2 (group: dev)
```

No OpenAI / Anthropic / Pydantic AI / Temporal / LangGraph / HTTP provider SDK.
`pyproject.toml` and `uv.lock` unchanged.

## Git Diff Audit

Changed files (all within allowed scope):

```
docs/architecture/agent-runtime-core.md      (minimal update)
docs/architecture/provider-execution.md      (minimal update)
docs/architecture/agent-definition.md        (NEW)
docs/audit/step-013-conformance.md           (NEW)
packages/domain/ids.py                       (+3 NewType ids)
packages/runtime/README.md                   (STEP-013 section)
packages/runtime/__init__.py                 (public API export)
packages/runtime/agent.py                    (NEW — core)
packages/runtime/errors.py                   (+8 agent errors)
packages/runtime/events.py                   (+AGENT_BOUND)
packages/runtime/testing.py                  (+3 InMemory adapters)
tests/runtime/test_agent.py                  (NEW — AGT-001..095)
tests/runtime/test_agent_e2e.py              (NEW — M3-AGT-001/002)
tests/integration/test_cognition_runtime_execution.py (+INT-M2-M3-AGT-001/002)
```

Protected files unchanged:

```
.claude/CLAUDE.md                 unchanged
docs/adr/ADR-001/002/003          unchanged
packages/control/*                unchanged
packages/cognition/*              unchanged
packages/domain/events.py         unchanged
packages/capabilities/*           unchanged (absent)
packages/persistence/*            unchanged (absent)
packages/observability/*          unchanged (absent)
pyproject.toml                    unchanged
uv.lock                           unchanged
```

## Final Verdict

**STEP-013: PASS**

- AC-01..56: 56/56 PASS
- AGT-001..095: 95/95 PROVEN (direct behavioral assertions)
- M3-AGT-001/002: PASS
- INT-M2-M3-AGT-001/002: PASS
- Provider success + cognitive INVALID → Runtime SUCCEEDED: preserved
- Runtime imports cognition: NO; imports control: NO
- No required-feature placeholders
- No new dependencies
- ruff PASS, pyright 0 errors, pytest 699 passed
