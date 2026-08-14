# Agent Definition, Model Execution Profile & Run Binding

> STEP-013 architecture note. Establishes the versioned, immutable Agent
> Runtime Definition and the explicit, run-scoped binding between an exact
> AgentDefinition version and an exact ModelExecutionProfile version.

## 1. Purpose

Answer one question precisely:

> "Which exact Agent version, bound to which exact model execution profile
> version, is pinned to this RuntimeRun?"

This is a **runtime** construct. It does not carry cognitive policy, research
role, memory, tools, or an agent loop. It is the bridge between the already
USABLE Runtime Core (Session/Run/Attempt + Provider Execution Boundary) and a
future Agent Loop: before there is any loop, there must first be an
unambiguous statement of *what* is executing *with which model*.

## 2. AgentDefinition vs RuntimeRun

| Aspect | AgentDefinition | RuntimeRun |
|---|---|---|
| What it is | A versioned runtime *definition* | One logical execution |
| Mutability | Immutable, versioned | Immutable transitions |
| Identity | `(agent_id, version)` | `run_id` |
| Lifetime | Registered once, reused across many runs | Created, executed, terminal |

A Run may be executed under at most one AgentDefinition version. An
AgentDefinition may back many Runs. **AgentDefinition ≠ RuntimeRun.**

## 3. AgentDefinition vs Cognition

AgentDefinition is a **runtime** definition. It deliberately owns NONE of:

- PromptPolicy / PromptTemplate
- ContextPolicy / RetrievalPolicy
- OutputContract
- cognitive_mode
- ResearchQuestion / Hypothesis / Evidence / Claim
- chat history / scratchpad / memory

These belong to M2 (Cognitive Control Plane). The Agent layer transports a
compiled PromptPackage as an opaque `projected_input`; it never interprets
cognitive content.

> AgentDefinition does not own PromptPolicy, ContextPolicy,
> RetrievalPolicy, or OutputContract.

## 4. ModelExecutionProfile

A versioned, immutable profile that pins **provider identity + model
identity only**:

```
ModelExecutionProfile
    profile_id, version          # exact-version identity
    name, description            # non-empty
    provider: ProviderIdentifier # reused from STEP-012
    model:   ModelIdentifier     # reused from STEP-012
    metadata: Mapping            # immutable
```

It deliberately carries **no generation parameters** — no `temperature`,
`top_p`, `max_tokens`, `reasoning_effort`, `seed`, `frequency_penalty`,
`presence_penalty`, `provider_options`, and no smuggled
`parameters: dict[str, Any]`. Those belong to a future `ModelExecutionConfig`.

## 5. Exact Versioning

The runtime never parses semver, never auto-increments, never finds the
"latest", and never compares newer/older. Registry identity is the pair
`(id, version)` and it **must** be unique. Resolution is always by exact
version:

```
registry.get(profile_id, version)
registry.get(agent_id, version)
```

## 6. No Default / Latest

- AgentDefinition has **no** `default_profile` / `preferred_profile` /
  `primary_profile` field.
- The registries expose **no** `get_latest` / `get_default` / `get_first`.
- The binding API has **no** `bind_latest` / `resolve_latest`.
- The runtime **never** silently chooses the first, latest, or default model
  profile. The caller always supplies an exact `(profile_id, version)`.

## 7. Allowed Profiles

`AgentDefinition.allowed_execution_profiles` is a non-empty tuple of
`ModelExecutionProfileRef` with no duplicates. A binding may only reference a
profile version that appears in this tuple; otherwise
`AgentExecutionProfileNotAllowedError`.

Registration of an AgentDefinition does **not** require its referenced
profiles to already exist in the profile registry — this avoids registration
order coupling. Exact resolution happens at bind time.

## 8. AgentExecutionBinding

```
AgentExecutionBinding
    binding_id
    session_id, run_id
    project_id, branch_id
    agent_id, agent_version               # exact version
    execution_profile_id, version         # exact version
    provider, model                       # SNAPSHOT from the Profile
    execution_config_id, execution_config_version   # STEP-014: exact Config
    resolved_parameter_settings                     # STEP-014: param snapshot
    created_by, created_at
    metadata
```

> AgentExecutionBinding pins an exact AgentDefinition version, an exact
> ModelExecutionProfile version, AND an exact ModelExecutionConfig version
> to a RuntimeRun. See [Model Execution Configuration](model-execution.md).

## 9. Binding Timing

Binding is permitted **only** on a `CREATED` Run, as the very first mutation
after run creation:

```
create_session -> create_run -> bind_agent -> mark_ready -> start_run -> execute
```

