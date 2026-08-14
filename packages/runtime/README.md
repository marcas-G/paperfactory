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

## Current Implementation (STEP-011..STEP-014)

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
- ModelExecutionProfile (provider+model identity + capability declaration + supported params)
- AgentDefinition (versioned runtime definition; no cognitive policy, no tools)
- AgentExecutionBinding (run-scoped, immutable; pins Agent/Profile/Config versions + snapshots)
- AgentBindingManager (strict CREATED-only binding; AGENT_BOUND event; atomic rollback)
- AgentProviderExecutionRequestFactory (provider/model/input_ref/parameters from Binding/Run)
- ModelCapability declaration (closed enum; declaration, not discovery)
- ModelParameter / ModelParameterSetting (4 canonical params; strict validation, no coercion)
- ModelExecutionConfig (versioned; exact Profile ref; explicit empty config legal)
- Config/Profile compatibility validation (exact version + supported params)
- Model Selection Requirements / Signals / Weights / Policy (explicit, deterministic)
- ModelSelectionRecommendation (RECOMMENDED | NO_MATCH; recommendation != binding)
- ModelSelectionEngine (deterministic scoring + stable tie-break; candidate universe = Agent allowed profiles)

Not implemented yet (later M3 steps):
- Real Provider Adapter (OpenAI/Anthropic SDK) + Provider Parameter Mapping
- Dynamic Metric Collection / Model Benchmark Service / Live Price Lookup
- Config Selection Policy (caller must still pick an exact Config explicitly)
- Agent Loop (max_steps / termination / ReAct)
- Tool / Skill / Subagent
- Retry Policy / Backoff
- Checkpoint
- Temporal integration
- Sandbox / Permission Runtime / Hooks

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

