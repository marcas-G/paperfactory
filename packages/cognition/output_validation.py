"""OutputValidationEngine — structured cognitive output validation (STEP-010).

Strict responsibilities (STEP-010 §33):
    * validate candidate <-> prompt package consistency
    * validate state revision (stale -> StaleOutputCandidateError)
    * resolve OutputContract from the registry (system error if missing)
    * resolve StructuredOutputValidator by schema_ref (system error if missing)
    * invoke the validator exactly ONCE
    * build OutputValidationResult (+ CognitiveResultEnvelope on VALID)
    * save audit artifacts atomically (logical)

It MUST NOT call a model, retry, repair, mutate Research State, call Control,
create a Task, or create an Approval. A validation failure is a normal INVALID
result, NOT a runtime exception (STEP-010 §25).
"""

from __future__ import annotations

from collections.abc import Callable

from ..domain.ids import CognitiveResultId, OutputValidationId
from .clock import TimeProvider, default_id, default_now
from .errors import (
    OutputCandidateMismatchError,
    OutputContractNotFoundError,
    OutputValidatorNotFoundError,
    StaleOutputCandidateError,
)
from .output import (
    CognitiveResultEnvelope,
    OutputValidationResult,
    OutputValidationStatus,
    StructuredOutputCandidate,
)
from .prompt import PromptPackage
from .store import (
    CognitiveResultStore,
    OutputContractRegistry,
    OutputValidationResultStore,
    StructuredOutputValidatorRegistry,
)


class OutputValidationEngine:
    """Deterministic structured output validation."""

    def __init__(
        self,
        contract_registry: OutputContractRegistry,
        validator_registry: StructuredOutputValidatorRegistry,
        validation_store: OutputValidationResultStore,
        result_store: CognitiveResultStore,
        *,
        validation_id_factory: Callable[[], OutputValidationId] | None = None,
        result_id_factory: Callable[[], CognitiveResultId] | None = None,
        now: TimeProvider | None = None,
    ) -> None:
        self._contracts = contract_registry
        self._validators = validator_registry
        self._validation_store = validation_store
        self._result_store = result_store
        self._validation_id_factory: Callable[[], OutputValidationId] = (
            validation_id_factory or _default_validation_id
        )
        self._result_id_factory: Callable[[], CognitiveResultId] = (
            result_id_factory or _default_result_id
        )
        self._now: TimeProvider = now or default_now

    def validate(
        self,
        candidate: StructuredOutputCandidate,
        prompt_package: PromptPackage,
        current_state_revision: int,
    ) -> OutputValidationResult:
        # 1. consistency
        self._check_consistency(candidate, prompt_package)
        # 2. staleness
        if candidate.state_revision != current_state_revision:
            raise StaleOutputCandidateError(
                f"candidate revision {candidate.state_revision} != current {current_state_revision}"
            )
        # 3. resolve contract
        try:
            contract = self._contracts.get(
                candidate.output_contract_id, candidate.output_contract_version
            )
        except KeyError as exc:
            raise OutputContractNotFoundError(
                f"contract {candidate.output_contract_id}@"
                f"v{candidate.output_contract_version} not found"
            ) from exc
        # 4. resolve validator
        try:
            validator = self._validators.get(
                contract.schema_ref.schema_id, contract.schema_ref.version
            )
        except KeyError as exc:
            raise OutputValidatorNotFoundError(
                f"validator {contract.schema_ref.schema_id}@"
                f"v{contract.schema_ref.version} not found"
            ) from exc

        # 5. invoke validator exactly once
        outcome = validator.validate(candidate.payload, contract)

        validated_at = self._now()
        validation_id = self._validation_id_factory()

        if outcome.valid:
            result_id = self._result_id_factory()
            validation = OutputValidationResult(
                validation_id=validation_id,
                candidate_id=candidate.candidate_id,
                project_id=candidate.project_id,
                branch_id=candidate.branch_id,
                state_revision=candidate.state_revision,
                action_id=candidate.action_id,
                cognitive_mode=candidate.cognitive_mode,
                prompt_package_id=candidate.prompt_package_id,
                output_contract_id=contract.contract_id,
                output_contract_version=contract.version,
                schema_ref=contract.schema_ref,
                status=OutputValidationStatus.VALID,
                issues=(),
                cognitive_result_id=result_id,
                validated_at=validated_at,
            )
            envelope = CognitiveResultEnvelope(
                result_id=result_id,
                candidate_id=candidate.candidate_id,
                validation_id=validation_id,
                project_id=candidate.project_id,
                branch_id=candidate.branch_id,
                state_revision=candidate.state_revision,
                action_id=candidate.action_id,
                cognitive_mode=candidate.cognitive_mode,
                prompt_package_id=candidate.prompt_package_id,
                output_contract_id=contract.contract_id,
                output_contract_version=contract.version,
                schema_ref=contract.schema_ref,
                payload=outcome.normalized_payload,
                provider=candidate.provider,
                model_identifier=candidate.model_identifier,
                validated_at=validated_at,
            )
            # Logical atomicity: save the cognitive result FIRST so a failure
            # there never leaves a VALID validation without its result.
            self._result_store.save(envelope)
            self._validation_store.save(validation)
            return validation

        validation = OutputValidationResult(
            validation_id=validation_id,
            candidate_id=candidate.candidate_id,
            project_id=candidate.project_id,
            branch_id=candidate.branch_id,
            state_revision=candidate.state_revision,
            action_id=candidate.action_id,
            cognitive_mode=candidate.cognitive_mode,
            prompt_package_id=candidate.prompt_package_id,
            output_contract_id=contract.contract_id,
            output_contract_version=contract.version,
            schema_ref=contract.schema_ref,
            status=OutputValidationStatus.INVALID,
            issues=outcome.issues,
            cognitive_result_id=None,
            validated_at=validated_at,
        )
        self._validation_store.save(validation)
        return validation

    @staticmethod
    def _check_consistency(candidate: StructuredOutputCandidate, package: PromptPackage) -> None:
        if candidate.project_id != package.project_id:
            raise OutputCandidateMismatchError("project mismatch")
        if candidate.branch_id != package.branch_id:
            raise OutputCandidateMismatchError("branch mismatch")
        if candidate.state_revision != package.state_revision:
            raise OutputCandidateMismatchError("state_revision mismatch")
        if candidate.action_id != package.action_id:
            raise OutputCandidateMismatchError("action_id mismatch")
        if candidate.cognitive_mode != package.cognitive_mode:
            raise OutputCandidateMismatchError("cognitive_mode mismatch")
        if candidate.prompt_package_id != package.package_id:
            raise OutputCandidateMismatchError("prompt package id mismatch")
        if candidate.output_contract_id != package.output_contract_id:
            raise OutputCandidateMismatchError("output contract id mismatch")
        if candidate.output_contract_version != package.output_contract_version:
            raise OutputCandidateMismatchError("output contract version mismatch")


def _default_validation_id() -> OutputValidationId:
    return OutputValidationId(default_id())


def _default_result_id() -> CognitiveResultId:
    return CognitiveResultId(default_id())


__all__ = ["OutputValidationEngine"]
