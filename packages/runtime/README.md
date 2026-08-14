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

## Current Implementation (STEP-011..STEP-013)

Implemented:
- RuntimeSession (branch-scoped; OPEN → CLOSED/CANCELLED)
- RuntimeRun (CREATED → READY → RUNNING → WAITING/SUCCEEDED/FAILED/CANCELLED/TIMED_OUT)
- ExecutionAttempt (RUNNING → terminal; monotonic attempt_number; single active)
- RuntimeFailure taxonomy (NETWORK/RATE_LIMIT/TIMEOUT/RESOURCE/PROVIDER/TOOL/INTERNAL)
- RuntimeEvent (distinct from DomainEvent; session/run/attempt audit facts)
- RuntimeSessionManager / RuntimeRunManager (deterministic lifecycle)
- Store ports (Session/Run/Attempt/EventSink)
- Provider execution contracts (Request/Response/Outcome/Port)
- RuntimeExecutionCoordinator
- FakeProviderExecutor (test/dev)
- ModelExecutionProfile (pins provider + model identity only; no generation params)
- AgentDefinition (versioned runtime definition; no cognitive policy, no tools)
- AgentExecutionBinding (run-scoped, immutable, exactly-once, provider/model snapshot)
- AgentBindingManager (strict CREATED-only binding; AGENT_BOUND event; atomic rollback)
- AgentProviderExecutionRequestFactory (provider/model/input_ref sourced from Binding/Run)

Not implemented yet (later M3 steps):
- ModelExecutionConfig (temperature/top_p/max_tokens/seed/...)
- Model Selection Policy / Router
- Agent Loop (max_steps / termination / ReAct)
- Tool / Skill / Subagent
- Retry Policy / Backoff
- Checkpoint
- Temporal integration
- Sandbox / Permission Runtime / Hooks
- Provider Execution Adapter (OpenAI/Anthropic SDK)

## Must Not Own

- Research semantics
- Hypothesis judgement policy
- Novelty policy
- Claim policy
- Research State authority

## Allowed Dependencies

- `domain` contracts (types only)
- Standard library

Runtime MUST NOT mutate Research State directly. STEP-011 does NOT import
`cognition` or `control` — it uses opaque typed refs (RuntimeInputRef /
RuntimeOutputRef) for input/output artifacts.

