# Structured Output Contract & Cognitive Result Validation

The output side of the M2 Cognitive Control Plane. It defines "what structure
counts as a legal cognitive result", validates untrusted model output against
it, and produces a normalized, auditable `CognitiveResultEnvelope`.

See [prompt-policy.md](prompt-policy.md) and [provider-projection.md](provider-projection.md)
for the upstream stages.

## Purpose

Bind every cognitive execution to a versioned `OutputContract`, validate the
raw model output deterministically against it, and produce a typed
`CognitiveResultEnvelope` — with full provenance (candidate → prompt package →
action → state revision → contract → schema) and a clean separation between
"valid" and "not valid".

## Structured Output Is Untrusted Input

> **Model output is untrusted until validated against the versioned
> OutputContract.**

Even `{"status": "PASS"}` cannot change Research State, pass a Gate, commit a
Transition, create Evidence, or modify a Claim. M2 only validates conformance.

## OutputSchemaRef

A provider-neutral identity (`schema_id` + `version`) for a logical structured
output schema. No JSON Schema / Pydantic / OpenAPI / SDK schema here.

## OutputContract

Immutable, versioned. `contract_id`, `version`, `schema_ref` (required),
`strict: bool`, `description` (non-empty). It declares "what structure is
legal" — it is NOT a PromptTemplate, NOT a provider response_format, NOT a
concrete model class.

## Contract Versioning

`(contract_id, version)` is unique in the registry; duplicate registration is
rejected; multiple versions coexist. PromptRequest / PromptPackage /
StructuredOutputCandidate carry only `(contract_id, version)`; the canonical
contract content lives only in `OutputContractRegistry` (single source of
truth).

## Prompt-to-Output Contract Binding

`PromptRequest` and `PromptPackage` carry `output_contract_id` /
`output_contract_version` (required). The assembler propagates them verbatim.
`ProviderProjectionTrace` also carries them. The projector does NOT gain any
execution-schema behavior (no response_format / json_schema) — that is the
future provider execution adapter's job.

## StructuredOutputCandidate

Immutable. Carries the UNTRUSTED raw `payload: object`, its scope (project /
branch / state_revision / action / mode), `prompt_package_id`,
`output_contract_id/version`, `provider` / `model_identifier` (both optional,
None allowed), and a timezone-aware `created_at`. No hidden
chain-of-thought / reasoning-trace field is required.

## Validator Boundary

`StructuredOutputValidator` (Protocol) exposes `schema_ref` and
`validate(payload: object, contract) -> SchemaValidationOutcome`. `payload:
object` is the explicit external untrusted-input boundary; the validated
result is a typed normalized value — `dict[str, Any]` does not spread inward.

## Validation Failure vs System Error

- **Normal INVALID result** (returned, not raised): missing field, wrong type,
  bad enum, out-of-range, extra field (strict), structural mismatch.
- **System error** (raises a `CognitionError` subtype): stale revision,
  candidate/prompt mismatch, contract missing, validator missing.

## SchemaValidationOutcome

Immutable, with strict invariants: `valid=True` → `normalized_payload` set and
`issues == ()`; `valid=False` → `normalized_payload is None` and issues
non-empty.

## OutputValidationResult

The audit record. `VALID` (issues empty, `cognitive_result_id` set) vs
`INVALID` (issues non-empty, `cognitive_result_id` None).

## CognitiveResultEnvelope

The validated, normalized typed result. `payload` is the validator's
`normalized_payload` — NOT the raw candidate payload. It is an execution
artifact, not Research State.

## Raw vs Normalized Payload

`StructuredOutputCandidate.payload` = untrusted raw structured value.
`CognitiveResultEnvelope.payload` = validated normalized typed value. The
engine never does `result.payload = candidate.payload` unvalidated.

## Strict Validation

`strict` is interpreted by the concrete validator (the engine only passes the
contract). Test validator: strict=True → unknown field is INVALID; strict=False
→ unknown fields are ignored AND the normalized payload excludes them.

## No Automatic Repair

The engine never fills missing fields, coerces `"0.8"` → float, fixes enums,
deletes extra fields, extracts JSON from Markdown fences, or re-parses. If a
future validator defines a normalization, that is schema semantics — not the
engine.

## No Automatic Retry

> **Validation failure is not a runtime failure.**

`INVALID` is returned immediately. No retry, no re-ask, no fallback parser, no
second model. Retry and repair belong to the Agent Runtime policy, not
Cognitive Control.

## State Revision Binding

The engine receives `current_state_revision`; a candidate whose
`state_revision` differs raises `StaleOutputCandidateError` and produces no
artifacts.

## Result Provenance

`CognitiveResultEnvelope` records candidate_id, validation_id, project/branch,
state_revision, action/mode, prompt_package_id, contract/schema, provider,
model_identifier, validated_at — enough to trace any result back to the exact
prompt package and contract that produced it.

## CognitiveResult ≠ Research State

The envelope is an execution artifact. It cannot commit ResearchState, change
a Branch, create a Task, pass a Gate, or create Evidence. Future M1/M4 code
decides what a CognitiveResult means and may propose a StateTransitionProposal
/ Evidence / Decision.

## CognitiveResult ≠ Authorization

> **CognitiveResultEnvelope does not mutate or authorize Research State.**

A payload containing `"next_action": "COMMIT"` or `judgement == "SUPPORT"` does
not trigger any control action. (With strict=True such an extra field is simply
INVALID.)

## Audit Artifacts

`OutputValidationResult` and `CognitiveResultEnvelope` are the audit records
(via `OutputValidationResultStore` / `CognitiveResultStore` ports). No Domain
Event is added — output validation is not a Research State mutation.

## What Is Not Implemented Yet

- Provider Execution Adapter (OpenAI/Anthropic SDK, model calling)
- Model selection (gpt-*/claude-*, temperature, max_tokens)
- Retry / output repair policy (Agent Runtime)
- Tool calling
- Semantic retrieval / vector retrieval
- Research Domain semantics (ResearchQuestion / Gap / Hypothesis / ...)
