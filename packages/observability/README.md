# observability

## Responsibility

Make the system legible: structured logs, traces, metrics, correlation
IDs, and audit telemetry. Observability supports auditability; it is never
the Domain Event Source of Truth.

## Owns (future)

- Structured logs
- Trace
- Metrics
- Correlation IDs
- Audit telemetry

## Must Not Own

- Domain Event Source of Truth
- Research State authority

## Allowed Dependencies

- `domain` contracts (event types to trace)
- Standard library / observability libraries (OpenTelemetry) when introduced
