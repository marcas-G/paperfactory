# evals

## Responsibility

Evaluate the platform itself: not only final output, but state-transition
correctness, gate correctness, action selection, context retrieval,
evidence grounding, protocol compliance, blinding, long-horizon
consistency, failure recovery, and human override behavior.

## Owns (future)

- Controller eval
- Cognitive eval
- Agent eval
- Workflow eval
- Long-horizon eval
- Fixtures

Business unit tests still live under the top-level `tests/` directory;
`evals` is reserved for the platform-level evaluation harness.

## Must Not Own

- Research State authority
- Production code paths

## Allowed Dependencies

- All packages under test
- Standard library / eval tooling
