"""Prompt policy & assembly contracts (STEP-008).

The fundamental boundary (STEP-008 §3):

    ContextBundle != Prompt string
    PromptPackage != Provider API message format
    PromptPackage != Model execution

A ``PromptPackage`` is a structured, provider-neutral cognitive input artifact
compiled by a versioned PromptPolicy. It preserves segment boundaries and
instruction/data separation — it is NOT a flattened prompt string and contains
no provider-specific messages.

Instruction/data separation (§4): only ``ContextItemType.INSTRUCTION`` items
may carry instruction authority; everything else is CONTEXT DATA. Authority
comes from typed metadata, never from parsing natural-language content.
"""

from __future__ import annotations

import json
import re
import string
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum

from ..domain.ids import (
    ActionId,
    BranchId,
    ContextBundleId,
    ContextItemId,
    OutputContractId,
    ProjectId,
    PromptPackageId,
    PromptPolicyId,
    PromptRequestId,
    PromptSegmentId,
    PromptTemplateId,
)
from .errors import (
    InvalidPromptPolicyError,
    InvalidPromptRequestError,
    PromptTemplateError,
    PromptTemplateVariableError,
)
from .modes import CognitiveMode

# Assembler algorithm version for this STEP-008 kernel.
ASSEMBLER_VERSION = "prompt-assembler/0.1"

# Variable names: simple identifiers only — no attribute access, index, call.
_VAR_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class PromptSegmentTrust(StrEnum):
    """Trust level of a prompt segment (STEP-008 §9)."""

    TRUSTED_INSTRUCTION = "TRUSTED_INSTRUCTION"
    UNTRUSTED_CONTEXT = "UNTRUSTED_CONTEXT"


class PromptSegmentKind(StrEnum):
    """Kind of a prompt segment (STEP-008 §10). Provider-neutral."""

    HARNESS_GUARDRAIL = "HARNESS_GUARDRAIL"
    CONTEXT_INSTRUCTION = "CONTEXT_INSTRUCTION"
    MODE_GUIDANCE = "MODE_GUIDANCE"
    TASK_INSTRUCTION = "TASK_INSTRUCTION"
    CONTEXT_DATA = "CONTEXT_DATA"


class PromptTemplateKind(StrEnum):
    """Kind of a versioned PromptTemplate (STEP-008 §11)."""

    HARNESS_GUARDRAIL = "HARNESS_GUARDRAIL"
    MODE_GUIDANCE = "MODE_GUIDANCE"
    TASK_FRAME = "TASK_FRAME"


@dataclass(frozen=True)
class TemplateRef:
    """A (template_id, version) reference used by a PromptPolicy."""

    template_id: PromptTemplateId
    version: int


@dataclass(frozen=True)
class PromptTemplate:
    """An immutable, versioned prompt template (STEP-008 §12/§13).

    ``body`` uses ``string.Template`` syntax (``$name`` / ``${name}``) — no
    Jinja, no ``str.format``, no expression execution.
    """

    template_id: PromptTemplateId
    version: int
    kind: PromptTemplateKind
    body: str
    variables: frozenset[str] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        if not self.body or not self.body.strip():
            raise PromptTemplateError("template body must be non-empty")
        if self.version < 1:
            raise PromptTemplateError("template version must be >= 1")
        for name in self.variables:
            if not _VAR_NAME.match(name):
                raise PromptTemplateError(
                    f"invalid template variable name: {name!r} "
                    "(must be [A-Za-z_][A-Za-z0-9_]*)"
                )
        # Declared variables must actually appear in the body (sanity).
        declared = _extract_template_vars(self.body)
        unknown = declared - self.variables
        if unknown:
            raise PromptTemplateError(
                f"body references undeclared variables: {sorted(unknown)}"
            )


class PromptTemplateRenderer:
    """Deterministic ``string.Template`` renderer (STEP-008 §13/§14).

    No Jinja, no eval, no env vars, no filesystem, no LLM. Variables must
    EXACTLY cover the template's declared set (no missing, no extra). No
    unresolved placeholder may remain.
    """

    @staticmethod
    def render(template: PromptTemplate, variables: Mapping[str, str]) -> str:
        provided = set(variables)
        if provided != set(template.variables):
            missing = set(template.variables) - provided
            extra = provided - set(template.variables)
            raise PromptTemplateVariableError(
                f"variable mismatch for {template.template_id}@v{template.version}: "
                f"missing={sorted(missing)}, extra={sorted(extra)}"
            )
        try:
            rendered = string.Template(template.body).substitute(variables)
        except (ValueError, KeyError) as exc:
            raise PromptTemplateVariableError(
                f"failed to render {template.template_id}@v{template.version}: {exc}"
            ) from exc
        # No unresolved placeholder may remain.
        if "$" in rendered:
            raise PromptTemplateError(
                f"rendered body contains unresolved placeholder for "
                f"{template.template_id}@v{template.version}"
            )
        return rendered


