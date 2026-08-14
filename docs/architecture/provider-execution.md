# Provider Execution Runtime Boundary

STEP-012 connects M2's provider-neutral PromptPackage/ProviderProjection
to M3's Run/Attempt lifecycle via the first real execution boundary.

## Purpose

Answer: *How does one provider execution call connect to the Run lifecycle?*

## M2 Projection vs M3 Execution

M2 produces a ProviderProjection (structured, provider-neutral). M3 executes
it via an opaque `ProviderExecutionPort`. Runtime does NOT import cognition.

## Runtime Does Not Import Cognition

`packages.runtime` treats `projected_input` and `raw_output` as opaque
`object` values. It does NOT interpret PromptSegments, OutputContract, or
CognitiveMode. Composition (projection → request → response → candidate)
happens at the Application/Integration layer, NOT in production packages.

## ProviderIdentifier / ModelIdentifier

Open string-based identities (not closed enums). Runtime does not route
based on provider name — the coordinator receives a concrete
`ProviderExecutionPort` instance.

## ProviderExecutionPort

Async I/O port: `async def execute(request) -> ProviderExecutionOutcome`.
Lifecycle managers remain synchronous — only this port is async (external
I/O boundary).

## Opaque Projected Input / Raw Output

`projected_input: object` and `raw_output: object` are the explicit
external boundaries. Runtime does NOT validate raw output against any
OutputContract.

## ProviderExecutionOutcome

`SUCCEEDED` → response set, failure None. `FAILED` → failure set, response
None. No mixed state.

## RuntimeExecutionCoordinator

Validates scope → persists request → emits STARTED → calls executor once →
on success: persist response → succeed_run. On failure: fail_run.
Unexpected exception → INTERNAL failure. Response persistence failure →
INTERNAL failure (NOT run success).

## Provider Success ≠ Cognitive Validity

> **Provider execution success means the external execution completed
> successfully; it does not mean the cognitive output is valid.**
>
> **Cognitive Output INVALID does not retroactively convert a successful
> RuntimeRun into FAILED.**
>
> **Runtime treats projected input and raw provider output as opaque values.**
>
> **Runtime does not import the Cognitive Control Plane.**

## No Automatic Retry

`RuntimeFailure.transient` is only a hint. The coordinator calls the
executor exactly once per invocation. Retry belongs to future RetryPolicy.

## What Is Not Implemented Yet

Real Provider Adapter (OpenAI/Anthropic SDK), Model Selection, Agent Loop,
Tool, Skill, Subagent, Retry Policy, Checkpoint, Temporal, Sandbox,
Permission Runtime, Hooks.

## Two Ways to Build a Request

A `ProviderExecutionRequest` may be constructed:

- **directly** (low-level, as in STEP-012), or
- **via `AgentProviderExecutionRequestFactory`**, which sources
  `provider`/`model` from an [AgentExecutionBinding](agent-definition.md) and
  `input_ref` from the Run. The caller cannot override these.

The low-level `ProviderExecutionPort` semantics are unchanged — it remains a
generic I/O primitive that does not require an Agent Binding to exist.
