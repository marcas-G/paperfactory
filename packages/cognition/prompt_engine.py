"""PromptAssembler — deterministic prompt assembly (STEP-008 §40/§42).

Strict pipeline:
    validate PromptRequest staleness
    -> validate PromptRequest <-> ContextBundle consistency (project/branch/
       revision/action/mode)
    -> validate bundle is current
    -> load harness / mode / task templates
    -> render harness, mode, task (string.Template)
    -> project context items: INSTRUCTION -> CONTEXT_INSTRUCTION (trusted),
       everything else -> CONTEXT_DATA (untrusted, canonical JSON)
    -> order segments by frozen instruction precedence
    -> build immutable PromptPackage + save

It MUST NOT retrieve, compile a ContextBundle, blind, call an LLM, create a
Task/Approval, or modify Research State.
"""

from __future__ import annotations

from collections.abc import Callable

from ..domain.ids import (
    PromptPackageId,
    PromptSegmentId,
)
from .clock import TimeProvider, default_id, default_now
from .context import (
    ContextBundle,
    ContextItemType,
)
from .errors import PromptContextMismatchError, StalePromptRequestError
from .prompt import (
    ASSEMBLER_VERSION,
    PromptPackage,
    PromptPolicy,
    PromptRequest,
    PromptSegment,
    PromptSegmentKind,
    PromptSegmentTrust,
    PromptTemplate,
    PromptTemplateRenderer,
    TemplateRef,
    render_context_data,
)
from .store import PromptPackageStore, PromptTemplateRegistry

# Frozen instruction ordering (STEP-008 §32). CONTEXT_DATA always last.
# Within an authority bucket, context instructions keep their ContextBundle
# item order.


