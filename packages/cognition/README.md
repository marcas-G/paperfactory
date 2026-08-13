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

## Must Not Own

- Research State commit
- Database persistence
- Workflow durability
- External side-effect authority

## Allowed Dependencies

- `domain` contracts and state representation (read-only)
- `control` contracts (read-only reference to current state/action)
- Standard library

Cognition may read Domain contracts / state representation but MUST NOT
commit state.
