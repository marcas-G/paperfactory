# capabilities — M5 Research Capability Layer

## Responsibility

Provide the actual research abilities the platform calls upon.

## Owns (future)

- Literature / search
- Document / PDF
- Citation
- Code
- Experiment
- Statistics
- Writing
- Review

## Rules

- A Capability returns structured observations / results.
- A Capability NEVER directly commits Research State.

Correct path:

```
Controller -> Research Action -> Cognitive Control ->
Runtime -> Capability -> Structured Observation -> Controller
```

## Must Not Own

- Research State mutation
- Gate semantics
- Next-action policy

## Allowed Dependencies

- `domain` contracts (input/output types)
- Standard library / capability-specific adapters
