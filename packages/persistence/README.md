# persistence — M6 Data Plane

## Responsibility

Implement the persistence side of ports defined by the Domain layer.
Persistence is the home of the system-of-record adapters (PostgreSQL),
event storage, typed relation storage, vector index adapters, and artifact
metadata.

## Owns (future)

- Repositories
- PostgreSQL adapters
- Domain event persistence
- Typed relation persistence
- Vector index adapters
- Artifact metadata

## Must Not Own

- Research decision logic
- Gate semantics
- Next-action policy

## Allowed Dependencies

- `domain` contracts (implements ports defined here)
- Standard library / persistence libraries (SQLAlchemy, Alembic, psycopg,
  pgvector) when introduced

Infrastructure depends on Domain; the reverse is forbidden.