@dataclass(frozen=True)
class PromptPolicy:
    """Immutable, versioned prompt policy (STEP-008 §20/§21).

    Maps every CognitiveMode to a MODE_GUIDANCE template, references a
    HARNESS_GUARDRAIL and a TASK_FRAME template, and pins the instruction
    precedence (frozen system invariant, not a free preference).
    """

    policy_id: PromptPolicyId
    version: int

    harness_template_ref: TemplateRef
    task_template_ref: TemplateRef
    mode_template_refs: Mapping[CognitiveMode, TemplateRef]

    instruction_precedence: tuple[str, ...] = (
        "HARNESS",
        "SYSTEM",
        "PROJECT",
        "BRANCH",
        "MODE",
        "TASK",
    )
    assembler_version: str = ASSEMBLER_VERSION

    def __post_init__(self) -> None:
        if not self.policy_id:
            raise InvalidPromptPolicyError("policy_id must be non-empty")
        if self.version < 1:
            raise InvalidPromptPolicyError("version must be >= 1")
        # All 10 modes must be covered.
        for mode in CognitiveMode:
            if mode not in self.mode_template_refs:
                raise InvalidPromptPolicyError(
                    f"missing MODE_GUIDANCE template for {mode.value}"
                )
        # Extra modes impossible (enum closed), but guard anyway.
        if set(self.mode_template_refs) != set(CognitiveMode):
            raise InvalidPromptPolicyError("mode_template_refs must cover exactly the 10 modes")
        # Instruction precedence is a frozen invariant.
        if list(self.instruction_precedence) != [
            "HARNESS",
            "SYSTEM",
            "PROJECT",
            "BRANCH",
            "MODE",
            "TASK",
        ]:
            raise InvalidPromptPolicyError(
                "instruction_precedence must be exactly "
                "(HARNESS, SYSTEM, PROJECT, BRANCH, MODE, TASK)"
            )


@dataclass(frozen=True)
class PromptRequest:
    """An immutable request for prompt assembly (STEP-008 §22/§23).

    References a ContextBundle by id — it does NOT carry raw context.
    """

    request_id: PromptRequestId
    project_id: ProjectId | None
    branch_id: BranchId | None
    state_revision: int
    action_id: ActionId | None
    cognitive_mode: str

    context_bundle_id: ContextBundleId

    output_contract_id: OutputContractId
    output_contract_version: int

    task_objective: str
    task_constraints: tuple[str, ...] = ()

    prompt_policy_id: str = "default"
    prompt_policy_version: int = 1
    created_at: datetime = field(default_factory=lambda: _EPOCH)

    def __post_init__(self) -> None:
        if not self.output_contract_id:
            raise InvalidPromptRequestError("output_contract_id must be non-empty")
        if self.output_contract_version < 1:
            raise InvalidPromptRequestError("output_contract_version must be >= 1")
        if not self.task_objective or not self.task_objective.strip():
            raise InvalidPromptRequestError("task_objective must be non-empty")
        for c in self.task_constraints:
            if not c or not c.strip():
                raise InvalidPromptRequestError("task_constraints must be non-empty")
        if len(set(self.task_constraints)) != len(self.task_constraints):
            raise InvalidPromptRequestError("task_constraints must not duplicate")
        if self.created_at.tzinfo is None or self.created_at.utcoffset() is None:
            raise InvalidPromptRequestError("created_at must be timezone-aware")


@dataclass(frozen=True)
class PromptSegment:
    """One ordered segment of a PromptPackage (STEP-008 §26)."""

    segment_id: PromptSegmentId
    kind: PromptSegmentKind
    trust: PromptSegmentTrust
    ordinal: int
    content: str

    authority: str | None = None
    source_refs: tuple = ()
    context_item_id: ContextItemId | None = None
    template_id: PromptTemplateId | None = None
    template_version: int | None = None
    metadata: Mapping[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class PromptPackage:
    """Immutable, provider-neutral compiled prompt (STEP-008 §35).

    Preserves segment boundaries — NOT a flattened prompt string and contains
    NO provider-specific messages.
    """

    package_id: PromptPackageId
    request_id: PromptRequestId

    project_id: ProjectId | None
    branch_id: BranchId | None
    state_revision: int

    action_id: ActionId | None
    cognitive_mode: str
    context_bundle_id: ContextBundleId

    output_contract_id: OutputContractId
    output_contract_version: int

    prompt_policy_id: str
    prompt_policy_version: int
    assembler_version: str

    segments: tuple[PromptSegment, ...]
    template_refs: tuple[TemplateRef, ...]
    source_refs: tuple = ()
    created_at: datetime = field(default_factory=lambda: _EPOCH)


def is_prompt_package_current(
    package: PromptPackage, current_state_revision: int
) -> bool:
    """A package is current only if the state revision is unchanged
    (STEP-008 §38). No auto-refresh."""
    return package.state_revision == current_state_revision


def render_context_data(payload: Mapping[str, object]) -> str:
    """Canonical, deterministic JSON rendering of a context-data item
    (STEP-008 §30).

    sort_keys=True, ensure_ascii=False. Content embedded as a JSON string
    value is escaped — embedded ``}]</context>`` / ``ignore previous ...``
    cannot break structural boundaries. No eval, no fragile delimiters.
    """
    return json.dumps(payload, sort_keys=True, ensure_ascii=False)


# --- internals ---------------------------------------------------------
def _extract_template_vars(body: str) -> set[str]:
    """Pull ``$name`` / ``${name}`` identifiers out of a template body."""
    names: set[str] = set()
    # ${name}
    for m in re.finditer(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", body):
        names.add(m.group(1))
    # $name (not followed by { )
    for m in re.finditer(r"\$([A-Za-z_][A-Za-z0-9_]*)(?!\{)", body):
        names.add(m.group(1))
    return names


# Placeholder tz-aware epoch for the dataclass default only; producers and the
# assembler always supply a real timestamp.
_EPOCH: datetime = datetime(1970, 1, 1, tzinfo=UTC)


__all__ = [
    "ASSEMBLER_VERSION",
    "PromptPackage",
    "PromptPolicy",
    "PromptRequest",
    "PromptSegment",
    "PromptSegmentKind",
    "PromptSegmentTrust",
    "PromptTemplate",
    "PromptTemplateKind",
    "PromptTemplateRenderer",
    "TemplateRef",
    "is_prompt_package_current",
    "render_context_data",
]
