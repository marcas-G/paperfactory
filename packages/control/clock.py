"""Injectable time and id providers for deterministic control logic.

Keeping these in a tiny, dependency-free module lets TaskManager /
ApprovalManager / TransitionEngine depend on the type aliases without
coupling to each other. Real implementations default to wall-clock time and
UUIDv4; tests inject fixed values.
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
