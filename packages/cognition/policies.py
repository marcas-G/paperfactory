"""ContextPolicy and BlindingPolicy (STEP-006 §12, §14).

Both are versioned: every compiled bundle records exactly which policy
versions produced it. ContextPolicy only determines deterministic compilation
behavior (layer order + default blinding + compiler version); it does NOT
carry semantic thresholds or retrieval strategy.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .context import ContextLayer, ContextProtectionTag
from .errors import InvalidContextPolicyError

# Compiler version for this STEP-006 kernel. Bumped if the deterministic
# compilation algorithm changes in a way that would alter bundle contents.
COMPILER_VERSION = "cognitive-context-kernel/0.1"


@dataclass(frozen=True)
class BlindingPolicy:
    """Which protection tags to hide (STEP-006 §12). Empty set = no blinding."""

    policy_id: str
    version: int
    hidden_tags: frozenset[ContextProtectionTag] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        if not self.policy_id:
            raise InvalidContextPolicyError("blinding policy_id must be non-empty")
        if self.version < 1:
            raise InvalidContextPolicyError("blinding policy version must be >= 1")

    def hides(self, tag: ContextProtectionTag) -> bool:
        return tag in self.hidden_tags


@dataclass(frozen=True)
class ContextPolicy:
    """Versioned, deterministic compilation policy (STEP-006 §14)."""

    policy_id: str
    version: int
    layer_order: tuple[ContextLayer, ...]
    default_blinding_policy: BlindingPolicy
    compiler_version: str = COMPILER_VERSION

    def __post_init__(self) -> None:
        if not self.policy_id:
            raise InvalidContextPolicyError("context policy_id must be non-empty")
        if self.version < 1:
            raise InvalidContextPolicyError("context policy version must be >= 1")
        # layer_order must be exactly a permutation of the three layers
        expected = {ContextLayer.GLOBAL, ContextLayer.STATE, ContextLayer.TASK}
        if set(self.layer_order) != expected or len(self.layer_order) != 3:
            raise InvalidContextPolicyError(
                "layer_order must be a permutation of {GLOBAL, STATE, TASK}"
            )


__all__ = ["COMPILER_VERSION", "BlindingPolicy", "ContextPolicy"]
