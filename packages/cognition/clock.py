"""Injectable time and id providers for deterministic cognition logic.

M2 deliberately does NOT import ``packages.control.clock`` (STEP-006 §43): the
cognition layer keeps its own lightweight provider abstraction so it does not
depend on the control plane's concrete helpers.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime

TimeProvider = Callable[[], datetime]
IdFactory = Callable[[], str]


def default_now() -> datetime:
    return datetime.now(UTC)


def default_id() -> str:
    return uuid.uuid4().hex


__all__ = ["IdFactory", "TimeProvider", "default_id", "default_now"]
