# cognition — M2 Cognitive Control Plane

## Responsibility

Given the current research state and current action, decide what an Agent
should see and which cognitive mode it should reason in.

## Owns

- CognitiveMode
- ContextRequest
- ContextBundle
- ContextPolicy
- ContextCompiler
- PromptPolicy
- RetrievalPolicy
- BlindingPolicy
- Typed cognitive output validation

## Current Implementation (STEP-006 + STEP-007)

Implemented:
- CognitiveMode (FRAME/EXPLORE/MAP/COMPARE/FALSIFY/DIAGNOSE/DISCRIMINATE/
  VERIFY/SYNTHESIZE/DECIDE)
- Context contracts: ContextLayer, ContextScope, ContextProtectionTag,
  ContextItemType, ContextSourceRef, ContextItem, ContextBudget
- ContextPolicy, BlindingPolicy (versioned)
- ContextRequest (revision-bound, explicit required/optional/forbidden)
- ContextCompiler (deterministic: validate → scope → blind → require → budget)
- ContextBundle (immutable, item-boundary-preserving, auditable)
- RetrievalRequirement, RetrievalPolicy (versioned), deduplication strategy
- ContextCatalog port (read-only, enumerable)
- RetrievalResolver (deterministic metadata-based resolution)
- RetrievalResolution → ContextRequest conversion

Not implemented yet (later M2 steps):
- Semantic retrieval / vector retrieval
- PromptPolicy / PromptAssembler
- OutputValidator
- LLM execution / agent execution

## Must Not Own

- Research State commit
- Database persistence
- Workflow durability
- External side-effect authority

## Allowed Dependencies

- `domain` contracts and state representation (read-only)
- Standard library

Cognition may read Domain contracts / state representation but MUST NOT
commit state. STEP-006 deliberately does NOT depend on `control`; the
context kernel is built on `domain` primitives only.
