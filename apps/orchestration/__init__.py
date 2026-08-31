"""apps.orchestration — M7 composition root for the vertical slice (STEP-015).

This is the ONLY production location allowed to see multiple planes at once
(control + cognition + runtime). Each plane stays internally independent; the
wiring happens here, at the application edge, per dependency-rules.md:

    Application  ->  Control Plane  ->  Cognitive / Runtime  ->  ...

No framework imports, no I/O, no ``packages.*.testing`` imports. Every engine
and store is injected; id/time factories are injected so tests stay
deterministic.
"""

from .action_executor import ResearchActionExecutor
from .contracts import ActionExecutionFailure, ActionExecutionRecord, ActionExecutionRequest

__all__ = [
    "ActionExecutionFailure",
    "ActionExecutionRequest",
    "ActionExecutionRecord",
    "ResearchActionExecutor",
]
