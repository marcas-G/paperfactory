# control — M1 Research Control Plane

## Responsibility

Research process governance. Owns the answer to:

> What is the current research state? What actions are legal now? When may
> the state change?

Deterministic wherever possible; LLM participates only in explicitly
declared Semantic Gates / Semantic Ranking.

## Owns

- Research State governance
- Action legality
- Gate orchestration
- Transition authority (the sole business-layer Research State mutator)
- Research policy
- Task DAG
- Branch control
- Approval control

## Must Not Own

- LLM execution
- Paper search
- PDF parsing
- Experiment execution
- Manuscript generation
- Database implementation

## Allowed Dependencies

- `domain` contracts
- Abstract ports (incl. future cognition/runtime ports)
- Standard library

Future cognition / runtime ports may be depended upon via their abstract
interfaces, but `control` MUST NOT depend on any concrete adapter
implementation.
