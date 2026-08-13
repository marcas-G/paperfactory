"""Provider prompt projection — deterministic mapping (STEP-009).

Maps a provider-neutral ``PromptPackage`` into a provider-specific projection
(OpenAI / Anthropic). This is a REPRESENTATION layer only: no LLM call, no SDK,
no model selection, no network.

Pipeline per projection: validate (fail-closed) -> build trace -> render
instruction channel (trusted only) -> render data channel (CONTEXT_DATA only).

Trust invariant (STEP-009 §8): UNTRUSTED_CONTEXT never enters the
instruction/system channel. CONTEXT_DATA content — even when its natural
language contains ``"ignore previous instructions"`` / ``"SYSTEM: ..."`` — is
placed only on the data side.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from .errors import (
    InvalidPromptPackageForProjectionError,
    UnknownSegmentKindError,
)
from .prompt import PromptPackage, PromptSegment, PromptSegmentKind, PromptSegmentTrust
from .provider import (
    AnthropicProviderProjection,
    OpenAIProviderProjection,
    ProviderDataEntry,
    ProviderKind,
    ProviderProjectionTrace,
    SegmentTrace,
)

# Trusted instruction kinds (STEP-008 frozen set).
_TRUSTED_INSTRUCTION_KINDS = frozenset(
    {
        PromptSegmentKind.HARNESS_GUARDRAIL,
        PromptSegmentKind.CONTEXT_INSTRUCTION,
        PromptSegmentKind.MODE_GUIDANCE,
        PromptSegmentKind.TASK_INSTRUCTION,
    }
)

# Authority precedence rank (lower index = higher precedence).
_AUTHORITY_RANK = {
    "HARNESS": 0,
    "SYSTEM": 1,
    "PROJECT": 2,
    "BRANCH": 3,
    "MODE": 4,
    "TASK": 5,
}


@runtime_checkable
class ProviderPromptProjector(Protocol):
    """Projects a PromptPackage into a provider-specific representation."""

    def project(self, package: PromptPackage):  # -> ProviderPromptProjection
        ...


def _segment_kind_from_str(value: str) -> PromptSegmentKind:
    try:
        return PromptSegmentKind(value)
    except ValueError as exc:
        raise UnknownSegmentKindError(f"unknown segment kind: {value!r}") from exc


def _validate_package(package: PromptPackage) -> None:
    """Fail-closed validation (STEP-009 §7). Reject malformed/contradictory."""
    if not package.segments:
        return  # empty package is legal
    last_instruction_rank: int | None = None
    for seg in package.segments:
        kind = seg.kind
        trust = seg.trust
        is_instruction_kind = kind in _TRUSTED_INSTRUCTION_KINDS
        # trust <-> kind consistency
        if is_instruction_kind and trust is not PromptSegmentTrust.TRUSTED_INSTRUCTION:
            raise InvalidPromptPackageForProjectionError(
                f"segment {seg.segment_id}: {kind.value} must be TRUSTED_INSTRUCTION, "
                f"got {trust.value}"
            )
        if (
            kind is PromptSegmentKind.CONTEXT_DATA
            and trust is not PromptSegmentTrust.UNTRUSTED_CONTEXT
        ):
            raise InvalidPromptPackageForProjectionError(
                f"segment {seg.segment_id}: CONTEXT_DATA must be UNTRUSTED_CONTEXT, "
                f"got {trust.value}"
            )
        # authority <-> kind consistency
        authority = seg.authority
        if is_instruction_kind:
            if authority is None:
                raise InvalidPromptPackageForProjectionError(
                    f"segment {seg.segment_id}: instruction segment missing authority"
                )
            if authority not in _AUTHORITY_RANK:
                raise InvalidPromptPackageForProjectionError(
                    f"segment {seg.segment_id}: unknown authority {authority!r}"
                )
        else:
            if authority is not None:
                raise InvalidPromptPackageForProjectionError(
                    f"segment {seg.segment_id}: CONTEXT_DATA must not carry authority "
                    f"({authority!r})"
                )
        # instruction ordering must be non-decreasing in precedence rank
        if is_instruction_kind and authority is not None:
            rank = _AUTHORITY_RANK[authority]
            if last_instruction_rank is not None and rank < last_instruction_rank:
                raise InvalidPromptPackageForProjectionError(
                    f"segment {seg.segment_id}: instruction authority {authority} "
                    f"violates precedence order (rank {rank} < previous {last_instruction_rank})"
                )
            last_instruction_rank = rank


def _build_segment_trace(seg: PromptSegment) -> SegmentTrace:
    template_id = None
    template_version = None
    if seg.template_id is not None:
        template_id = seg.template_id
        template_version = seg.template_version
    return SegmentTrace(
        ordinal=seg.ordinal,
        segment_kind=seg.kind.value,
        trust=seg.trust.value,
        authority=seg.authority,
        template_id=template_id,
        template_version=template_version,
        context_item_id=seg.context_item_id,
        source_refs=seg.source_refs,
    )


def _build_trace(package: PromptPackage, provider: ProviderKind) -> ProviderProjectionTrace:
    return ProviderProjectionTrace(
        package_id=package.package_id,
        request_id=package.request_id,
        state_revision=package.state_revision,
        provider=provider,
        assembler_version=package.assembler_version,
        prompt_policy_id=package.prompt_policy_id,
        prompt_policy_version=package.prompt_policy_version,
        context_bundle_id=package.context_bundle_id,
        source_segment_traces=tuple(_build_segment_trace(s) for s in package.segments),
        template_refs=package.template_refs,
        context_source_refs=package.source_refs,
    )


def _render_instructions(package: PromptPackage) -> tuple[str, tuple[int, ...]]:
    """Deterministically join trusted instruction segment contents."""
    parts: list[str] = []
    ordinals: list[int] = []
    for seg in package.segments:
        if seg.kind in _TRUSTED_INSTRUCTION_KINDS:
            parts.append(seg.content)
            ordinals.append(seg.ordinal)
    return "\n\n".join(parts), tuple(ordinals)


def _render_data(package: PromptPackage) -> tuple[ProviderDataEntry, ...]:
    """CONTEXT_DATA -> ProviderDataEntry, in segment order."""
    entries: list[ProviderDataEntry] = []
    for seg in package.segments:
        if seg.kind is PromptSegmentKind.CONTEXT_DATA:
            entries.append(
                ProviderDataEntry(
                    ordinal=seg.ordinal,
                    rendered_content=seg.content,
                    context_item_id=seg.context_item_id,
                    source_refs=seg.source_refs,
                )
            )
    return tuple(entries)


class OpenAIProjector:
    """Deterministic OpenAI-style projection (no SDK)."""

    def project(self, package: PromptPackage) -> OpenAIProviderProjection:
        _validate_package(package)
        instructions, instr_ordinals = _render_instructions(package)
        data = _render_data(package)
        return OpenAIProviderProjection(
            trace=_build_trace(package, ProviderKind.OPENAI),
            instructions=instructions,
            instruction_segment_ordinals=instr_ordinals,
            input=data,
        )


class AnthropicProjector:
    """Deterministic Anthropic-style projection (no SDK)."""

    def project(self, package: PromptPackage) -> AnthropicProviderProjection:
        _validate_package(package)
        system, system_ordinals = _render_instructions(package)
        data = _render_data(package)
        return AnthropicProviderProjection(
            trace=_build_trace(package, ProviderKind.ANTHROPIC),
            system=system,
            system_segment_ordinals=system_ordinals,
            messages=data,
        )


__all__ = [
    "AnthropicProjector",
    "OpenAIProjector",
    "ProviderPromptProjector",
]
