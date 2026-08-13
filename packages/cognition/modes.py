"""CognitiveMode — how a cognitive task should be framed (STEP-006 §5).

A closed set of ten research-cognitive modes. In STEP-006 a mode is a contract
only: it is carried on the ContextRequest/ContextBundle for audit and future
framing, but it does NOT change selection (STEP-006 §37). No fuzzy modes like
GENERAL / DEFAULT / SMART / AUTO.
"""

from __future__ import annotations

from enum import StrEnum


class CognitiveMode(StrEnum):
    """Closed set of research-cognitive modes."""

    FRAME = "FRAME"
    EXPLORE = "EXPLORE"
    MAP = "MAP"
    COMPARE = "COMPARE"
    FALSIFY = "FALSIFY"
    DIAGNOSE = "DIAGNOSE"
    DISCRIMINATE = "DISCRIMINATE"
    VERIFY = "VERIFY"
    SYNTHESIZE = "SYNTHESIZE"
    DECIDE = "DECIDE"


__all__ = ["CognitiveMode"]
