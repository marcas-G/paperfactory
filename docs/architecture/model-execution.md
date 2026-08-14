# Model Execution Configuration

> STEP-014 architecture note. Adds the typed, versioned
> `ModelExecutionConfig` on top of a `ModelExecutionProfile`'s
> provider/model identity, plus capability declaration, and pins Agent +
> Profile + Config versions in the binding.

## 1. ModelExecutionProfile

`ModelExecutionProfile` (extended in STEP-014) now declares, beyond
provider/model identity:

- `capabilities: frozenset[ModelCapability]` — non-empty, MUST include
  `TEXT_GENERATION`.
- `supported_parameters: frozenset[ModelParameter]` — may be empty.

## 2. Capability Declaration

`ModelCapability` is a closed enum:

```
TEXT_GENERATION, STRUCTURED_OUTPUT, TOOL_CALLING, STREAMING,
VISION_INPUT, FILE_INPUT
```

Capabilities are a **declaration**, not auto-discovery. The runtime never
queries a provider API, scrapes a website, or probes a model. Subjective
capabilities (`SMART`, `REASONING`, `BEST`, `FAST`) are deliberately excluded.

## 3. Canonical ModelParameters

`ModelParameter` is provider-neutral and limited to four keys this step:

```
TEMPERATURE, TOP_P, MAX_OUTPUT_UNITS, SEED
```

`reasoning_effort`, `service_tier`, `parallel_tool_calls`, `logprobs`,
`frequency_penalty`, `presence_penalty`, `provider_options` are deferred to
real Provider Adapter design.

A `ModelParameterSetting` carries `parameter` + `value` where `value` is
strictly `int | float`, validated per-parameter:

| Parameter | Type | Range | bool |
|---|---|---|---|
| TEMPERATURE | int\|float | [0.0, 2.0] | n/a |
| TOP_P | int\|float | [0.0, 1.0] | n/a |
| MAX_OUTPUT_UNITS | int | > 0 | rejected |
| SEED | int | >= 0 | rejected |

No silent clamp. No type coercion (`"0.7"` → `0.7` is rejected).

## 4. ModelExecutionConfig

```
ModelExecutionConfig
    config_id, version          # exact-version identity
    name, description           # non-empty
    profile_ref                 # exact ModelExecutionProfileRef
    parameter_settings          # tuple[ModelParameterSetting, ...]
    metadata
```

Each `ModelParameter` appears at most once within a config (duplicates
rejected — no last-write-wins).

## 5. Exact Config Versioning

The registry resolves only by exact `(config_id, version)`. No `get_latest` /
`get_default` / `get_first`. Multiple versions coexist.

## 6. Config / Profile Compatibility

`ModelExecutionConfigValidator.validate(config, profile)` enforces:

1. `config.profile_ref.profile_id/version == profile.profile_id/version`
   (exact version — v2 of a profile never validates a config pinned to v1).
2. every `config.parameter_settings[].parameter ∈ profile.supported_parameters`.

A profile that does not declare `TEMPERATURE` in `supported_parameters` cannot
have a config that sets `TEMPERATURE`. "The provider might support it" is not
a valid reason.

Registry registration validates only the config's self-structure; true
compatibility is checked by the validator / at bind time (avoids registration-
order coupling).

## 7. Binding Pins Agent / Profile / Config

`AgentExecutionBinding` now pins THREE exact versions:

1. AgentDefinition — `agent_id` / `agent_version`
2. ModelExecutionProfile — `execution_profile_id` / `execution_profile_version`
3. ModelExecutionConfig — `execution_config_id` / `execution_config_version`

plus the provider/model snapshot (from the Profile) and
`resolved_parameter_settings` (the canonical parameter snapshot from the
Config). All three are mandatory at bind time — no optional/auto/default
config.

## 8. Parameter Snapshot

`binding.resolved_parameter_settings` is an immutable tuple captured at bind
time. Even if the Config registry changes later, the Run keeps the exact
parameters that were bound.

## 9. ProviderExecutionRequest Propagation

`ProviderExecutionRequest` gained a typed field:

```
execution_parameters: tuple[ModelParameterSetting, ...]
```

`AgentProviderExecutionRequestFactory.build` sets
`request.execution_parameters = binding.resolved_parameter_settings`. The
caller cannot override it — `build`'s signature has no such parameter. A
low-level direct request may use `()` to preserve STEP-012 generality.

## 10. Runtime Does Not Interpret Parameters

`RuntimeExecutionCoordinator` forwards `ProviderExecutionRequest` to
`ProviderExecutionPort` verbatim. It never branches on `TEMPERATURE` /
`TOP_P`, never normalizes, filters, or translates parameters.

## 11. Provider Adapter Mapping Is Future Work

Future OpenAI / Anthropic adapters map canonical `ModelParameterSetting`s to
real SDK parameters. STEP-014 does not implement any mapping and imports no
provider SDK.

## 12. No Hidden provider_options

There is no `parameters: dict[str, Any]` escape hatch and no
`provider_options` field. Canonical parameters are the only channel.

## 13. No Implicit Empty Config

Even when a caller wants provider defaults, they must explicitly register an
empty `ModelExecutionConfig` (`parameter_settings=()`) and bind its exact
id/version. The `AgentBindingManager` never auto-creates an empty config.

## 14. Version Pinning

Because the binding captures exact Config version + parameter snapshot, a Run
bound to `config-A/v1` keeps v1's parameters even after `config-A/v2` is
registered. No auto-upgrade, no refresh, no latest resolution.
