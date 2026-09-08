"""Model Execution Configuration & Capability Declaration (STEP-014).

Establishes the typed, versioned, immutable model execution configuration
that sits *on top of* a ModelExecutionProfile's provider/model identity.

Layering (STEP-014):

    ModelExecutionProfile   (provider/model identity + capability declaration)
        +
    ModelExecutionConfig    (canonical parameter settings, versioned)
        ↓
    AgentExecutionBinding   (pins Agent + Profile + Config versions + snapshot)
        ↓
    ProviderExecutionRequest (carries canonical execution_parameters)

Hard rules (STEP-014):

* No generation parameters may hide in metadata / ``dict[str, Any]``.
* Only four canonical ModelParameters this step: TEMPERATURE, TOP_P,
  MAX_OUTPUT_UNITS, SEED.
* Parameter values are strictly ``int | float`` — no object/Any/dict/list/str.
* No silent clamp, no type coercion ("0.7" → 0.7 is rejected).
* bool is NOT accepted where int is required.
* Profile.capabilities is a declaration, NOT auto-discovery. Runtime never
  queries a provider API.
* Config/Profile compatibility is exact-version and is validated at bind time.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, runtime_checkable

from ..domain.ids import (
    ModelExecutionConfigId,
)
from .errors import ModelExecutionConfigIncompatibleError

if TYPE_CHECKING:
    # Forward-reference only — avoids a circular import with agent.py, which
    # imports this module for the registry/validator. Runtime access uses
    # duck typing on the passed profile's attributes.
    from .agent import ModelExecutionProfile, ModelExecutionProfileRef


# =========================================================================
# Helpers
# =========================================================================
def _check_non_empty(value: str, field_name: str, owner: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{owner} {field_name} must be a non-empty string")


# =========================================================================
# Capability declaration
# =========================================================================
class ModelCapability(StrEnum):
    """Closed enum of model capabilities (STEP-014 §6).

    Declaration only — no Tool Runtime / Vision processing / File adapter /
    Streaming runtime is implemented this step. Subjective capabilities
    (SMART / REASONING / BEST / FAST) are deliberately excluded.
    """

    TEXT_GENERATION = "TEXT_GENERATION"
    STRUCTURED_OUTPUT = "STRUCTURED_OUTPUT"
    TOOL_CALLING = "TOOL_CALLING"
    STREAMING = "STREAMING"
    VISION_INPUT = "VISION_INPUT"
    FILE_INPUT = "FILE_INPUT"


# =========================================================================
# Canonical model parameters
# =========================================================================
class ModelParameter(StrEnum):
    """Provider-neutral canonical parameter keys (STEP-014 §7).

    Only four this step. reasoning_effort / service_tier / parallel_tool_calls
    / logprobs / frequency_penalty / presence_penalty / provider_options are
    deferred to real Provider Adapter design.
    """

    TEMPERATURE = "TEMPERATURE"
    TOP_P = "TOP_P"
    MAX_OUTPUT_UNITS = "MAX_OUTPUT_UNITS"
    SEED = "SEED"


def _is_real_int(value: object) -> bool:
    """True only for genuine int (bool excluded)."""
    return isinstance(value, int) and not isinstance(value, bool)


def _is_real_number(value: object) -> bool:
    """True for genuine int or float (bool excluded)."""
    if isinstance(value, bool):
        return False
    return isinstance(value, (int, float))


def _validate_parameter_value(parameter: ModelParameter, value: object) -> None:
    """Strict per-parameter validation (STEP-014 §8). No clamp, no coercion."""
    if parameter is ModelParameter.TEMPERATURE:
        if not _is_real_number(value):
            raise ValueError(f"TEMPERATURE value must be int|float, got {type(value).__name__}")
        assert isinstance(value, (int, float))
        v = float(value)
        if v < 0.0 or v > 2.0:
            raise ValueError(f"TEMPERATURE must be in [0.0, 2.0], got {value}")
    elif parameter is ModelParameter.TOP_P:
        if not _is_real_number(value):
            raise ValueError(f"TOP_P value must be int|float, got {type(value).__name__}")
        assert isinstance(value, (int, float))
        v = float(value)
        if v < 0.0 or v > 1.0:
            raise ValueError(f"TOP_P must be in [0.0, 1.0], got {value}")
    elif parameter is ModelParameter.MAX_OUTPUT_UNITS:
        if not _is_real_int(value):
            raise ValueError(
                f"MAX_OUTPUT_UNITS value must be int (not bool), got {type(value).__name__}"
            )
        assert isinstance(value, int) and not isinstance(value, bool)
        if value <= 0:
            raise ValueError(f"MAX_OUTPUT_UNITS must be > 0, got {value}")
    elif parameter is ModelParameter.SEED:
        if not _is_real_int(value):
            raise ValueError(f"SEED value must be int (not bool), got {type(value).__name__}")
        assert isinstance(value, int) and not isinstance(value, bool)
        if value < 0:
            raise ValueError(f"SEED must be >= 0, got {value}")
    else:  # pragma: no cover - closed enum
        raise ValueError(f"unknown ModelParameter: {parameter}")


@dataclass(frozen=True)
class ModelParameterSetting:
    """One canonical parameter setting (STEP-014 §8).

    ``value`` is strictly ``int | float``. Strings are NEVER coerced. bool is
    rejected even where int is required.
    """

    parameter: ModelParameter
    value: int | float

    def __post_init__(self) -> None:
        _validate_parameter_value(self.parameter, self.value)


# =========================================================================
# ModelExecutionConfig
# =========================================================================
@dataclass(frozen=True)
class ModelExecutionConfig:
    """An immutable, versioned model execution config (STEP-014 §13).

    Pins an exact Profile version via ``profile_ref`` and carries a tuple of
    canonical parameter settings. An EMPTY ``parameter_settings`` tuple is
    legal and means "use the Profile/Provider execution defaults" — it is an
    explicit, versioned empty config, NOT a runtime default.
    """

    config_id: ModelExecutionConfigId
    version: str
    name: str
    description: str
    profile_ref: ModelExecutionProfileRef
    parameter_settings: tuple[ModelParameterSetting, ...] = ()
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _check_non_empty(str(self.config_id), "config_id", "ModelExecutionConfig")
        _check_non_empty(self.version, "version", "ModelExecutionConfig")
        _check_non_empty(self.name, "name", "ModelExecutionConfig")
        _check_non_empty(self.description, "description", "ModelExecutionConfig")
        if not isinstance(self.parameter_settings, tuple):
            raise ValueError("parameter_settings must be a tuple")
        seen: set[ModelParameter] = set()
        for setting in self.parameter_settings:
            if setting.parameter in seen:
                raise ValueError(f"duplicate parameter: {setting.parameter}")
            seen.add(setting.parameter)


# =========================================================================
# Config registry (Port)
# =========================================================================
@runtime_checkable
class ModelExecutionConfigRegistry(Protocol):
    """Exact-version config registry (STEP-014 §15).

    NO get_latest / get_default / get_first.
    """

    def register(self, config: ModelExecutionConfig) -> None:
        """Create. MUST reject a duplicate (config_id, version)."""
        ...

    def get(
        self,
        config_id: ModelExecutionConfigId,
        version: str,
    ) -> ModelExecutionConfig:
        """Resolve by EXACT version. Raise if not found (no fallback)."""
        ...

    def list_versions(self, config_id: ModelExecutionConfigId) -> list[str]: ...


# =========================================================================
# Config / Profile compatibility validator
# =========================================================================
class ModelExecutionConfigValidator:
    """Validates a Config against an exact Profile version (STEP-014 §16/§17).

    Registry registration validates only Config self-structure; true
    Profile compatibility is checked here / at bind time, avoiding
    registration-order coupling.
    """

    def validate(
        self,
        config: ModelExecutionConfig,
        profile: ModelExecutionProfile,
    ) -> None:
        # Exact-version identity match
        if profile.profile_id != config.profile_ref.profile_id:
            raise ModelExecutionConfigIncompatibleError(
                f"config.profile_ref profile_id {config.profile_ref.profile_id} "
                f"!= profile.profile_id {profile.profile_id}"
            )
        if profile.version != config.profile_ref.version:
            raise ModelExecutionConfigIncompatibleError(
                f"config.profile_ref version {config.profile_ref.version} "
                f"!= profile.version {profile.version} (exact version required)"
            )
        # Every config parameter must be supported by the profile
        supported = profile.supported_parameters
        for setting in config.parameter_settings:
            if setting.parameter not in supported:
                raise ModelExecutionConfigIncompatibleError(
                    f"parameter {setting.parameter.value} is not supported by "
                    f"profile {profile.profile_id}/{profile.version}"
                )


__all__ = [
    "ModelCapability",
    "ModelExecutionConfig",
    "ModelExecutionConfigRegistry",
    "ModelExecutionConfigValidator",
    "ModelParameter",
    "ModelParameterSetting",
]
