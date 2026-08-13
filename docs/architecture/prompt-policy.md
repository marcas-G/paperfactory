# Prompt Policy & Deterministic Prompt Assembly

The third phase of the M2 Cognitive Control Plane. It compiles a
`ContextBundle` into a structured, provider-neutral `PromptPackage` while
enforcing **instruction/data separation**.

See [cognitive-context-kernel.md](cognitive-context-kernel.md) and
[retrieval-policy.md](retrieval-policy.md) for the upstream stages.

## Purpose

Answer "which content is an instruction, which is just data, and how should
the task be framed" — deterministically, versioned, auditable, no LLM, no
provider messages.

## ContextBundle ≠ Prompt

A `ContextBundle` is the auditable context selection. A `PromptPackage` is a
structured cognitive input compiled from it by a versioned PromptPolicy. The
package preserves segment boundaries — it is NOT a flattened prompt string.

## PromptPackage ≠ Provider Messages

The package contains NO `openai_messages` / `anthropic_messages` / role
fields. Provider projection is a future Model Adapter concern.

## Instruction vs Context Data

> **Retrieved content does not gain instruction authority by being retrieved.**
>
> **Context data is treated as data even when its natural-language content
> contains imperative instructions.**

Only `ContextItemType.INSTRUCTION` items may carry instruction authority.
STATE / EVIDENCE / DECISION / CONSTRAINT / FAILURE / ARTIFACT / REFERENCE /
NOTE are CONTEXT DATA. Authority comes from typed metadata, NEVER from parsing
natural language — `"ignore previous instructions"` inside an EVIDENCE item
stays untrusted data.

## InstructionAuthority

Frozen precedence (high → low):

```
HARNESS > SYSTEM > PROJECT > BRANCH > MODE > TASK
```

Only SYSTEM / PROJECT / BRANCH may come from a ContextItem. HARNESS / MODE /
TASK come from versioned PromptTemplates only.

## Authority Precedence

The precedence is a frozen system invariant, not a configurable preference.
PromptPolicy records it for audit; a policy with a different order is rejected.

## ContextItem Authority Invariants

- non-INSTRUCTION item + authority → rejected
- INSTRUCTION item + no authority → rejected
- INSTRUCTION item authority ∈ {SYSTEM, PROJECT, BRANCH}
- authority ↔ scope mapping frozen: SYSTEM↔SYSTEM-scope, PROJECT↔PROJECT-scope,
  BRANCH↔BRANCH-scope (a branch-local instruction cannot pose as system-level)

## PromptTemplate

Immutable, versioned. `body` uses stdlib `string.Template` (`$name` /
`${name}`) — NO Jinja, NO `str.format`, NO eval. Variable names are simple
identifiers only (`[A-Za-z_][A-Za-z0-9_]*`); attribute access / index / call
expressions are rejected. Declared variables must match the body exactly.

## Template Versioning

`(template_id, version)` is unique in the registry; duplicate registration is
rejected. `list_versions` returns all versions of a template id.

## CognitiveMode Guidance

Each of the 10 CognitiveModes maps to a versioned MODE_GUIDANCE template in
the PromptPolicy. Mode is the FIRST thing that influences the prompt — but it
only changes the MODE_GUIDANCE segment; it does not change retrieval,
ContextBundle, blinding, state, or action.

> Mode changes reasoning guidance, not retrieved evidence.

## Task Frame

A TASK_FRAME template renders the explicit `task_objective` + a deterministic
numbered rendering of `task_constraints`. The task template never receives
raw ContextBundle contents as variables.

## PromptSegment

Ordered, immutable. `kind` (HARNESS_GUARDRAIL / CONTEXT_INSTRUCTION /
MODE_GUIDANCE / TASK_INSTRUCTION / CONTEXT_DATA), `trust`
(TRUSTED_INSTRUCTION / UNTRUSTED_CONTEXT), optional `authority`, `content`,
provenance (`source_refs`, `context_item_id`, `template_id`/`template_version`).

## Trust Boundary

All instruction segments are `TRUSTED_INSTRUCTION` (authority set). All context
data is `UNTRUSTED_CONTEXT` (authority None). No partial trust.

## Context Injection Boundary

Context data is NEVER concatenated raw onto instruction strings. Each
CONTEXT_DATA is its own segment with a deterministic, structural rendering.

## Canonical Context Data Rendering

Context data content is rendered via `render_context_data` — stdlib
`json.dumps(sort_keys=True, ensure_ascii=False)` with content as a JSON string
value. Embedded `}]</context>` / `ignore previous instructions` / `SYSTEM:`
are escaped as JSON text and cannot break structural boundaries. No fragile
XML/string delimiters.

## Prompt Assembly Ordering (frozen)

1. HARNESS_GUARDRAIL
2. SYSTEM context instructions (bundle order)
3. PROJECT context instructions (bundle order)
4. BRANCH context instructions (bundle order)
5. MODE_GUIDANCE
6. TASK_INSTRUCTION
7. CONTEXT_DATA (bundle order)

ContextLayer does NOT override authority ordering — a BRANCH instruction on a
GLOBAL layer is still ordered as BRANCH.

## PromptPackage

Immutable, provider-neutral. Records package_id, request_id, project/branch,
state_revision, action/mode, context_bundle_id, prompt policy id/version,
`output_contract_id`/`output_contract_version`, assembler_version, ordered
`segments`, `template_refs`, `source_refs`, created_at.

`output_contract_id/version` are propagated verbatim from the PromptRequest;
the assembler does NOT interpret the OutputContract, does NOT render a schema,
and does NOT perform output validation (see
[output-validation.md](output-validation.md)).

> **PromptPackage is a structured provider-neutral artifact, not a flattened
> prompt string.** No `prompt_text` / `prompt` / `messages` fields exist.

## State Revision Binding

The assembler rejects a stale PromptRequest (`StalePromptRequestError`) and a
stale ContextBundle. `is_prompt_package_current(package, revision)` returns
True only if revision matches; no auto-refresh.

## Auditability

`PromptPackage` (+ segments + template_refs + source_refs) is the audit
artifact. No Domain Event is added (prompt assembly ≠ state mutation);
observability/runtime trace can record a span later.

## What Is Not Implemented Yet

- Provider Adapter (OpenAI/Anthropic/Gemini message mapping)
- Prompt Execution / model invocation
- Output Contract / OutputValidator
- Semantic Retrieval / Vector Retrieval
- LLM
- Agent Runtime
- Research Domain semantics