class PromptAssembler:
    """Deterministic, provider-neutral prompt assembly."""

    def __init__(
        self,
        package_store: PromptPackageStore,
        *,
        package_id_factory: Callable[[], PromptPackageId] | None = None,
        segment_id_factory: Callable[[], PromptSegmentId] | None = None,
        now: TimeProvider | None = None,
    ) -> None:
        self._store = package_store
        self._package_id_factory: Callable[[], PromptPackageId] = (
            package_id_factory or _default_package_id
        )
        self._segment_id_factory: Callable[[], PromptSegmentId] = (
            segment_id_factory or _default_segment_id
        )
        self._now: TimeProvider = now or default_now

    def assemble(
        self,
        request: PromptRequest,
        context_bundle: ContextBundle,
        prompt_policy: PromptPolicy,
        template_registry: PromptTemplateRegistry,
        current_state_revision: int,
    ) -> PromptPackage:
        # 1. staleness
        if request.state_revision != current_state_revision:
            raise StalePromptRequestError(
                f"request revision {request.state_revision} != current {current_state_revision}"
            )
        # 2. consistency (request vs bundle)
        self._check_consistency(request, context_bundle)
        # 3. bundle must also be current
        if context_bundle.state_revision != current_state_revision:
            raise StalePromptRequestError(
                f"context bundle revision {context_bundle.state_revision} != "
                f"current {current_state_revision}"
            )
        # request references the right bundle
        if request.context_bundle_id != context_bundle.bundle_id:
            raise PromptContextMismatchError(
                f"request bundle {request.context_bundle_id} != "
                f"provided bundle {context_bundle.bundle_id}"
            )

        # 4. load templates
        harness = template_registry.get(
            prompt_policy.harness_template_ref.template_id,
            prompt_policy.harness_template_ref.version,
        )
        task_tmpl = template_registry.get(
            prompt_policy.task_template_ref.template_id,
            prompt_policy.task_template_ref.version,
        )
        mode_ref = prompt_policy.mode_template_refs[_mode(request.cognitive_mode)]
        mode_tmpl = template_registry.get(mode_ref.template_id, mode_ref.version)

        used_template_refs: list[TemplateRef] = [
            prompt_policy.harness_template_ref,
            mode_ref,
            prompt_policy.task_template_ref,
        ]

        segments: list[PromptSegment] = []
        ordinal = 0

        # 5a. HARNESS_GUARDRAIL
        ordinal += 1
        segments.append(
            self._template_segment(
                ordinal,
                harness,
                {},
                kind=PromptSegmentKind.HARNESS_GUARDRAIL,
                authority="HARNESS",
            )
        )

        # 5b. context instructions grouped by authority, bundle order preserved
        ordinal = self._add_context_instructions(segments, ordinal, context_bundle)

        # 5c. MODE_GUIDANCE
        ordinal += 1
        segments.append(
            self._template_segment(
                ordinal,
                mode_tmpl,
                {"cognitive_mode": request.cognitive_mode},
                kind=PromptSegmentKind.MODE_GUIDANCE,
                authority="MODE",
            )
        )

        # 5d. TASK_INSTRUCTION
        ordinal += 1
        constraints_rendered = _render_constraints(request.task_constraints)
        segments.append(
            self._template_segment(
                ordinal,
                task_tmpl,
                {
                    "task_objective": request.task_objective,
                    "task_constraints_rendered": constraints_rendered,
                    "action_id": str(request.action_id) if request.action_id else "",
                    "cognitive_mode": request.cognitive_mode,
                },
                kind=PromptSegmentKind.TASK_INSTRUCTION,
                authority="TASK",
            )
        )

        # 5e. CONTEXT_DATA (untrusted, canonical JSON), bundle order preserved
        ordinal = self._add_context_data(segments, ordinal, context_bundle)

        # source refs: at least the bundle's included source refs
        source_refs = tuple(getattr(i, "source_ref", None) for i in context_bundle.items)

        package = PromptPackage(
            package_id=self._package_id_factory(),
            request_id=request.request_id,
            project_id=request.project_id,
            branch_id=request.branch_id,
            state_revision=request.state_revision,
            action_id=request.action_id,
            cognitive_mode=request.cognitive_mode,
            context_bundle_id=context_bundle.bundle_id,
            output_contract_id=request.output_contract_id,
            output_contract_version=request.output_contract_version,
            prompt_policy_id=request.prompt_policy_id,
            prompt_policy_version=request.prompt_policy_version,
            assembler_version=ASSEMBLER_VERSION,
            segments=tuple(segments),
            template_refs=tuple(used_template_refs),
            source_refs=source_refs,
            created_at=self._now(),
        )
        self._store.save(package)
        return package

    # -------------------------------------------------------------------
    def _template_segment(
        self,
        ordinal: int,
        template: PromptTemplate,
        variables: dict[str, str],
        *,
        kind: PromptSegmentKind,
        authority: str,
    ) -> PromptSegment:
        # Provide exactly the variables the template declares (STEP-008 §14:
        # renderer rejects missing/extra). Candidates not declared are dropped.
        declared = {k: v for k, v in variables.items() if k in template.variables}
        rendered = PromptTemplateRenderer.render(template, declared)
        return PromptSegment(
            segment_id=self._segment_id_factory(),
            kind=kind,
            trust=PromptSegmentTrust.TRUSTED_INSTRUCTION,
            ordinal=ordinal,
            content=rendered,
            authority=authority,
            template_id=template.template_id,
            template_version=template.version,
            source_refs=((template.template_id, template.version),),
        )

    def _add_context_instructions(
        self,
        segments: list[PromptSegment],
        ordinal: int,
        bundle: ContextBundle,
    ) -> int:
        instructions = [it for it in bundle.items if it.item_type is ContextItemType.INSTRUCTION]
        for authority_value in ("SYSTEM", "PROJECT", "BRANCH"):
            for item in instructions:
                if item.instruction_authority is None:
                    continue
                if item.instruction_authority.value != authority_value:
                    continue
                ordinal += 1
                segments.append(
                    PromptSegment(
                        segment_id=self._segment_id_factory(),
                        kind=PromptSegmentKind.CONTEXT_INSTRUCTION,
                        trust=PromptSegmentTrust.TRUSTED_INSTRUCTION,
                        ordinal=ordinal,
                        content=item.content,
                        authority=item.instruction_authority.value,
                        source_refs=(item.source_ref,),
                        context_item_id=item.item_id,
                    )
                )
        return ordinal

    def _add_context_data(
        self,
        segments: list[PromptSegment],
        ordinal: int,
        bundle: ContextBundle,
    ) -> int:
        for item in bundle.items:
            if item.item_type is ContextItemType.INSTRUCTION:
                continue
            ordinal += 1
            payload = {
                "context_item_id": str(item.item_id),
                "item_type": item.item_type.value,
                "layer": item.layer.value,
                "scope": item.scope.value,
                "source": {
                    "source_type": item.source_ref.source_type,
                    "source_id": item.source_ref.source_id,
                    "version": item.source_ref.version,
                },
                "content": item.content,
            }
            segments.append(
                PromptSegment(
                    segment_id=self._segment_id_factory(),
                    kind=PromptSegmentKind.CONTEXT_DATA,
                    trust=PromptSegmentTrust.UNTRUSTED_CONTEXT,
                    ordinal=ordinal,
                    content=render_context_data(payload),
                    authority=None,
                    source_refs=(item.source_ref,),
                    context_item_id=item.item_id,
                    metadata={
                        "item_type": item.item_type.value,
                        "layer": item.layer.value,
                        "scope": item.scope.value,
                    },
                )
            )
        return ordinal

    @staticmethod
    def _check_consistency(request: PromptRequest, bundle: ContextBundle) -> None:
        if request.project_id != bundle.project_id:
            raise PromptContextMismatchError("project mismatch between request and bundle")
        if request.branch_id != bundle.branch_id:
            raise PromptContextMismatchError("branch mismatch between request and bundle")
        if request.state_revision != bundle.state_revision:
            raise PromptContextMismatchError("state_revision mismatch")
        if request.action_id != bundle.action_id:
            raise PromptContextMismatchError("action_id mismatch")
        if request.cognitive_mode != bundle.cognitive_mode:
            raise PromptContextMismatchError("cognitive_mode mismatch")


def _render_constraints(constraints: tuple[str, ...]) -> str:
    """Deterministic constraints rendering (STEP-008 §33): numbered 1..N,
    empty string when none."""
    if not constraints:
        return ""
    return "\n".join(f"{i}. {c}" for i, c in enumerate(constraints, start=1))


def _mode(cognitive_mode: str):
    from .modes import CognitiveMode

    return CognitiveMode(cognitive_mode)


def _default_package_id() -> PromptPackageId:
    return PromptPackageId(default_id())


def _default_segment_id() -> PromptSegmentId:
    return PromptSegmentId(default_id())


__all__ = ["PromptAssembler"]
