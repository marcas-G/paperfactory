"""GateResult contract and the deterministic gate-aggregation rule.

A ``GateResult`` is the outcome of evaluating a single gate. The Controller
decides on ``status``; it MUST NOT parse ``message`` text.

Gate aggregation (STEP-002 §14) is fully deterministic and never calls an
LLM:

    any FAIL            -> REJECT
    else any BLOCKED     -> WAIT
    else any UNCERTAIN   -> WAIT
    else (all PASS / no required gates) -> COMMIT
"""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass, field

from ..domain.enums import GateStatus, TransitionDecision
from .actions import GateId

# Structured reason codes — the kernel/Controller compares/reports these,
# never free-text messages.
ReasonCode = str


@dataclass(frozen=True)
class GateResult:
    """Immutable outcome of evaluating one gate."""

    gate_id: GateId
    status: GateStatus
    reason_codes: tuple[ReasonCode, ...] = ()
    message: str = ""
    evidence_refs: tuple[str, ...] = field(default_factory=tuple)


def aggregate_gates(results: Collection[GateResult]) -> TransitionDecision:
    """Reduce a collection of GateResults to a single TransitionDecision.

    Rule precedence (STEP-002 §14):
        1. any FAIL    -> REJECT
        2. any BLOCKED -> WAIT
        3. any UNCERTAIN -> WAIT
        4. otherwise   -> COMMIT   (covers "all PASS" and "no gates")
    """
    statuses = [r.status for r in results]
    if GateStatus.FAIL in statuses:
        return TransitionDecision.REJECT
    if GateStatus.BLOCKED in statuses:
        return TransitionDecision.WAIT
    if GateStatus.UNCERTAIN in statuses:
        return TransitionDecision.WAIT
    return TransitionDecision.COMMIT


__all__ = ["GateResult", "ReasonCode", "aggregate_gates"]