Any attempt to bind a Run in `READY / RUNNING / WAITING / SUCCEEDED / FAILED
/ CANCELLED / TIMED_OUT` raises `IllegalAgentBindingStateError`.

## 10. One Binding per Run

A Run may hold **exactly one** binding. After a successful bind there is no
`rebind`, `update_binding`, `change_agent`, `change_profile`, or
`change_model`. To use another Agent/Profile, create a new Run.

## 11. Immutable Binding

The binding store is append-only: `save / get / get_for_run /
list_for_session` only. There is **no** business update (no upsert, no
overwrite). `discard` exists solely so the manager can roll back a
half-committed binding when `AGENT_BOUND` event emission fails (see §atomicity);
it is not a mutation of a committed binding.

## 12. Provider / Model Snapshot

The binding stores **both** the profile identity (`profile_id` / `version`)
**and** the resolved `provider` / `model`. This is deliberate: even if the
registry content or adapter changes later, an existing Run can always answer
"what provider/model was actually bound at bind time?".

## 13. Version Pinning

Because the binding captures exact versions and a provider/model snapshot, a
Run bound to `agent-A/v1` + `profile-A/v1` keeps those exact versions even
after `v2` of either is registered. There is no auto-upgrade, refresh, or
latest resolution.

## 14. Run-Level vs Attempt-Level Binding

The binding carries **no** `attempt_id`. It is run-scoped. Future retries
(attempt #1, attempt #2, …) share the same Run binding. STEP-013 does not
implement retry, but the contract must not block that semantics.

> AgentExecutionBinding is run-scoped, not attempt-scoped.

## 15. AgentBindingManager

Strict orchestrator. Steps, in order:

1. resolve Session
2. resolve Run
3. validate scope (session/run/project/branch consistent)
4. validate Run == CREATED
5. ensure Run has no Binding
6. resolve exact AgentDefinition
7. resolve exact ModelExecutionProfile
8. validate selected Profile is allowed
9. construct immutable Binding (with provider/model snapshot)
10. save Binding
11. emit `AGENT_BOUND` (on failure: discard the binding)
12. return Binding

It does **not** `mark_ready`, `start_run`, create an Attempt, execute a
provider, select a model, or modify the Run.

## 16. AgentProviderExecutionRequestFactory

Builds a `ProviderExecutionRequest` from a Binding + Session + Run + current
Attempt + caller-supplied `projected_input`. It does **not** call the
provider and does **not** persist the request.

- `request.provider` ← `binding.provider`
- `request.model` ← `binding.model`
- `request.input_ref` ← `run.input_ref`

It validates scope, requires `Run.status == RUNNING`, requires
`Attempt.status == RUNNING`, and verifies the passed Attempt is the **single
current active** RUNNING attempt in the AttemptStore.

## 17. No Provider / Model / input_ref Override

The factory's `build` signature has **no** `provider`, `model`, or
`input_ref` parameter. The caller physically cannot override them. The
generated request's `provider` / `model` / `input_ref` are exactly the
Binding/Run values.

## 18. AgentDefinition Has No Cognitive Policy

Re-stated for emphasis: no `context_policy`, `retrieval_policy`,
`prompt_policy`, `prompt_template`, `output_contract`, `cognitive_mode`. The
agent layer is provider-neutral and content-blind.

## 19. No Mutable Agent State

No `AgentState`, `AgentMemory`, `Scratchpad`, `ConversationHistory`,
`Thought`, `CurrentGoal`, `WorkingMemory`. AgentDefinition is a static
definition.

## 20. No Agent Loop

No `while`, `max_steps`, `step_count`, `termination_condition`, ReAct,
planner, or loop state. In this step an agent is a single provider-execution
binding.

## 21. No Tool / Skill / Subagent

No `tools`, `skills`, or `subagents` fields — not even empty tuples. These
await their own contract design.

## 22. Not Implemented Yet

The following are intentionally deferred to later steps:

- `ModelExecutionConfig` (generation parameters)
- Model Selection Policy / Router
- Agent Loop (max_steps / termination / ReAct)
- Tool / Skill / Subagent
- Retry Policy / Backoff
- Checkpoint
- Real Provider Adapters (OpenAI / Anthropic SDK)
- Permission Runtime / Sandbox / Hooks
- Temporal integration

The low-level `ProviderExecutionPort` remains a generic I/O primitive: a
`ProviderExecutionRequest` can be constructed directly (as in STEP-012) **or**
via the `AgentProviderExecutionRequestFactory`. Agent binding is a higher-level
convenience and does not alter the low-level port semantics.
