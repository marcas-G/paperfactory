# runtime — M3 Agent Runtime

## Responsibility

Execute agent harness concerns. The runtime understands operational state
(run failed, tool timeout, permission denied, waiting for approval) but
never interprets research-domain meaning (hypothesis validity, gap truth,
claim strength).

## Owns

- Session
- Run
- Agent execution
- Skill execution
- Tool execution
- Subagent isolation
- Retry
- Timeout
- Checkpoint
- Resume
- Permission runtime
- Sandbox runtime
- Hooks

## Must Not Own

- Research semantics
- Hypothesis judgement policy
- Novelty policy
- Claim policy
- Research State authority

## Allowed Dependencies

- `domain` contracts (types only)
- `cognition` contracts (when driving an agent's cognitive mode/context)
- Standard library

Runtime MUST NOT mutate Research State directly.
