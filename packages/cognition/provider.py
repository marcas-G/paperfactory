"""Provider projection contracts (STEP-009).

Provider-neutral ``PromptPackage`` -> provider-specific projection DTOs.

These DTOs are local immutable records — they do NOT depend on any provider
SDK (no openai / anthropic imports). They only describe how a PromptPackage
maps into a provider's prompt representation. LLM execution, model selection,
tool calling, retry, etc. are explicitly out of scope (future execution layer).

Core invariant (STEP-009 §8): ``UNTRUSTED_CONTEXT`` (CONTEXT_DATA) MUST NEVER
be projected into a provider's instruction/system channel. Only trusted
instruction segments (HARNESS_GUARDRAIL / CONTEXT_INSTRUCTION / MODE_GUIDANCE
/ TASK_INSTRUCTION) enter the instruction side; all CONTEXT_DATA enters the
data/input side.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from ..domain.ids import (
    ContextBundleId,
    ContextItemId,
    PromptPackageId,
    PromptRequestId,
    PromptTemplateId,
)


class ProviderKind(StrEnum):
    """Supported provider kinds for projection."""

    OPENAI = "OPENAI"
    ANTHROPIC = "ANTHROPIC"


@dataclass(frozen=True)
class SegmentTrace:
    """Trace reference from a provider content piece back to its source
    PromptSegment (STEP-009 §5). Holds only IDs/references, not full objects."""

    ordinal: int
    segment_kind: str
    trust: str
    authority: str | None
    template_id: PromptTemplateId | None = None
    template_version: int | None = None
    context_item_id: ContextItemId | None = None
    source_refs: tuple = ()


@dataclass(frozen=True)
class ProviderProjectionTrace:
    """Full trace metadata for one provider projection (STEP-009 §5)."""

    package_id: PromptPackageId
    request_id: PromptRequestId
    state_revision: int
    provider: ProviderKind
    assembler_version: str
    prompt_policy_id: str
    prompt_policy_version: int
    context_bundle_id: ContextBundleId

    # one SegmentTrace per PromptSegment in the source package, in ordinal order
    source_segment_traces: tuple[SegmentTrace, ...] = ()
    template_refs: tuple = ()
    context_source_refs: tuple = ()


@dataclass(frozen=True)
class ProviderPromptProjection:
    """Base type for provider-specific projections.

    Carries the shared trace; concrete subclasses add the provider-specific
    representation (instruction channel + data channel). The base is never
    instantiated directly — it documents the shared contract.
    """

    trace: ProviderProjectionTrace


@dataclass(frozen=True)
class ProviderDataEntry:
    """One untrusted CONTEXT_DATA entry on a provider's data/input channel.

    ``rendered_content`` is the canonical rendering produced by the assembler
    (STEP-008 canonical JSON). The provider representation carries it verbatim
    on the data side with its provenance.
    """

    ordinal: int
    rendered_content: str
    context_item_id: ContextItemId | None = None
    source_refs: tuple = ()


@dataclass(frozen=True)
class OpenAIProviderProjection(ProviderPromptProjection):
    """Deterministic OpenAI-style projection.

    Trusted instruction segments -> ``instructions`` (the OpenAI
    instructions/developer channel). CONTEXT_DATA -> ``input`` (the data/user
    channel). No SDK dependency; this is a local immutable DTO.
    """

    instructions: str = ""
    instruction_segment_ordinals: tuple[int, ...] = ()
    input: tuple[ProviderDataEntry, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class AnthropicProviderProjection(ProviderPromptProjection):
    """Deterministic Anthropic-style projection.

    Trusted instruction segments -> ``system`` (the Anthropic system channel).
    CONTEXT_DATA -> ``messages`` (the data/user channel). No SDK dependency.
    """

    system: str = ""
    system_segment_ordinals: tuple[int, ...] = ()
    messages: tuple[ProviderDataEntry, ...] = field(default_factory=tuple)


__all__ = [
    "AnthropicProviderProjection",
    "OpenAIProviderProjection",
    "ProviderDataEntry",
    "ProviderKind",
    "ProviderProjectionTrace",
    "ProviderPromptProjection",
    "SegmentTrace",
]
