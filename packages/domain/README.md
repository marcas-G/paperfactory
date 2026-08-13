# domain — M4 Research Domain

## Responsibility

Define the typed Research Objects, DomainEvent contracts, and domain
invariants that the rest of the system reasons over. Domain is the
innermost layer; it owns the vocabulary of the platform, not the behavior
of any framework.

## Owns (future)

- ResearchProject
- ResearchQuestion
- Observation
- KnowledgeItem
- Gap
- Hypothesis
- StudyDesign
- Protocol
- Experiment
- Result
- Evidence
- Claim
- Decision
- Failure
- ReviewerConcern
- DomainEvent contracts
- Domain invariants

## Must Not Own

- Any framework / infrastructure implementation

## Allowed Dependencies

Domain MUST NOT depend on:

- FastAPI
- SQLAlchemy ORM
- Temporal
- Pydantic AI
- OpenAI SDK
- Anthropic SDK
- External scholarly APIs

Allowed:

- Standard library
- Pydantic (for contracts/typing only, when introduced)
