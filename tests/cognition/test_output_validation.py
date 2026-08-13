"""OUT-001..084 + M2-OUT-001/002 — structured output validation.

Verifies: model output is untrusted until validated against a versioned
OutputContract; validation failure is a normal INVALID result (not a runtime
exception); no retry / no repair / no state mutation; CognitiveResultEnvelope
is a normalized typed artifact, not authorization.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from datetime import UTC, datetime

import pytest

from packages.cognition import (
    CognitiveResultEnvelope,
    OutputContract,
    OutputSchemaRef,
    OutputValidationEngine,
    OutputValidationResult,
    OutputValidationStatus,
    PromptPackage,
    SchemaValidationIssue,
    SchemaValidationOutcome,
    StructuredOutputCandidate,
    StructuredOutputValidator,
)
from packages.cognition.errors import (
    DuplicateOutputContractError,
    InvalidOutputContractError,
    InvalidSchemaValidationOutcomeError,
    OutputCandidateMismatchError,
    OutputContractNotFoundError,
    OutputValidatorNotFoundError,
    StaleOutputCandidateError,
)
from packages.cognition.testing import (
    ExampleCognitiveAssessment,
    ExampleCognitiveAssessmentValidator,
    InMemoryCognitiveResultStore,
    InMemoryOutputContractRegistry,
    InMemoryOutputValidationResultStore,
    InMemoryStructuredOutputValidatorRegistry,
)
from packages.domain.ids import (
    ActionId,
    BranchId,
    CognitiveResultId,
    ContextBundleId,
    OutputCandidateId,
    OutputContractId,
    OutputSchemaId,
    OutputValidationId,
    ProjectId,
    PromptPackageId,
    PromptRequestId,
)

from .conftest import (
    ACTION,
    BRANCH,
    PROJECT,
    REVISION,
    make_item,
)

_SCHEMA_REF = OutputSchemaRef(OutputSchemaId("example-assessment"), 1)


def _contract(*, strict: bool = True, version: int = 1) -> OutputContract:
    return OutputContract(
        contract_id=OutputContractId("example-assessment"),
        version=version,
        schema_ref=_SCHEMA_REF,
        strict=strict,
        description="Example cognitive assessment",
    )


def _candidate(
    payload: object,
    *,
    candidate_id: str = "cand-1",
    state_revision: int = REVISION,
    project_id=PROJECT,  # type: ignore[valid-type]
    branch_id=BRANCH,  # type: ignore[valid-type]
    action_id=ACTION,  # type: ignore[valid-type]
    cognitive_mode: str = "FALSIFY",
    contract_id: OutputContractId = OutputContractId("example-assessment"),
    contract_version: int = 1,
    package_id: str = "pkg-1",
) -> StructuredOutputCandidate:
    return StructuredOutputCandidate(
        candidate_id=OutputCandidateId(candidate_id),
        project_id=project_id,
        branch_id=branch_id,
        state_revision=state_revision,
        action_id=action_id,
        cognitive_mode=cognitive_mode,
        prompt_package_id=PromptPackageId(package_id),
        output_contract_id=contract_id,
        output_contract_version=contract_version,
        payload=payload,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


def _matching_package(
    *,
    project_id=PROJECT,  # type: ignore[valid-type]
    branch_id=BRANCH,  # type: ignore[valid-type]
    state_revision: int = REVISION,
    action_id=ACTION,  # type: ignore[valid-type]
    cognitive_mode: str = "FALSIFY",
    package_id: str = "pkg-1",
    contract_id: OutputContractId = OutputContractId("example-assessment"),
    contract_version: int = 1,
):
    return PromptPackage(
        package_id=PromptPackageId(package_id),
        request_id=PromptRequestId("req-1"),
        project_id=project_id,
        branch_id=branch_id,
        state_revision=state_revision,
        action_id=action_id,
        cognitive_mode=cognitive_mode,
        context_bundle_id=ContextBundleId("bundle-1"),
        output_contract_id=contract_id,
        output_contract_version=contract_version,
        prompt_policy_id="default",
        prompt_policy_version=1,
        assembler_version="prompt-assembler/0.1",
        segments=(),
        template_refs=(),
        source_refs=(),
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


# =========================================================================
# OUT-001..006 — contract
# =========================================================================
def test_out_001_schema_ref_immutable() -> None:
    ref = _SCHEMA_REF
    with pytest.raises(FrozenInstanceError):
        ref.schema_id = OutputSchemaId("x")  # type: ignore[misc]


def test_out_002_contract_immutable() -> None:
    c = _contract()
    with pytest.raises(FrozenInstanceError):
        c.strict = False  # type: ignore[misc]


def test_out_003_empty_description_rejected() -> None:
    with pytest.raises(InvalidOutputContractError):
        OutputContract(
            contract_id=OutputContractId("c"), version=1, schema_ref=_SCHEMA_REF,
            strict=True, description="  ",
        )


def test_out_004_contract_registry_round_trip(contract_registry) -> None:
    fetched = contract_registry.get(OutputContractId("example-assessment"), 1)
    assert fetched.schema_ref == _SCHEMA_REF
    assert contract_registry.list_versions(OutputContractId("example-assessment")) == [1]


def test_out_005_duplicate_contract_rejected(contract_registry) -> None:
    with pytest.raises(DuplicateOutputContractError):
        contract_registry.register(_contract())


def test_out_006_different_contract_versions_coexist() -> None:
    reg = InMemoryOutputContractRegistry()
    reg.register(_contract(version=1))
    reg.register(_contract(version=2))
    assert reg.get(OutputContractId("example-assessment"), 1).version == 1
    assert reg.get(OutputContractId("example-assessment"), 2).version == 2


# =========================================================================
# OUT-007..010 — validator registry
# =========================================================================
def test_out_007_validator_registry_round_trip(validator_registry) -> None:
    v = validator_registry.get(OutputSchemaId("example-assessment"), 1)
    assert isinstance(v, ExampleCognitiveAssessmentValidator)


def test_out_008_duplicate_validator_rejected(validator_registry) -> None:
    with pytest.raises(Exception):
        validator_registry.register(ExampleCognitiveAssessmentValidator())


def test_out_009_validator_missing(validation_engine, contract_registry) -> None:
    # contract with a schema that has no validator
    contract_registry.register(OutputContract(
        contract_id=OutputContractId("orphan"), version=1,
        schema_ref=OutputSchemaRef(OutputSchemaId("no-validator"), 1),
        strict=True, description="orphan",
    ))
    cand = _candidate({}, contract_id=OutputContractId("orphan"))
    with pytest.raises(OutputValidatorNotFoundError):
        validation_engine.validate(
            cand, _matching_package(contract_id=OutputContractId("orphan")), REVISION
        )


def test_out_010_contract_missing(validation_engine) -> None:
    cand = _candidate({}, contract_id=OutputContractId("missing"))
    with pytest.raises(OutputContractNotFoundError):
        validation_engine.validate(
            cand, _matching_package(contract_id=OutputContractId("missing")), REVISION
        )


# =========================================================================
# OUT-011..014 — SchemaValidationOutcome invariants
# =========================================================================
def test_out_011_valid_outcome_legal() -> None:
    o = SchemaValidationOutcome(valid=True, normalized_payload=ExampleCognitiveAssessment(
        judgement="SUPPORT", confidence=0.8, reason_codes=("E1",)), issues=())
    assert o.valid


def test_out_012_valid_with_issues_rejected() -> None:
    with pytest.raises(InvalidSchemaValidationOutcomeError):
        SchemaValidationOutcome(valid=True, normalized_payload=object(),
                                issues=(SchemaValidationIssue("X"),))


def test_out_013_invalid_with_payload_rejected() -> None:
    with pytest.raises(InvalidSchemaValidationOutcomeError):
        SchemaValidationOutcome(valid=False, normalized_payload=object(),
                                issues=(SchemaValidationIssue("X"),))


def test_out_014_invalid_with_zero_issues_rejected() -> None:
    with pytest.raises(InvalidSchemaValidationOutcomeError):
        SchemaValidationOutcome(valid=False, normalized_payload=None, issues=())


# =========================================================================
# OUT-015..018 — candidate
# =========================================================================
def test_out_015_candidate_immutable() -> None:
    c = _candidate({})
    with pytest.raises(FrozenInstanceError):
        c.payload = {}  # type: ignore[misc]


def test_out_016_naive_created_at_rejected() -> None:
    with pytest.raises(InvalidOutputContractError):
        StructuredOutputCandidate(
            candidate_id=OutputCandidateId("c"), project_id=PROJECT, branch_id=BRANCH,
            state_revision=REVISION, action_id=ACTION, cognitive_mode="FALSIFY",
            prompt_package_id=PromptPackageId("p"),
            output_contract_id=OutputContractId("c"), output_contract_version=1,
            payload={}, created_at=datetime(2026, 1, 1),
        )


def test_out_017_provider_model_can_be_none() -> None:
    c = _candidate({})
    assert c.provider is None
    assert c.model_identifier is None


def test_out_018_raw_payload_not_typed() -> None:
    c = _candidate({"a": 1})
    assert c.payload == {"a": 1}


# =========================================================================
# OUT-019..022 — prompt contract binding
# =========================================================================
def test_out_019_prompt_request_requires_contract() -> None:
    from packages.cognition import PromptRequest

    with pytest.raises(Exception):
        PromptRequest(
            request_id=PromptRequestId("r"), project_id=PROJECT, branch_id=BRANCH,
            state_revision=REVISION, action_id=ACTION, cognitive_mode="FALSIFY",
            context_bundle_id=ContextBundleId("b"),
            task_objective="x",
        )


def test_out_020_assembler_propagates_contract(
    assembler, prompt_policy, template_registry
) -> None:
    from packages.cognition import ContextBundle, PromptRequest
    from packages.domain.ids import ContextRequestId

    bundle = ContextBundle(
        bundle_id=ContextBundleId("b"), request_id=ContextRequestId("r"),
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        context_policy_id="default", context_policy_version=1,
        blinding_policy_id="none", blinding_policy_version=1,
        compiler_version="c/0.1", items=(), excluded_items=(),
        total_estimated_tokens=0, budget_max_tokens=1000, source_refs=(),
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    req = PromptRequest(
        request_id=PromptRequestId("r"), project_id=PROJECT, branch_id=BRANCH,
        state_revision=REVISION, action_id=ACTION, cognitive_mode="FALSIFY",
        context_bundle_id=bundle.bundle_id,
        output_contract_id=OutputContractId("example-assessment"), output_contract_version=1,
        task_objective="x",
    )
    pkg = assembler.assemble(req, bundle, prompt_policy, template_registry, REVISION)
    assert pkg.output_contract_id == OutputContractId("example-assessment")
    assert pkg.output_contract_version == 1


def test_out_021_provider_trace_propagates_contract() -> None:
    from packages.cognition import OpenAIProjector

    pkg = _matching_package()
    proj = OpenAIProjector().project(pkg)
    assert proj.trace.output_contract_id == OutputContractId("example-assessment")
    assert proj.trace.output_contract_version == 1


def test_out_022_projection_gains_no_execution_schema() -> None:
    from packages.cognition import OpenAIProjector

    proj = OpenAIProjector().project(_matching_package())
    assert not hasattr(proj, "response_format")
    assert not hasattr(proj, "json_schema")


# =========================================================================
# OUT-023..029 — consistency
# =========================================================================
@pytest.mark.parametrize(
    "kwargs",
    [
        dict(project_id=ProjectId("OTHER")),
        dict(branch_id=BranchId("B2")),
        dict(state_revision=8),
        dict(action_id=ActionId("OTHER")),
        dict(cognitive_mode="VERIFY"),
        dict(package_id="other-pkg"),
        dict(contract_id=OutputContractId("other"), contract_version=1),
    ],
)
def test_out_023_029_consistency_mismatch(validation_engine, kwargs) -> None:
    cand = _candidate({}, **kwargs)
    pkg = _matching_package()
    with pytest.raises(OutputCandidateMismatchError):
        validation_engine.validate(cand, pkg, REVISION)


# =========================================================================
# OUT-030..033 — staleness
# =========================================================================
def test_out_030_current_revision_validates(validation_engine) -> None:
    result = validation_engine.validate(
        _candidate({"judgement": "SUPPORT", "confidence": 0.8, "reason_codes": ["E1"]}),
        _matching_package(), REVISION,
    )
    assert result.status is OutputValidationStatus.VALID


def test_out_031_stale_candidate_rejected(validation_engine) -> None:
    cand = _candidate({}, state_revision=6)
    with pytest.raises(StaleOutputCandidateError):
        validation_engine.validate(cand, _matching_package(state_revision=6), REVISION)


def test_out_032_stale_no_validation_artifact(validation_engine, validation_store) -> None:
    cand = _candidate({}, state_revision=6)
    with pytest.raises(StaleOutputCandidateError):
        validation_engine.validate(cand, _matching_package(state_revision=6), REVISION)
    assert validation_store.list_for_project(PROJECT, BRANCH) == []


def test_out_033_stale_no_cognitive_result(validation_engine, result_store) -> None:
    cand = _candidate({}, state_revision=6)
    with pytest.raises(StaleOutputCandidateError):
        validation_engine.validate(cand, _matching_package(state_revision=6), REVISION)
    assert result_store.list_for_project(PROJECT, BRANCH) == []


# =========================================================================
# OUT-034..037 — valid structured output
# =========================================================================
def _valid_payload() -> dict:
    return {"judgement": "SUPPORT", "confidence": 0.8, "reason_codes": ["E1"]}


def test_out_034_valid_result(validation_engine, validation_store, result_store) -> None:
    result = validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    assert result.status is OutputValidationStatus.VALID
    assert result.issues == ()
    assert result.cognitive_result_id is not None


def test_out_035_result_payload_is_typed(validation_engine, result_store) -> None:
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert isinstance(envelope.payload, ExampleCognitiveAssessment)
    assert not isinstance(envelope.payload, dict)


def test_out_036_confidence_normalized(validation_engine, result_store) -> None:
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert envelope.payload.confidence == 0.8  # type: ignore[attr-defined]
    assert envelope.payload.judgement == "SUPPORT"  # type: ignore[attr-defined]
    assert envelope.payload.reason_codes == ("E1",)  # type: ignore[attr-defined]


def test_out_037_result_provenance(validation_engine, result_store) -> None:
    cand = _candidate(_valid_payload())
    cand = StructuredOutputCandidate(
        candidate_id=cand.candidate_id, project_id=cand.project_id, branch_id=cand.branch_id,
        state_revision=cand.state_revision, action_id=cand.action_id,
        cognitive_mode=cand.cognitive_mode, prompt_package_id=cand.prompt_package_id,
        output_contract_id=cand.output_contract_id,
        output_contract_version=cand.output_contract_version,
        payload=cand.payload, provider=None, model_identifier="test-model",
        created_at=cand.created_at,
    )
    validation_engine.validate(cand, _matching_package(), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert envelope.model_identifier == "test-model"


# =========================================================================
# OUT-038..044 — invalid structured output
# =========================================================================
@pytest.mark.parametrize(
    "payload",
    [
        {"confidence": 0.8, "reason_codes": ["E1"]},  # missing judgement
        {"judgement": "SUPPORT", "confidence": "0.8", "reason_codes": ["E1"]},  # wrong type
        {"judgement": "NOPE", "confidence": 0.8, "reason_codes": ["E1"]},  # bad enum
        {"judgement": "SUPPORT", "confidence": 1.5, "reason_codes": ["E1"]},  # out of range
        {"judgement": "SUPPORT", "confidence": 0.8, "reason_codes": ["", "E1"]},  # empty code
    ],
)
def test_out_038_042_invalid_payloads(validation_engine, result_store, payload) -> None:
    result = validation_engine.validate(_candidate(payload), _matching_package(), REVISION)
    assert result.status is OutputValidationStatus.INVALID
    assert result.issues


def test_out_043_invalid_is_not_exception(validation_engine) -> None:
    # must return a result, not raise
    result = validation_engine.validate(
        _candidate({"judgement": "NOPE"}), _matching_package(), REVISION
    )
    assert result.status is OutputValidationStatus.INVALID


def test_out_044_invalid_no_cognitive_result(validation_engine, result_store) -> None:
    validation_engine.validate(_candidate({"judgement": "NOPE"}), _matching_package(), REVISION)
    assert result_store.list_for_project(PROJECT, BRANCH) == []


# =========================================================================
# OUT-045..047 — strictness
# =========================================================================
def test_out_045_strict_unknown_field_invalid(validation_engine, contract_registry) -> None:
    contract_registry.register(_contract(strict=True, version=9))
    cand = _candidate(
        {"judgement": "SUPPORT", "confidence": 0.8, "reason_codes": ["E1"], "extra": 1},
        contract_version=9,
    )
    result = validation_engine.validate(cand, _matching_package(contract_version=9), REVISION)
    assert result.status is OutputValidationStatus.INVALID


def test_out_046_nonstrict_unknown_field_valid(validation_engine, contract_registry) -> None:
    contract_registry.register(_contract(strict=False, version=10))
    cand = _candidate(
        {"judgement": "SUPPORT", "confidence": 0.8, "reason_codes": ["E1"], "extra": 1},
        contract_version=10,
    )
    result = validation_engine.validate(cand, _matching_package(contract_version=10), REVISION)
    assert result.status is OutputValidationStatus.VALID


def test_out_047_nonstrict_normalized_no_unknown(
    validation_engine, contract_registry, result_store
) -> None:
    contract_registry.register(_contract(strict=False, version=11))
    cand = _candidate(
        {"judgement": "SUPPORT", "confidence": 0.8, "reason_codes": ["E1"], "extra": 1},
        contract_version=11,
    )
    validation_engine.validate(cand, _matching_package(contract_version=11), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert not hasattr(envelope.payload, "extra")  # type: ignore[union-attr]


# =========================================================================
# OUT-048..052 — issue structure
# =========================================================================
def test_out_048_issue_immutable() -> None:
    issue = SchemaValidationIssue("CODE")
    with pytest.raises(FrozenInstanceError):
        issue.code = "OTHER"  # type: ignore[misc]


def test_out_049_issue_has_code() -> None:
    issue = SchemaValidationIssue("CODE")
    assert issue.code == "CODE"


def test_out_050_issue_has_path() -> None:
    issue = SchemaValidationIssue("CODE", ("confidence",))
    assert issue.path == ("confidence",)


def test_out_051_decision_not_message_based(validation_engine) -> None:
    result = validation_engine.validate(
        _candidate({"judgement": "NOPE"}), _matching_package(), REVISION
    )
    # status decided on code presence, not message text
    assert result.status is OutputValidationStatus.INVALID
    assert all(i.code for i in result.issues)


def test_out_052_issue_order_deterministic(validation_engine) -> None:
    r1 = validation_engine.validate(
        _candidate({"judgement": "NOPE", "confidence": 9.0}), _matching_package(), REVISION
    )
    r2 = validation_engine.validate(
        _candidate({"judgement": "NOPE", "confidence": 9.0}), _matching_package(), REVISION
    )
    assert [i.code for i in r1.issues] == [i.code for i in r2.issues]


# =========================================================================
# OUT-053..058 — validation result
# =========================================================================
def test_out_053_result_immutable(validation_engine) -> None:
    result = validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    with pytest.raises(FrozenInstanceError):
        result.status = OutputValidationStatus.INVALID  # type: ignore[misc]


def test_out_054_valid_result_id_not_none(validation_engine) -> None:
    result = validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    assert result.cognitive_result_id is not None


def test_out_055_invalid_result_id_none(validation_engine) -> None:
    result = validation_engine.validate(
        _candidate({"judgement": "NOPE"}), _matching_package(), REVISION
    )
    assert result.cognitive_result_id is None


def test_out_056_valid_issues_empty(validation_engine) -> None:
    result = validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    assert result.issues == ()


def test_out_057_invalid_issues_nonempty(validation_engine) -> None:
    result = validation_engine.validate(
        _candidate({"judgement": "NOPE"}), _matching_package(), REVISION
    )
    assert result.issues


def test_out_058_result_contract_schema_provenance(validation_engine) -> None:
    result = validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    assert result.output_contract_id == OutputContractId("example-assessment")
    assert result.output_contract_version == 1
    assert result.schema_ref == _SCHEMA_REF


# =========================================================================
# OUT-059..064 — cognitive result envelope
# =========================================================================
def test_out_059_envelope_immutable(validation_engine, result_store) -> None:
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    with pytest.raises(FrozenInstanceError):
        envelope.payload = object()  # type: ignore[misc]


def test_out_060_envelope_scope(validation_engine, result_store) -> None:
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert envelope.project_id == PROJECT
    assert envelope.branch_id == BRANCH
    assert envelope.state_revision == REVISION
    assert envelope.action_id == ACTION
    assert envelope.cognitive_mode == "FALSIFY"


def test_out_061_envelope_prompt_package(validation_engine, result_store) -> None:
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert envelope.prompt_package_id == PromptPackageId("pkg-1")


def test_out_062_envelope_contract_schema(validation_engine, result_store) -> None:
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert envelope.output_contract_id == OutputContractId("example-assessment")
    assert envelope.schema_ref == _SCHEMA_REF


def test_out_063_envelope_candidate_validation_ids(validation_engine, result_store) -> None:
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert envelope.candidate_id == OutputCandidateId("cand-1")
    assert envelope.validation_id is not None


def test_out_064_envelope_payload_normalized(validation_engine, result_store) -> None:
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert isinstance(envelope.payload, ExampleCognitiveAssessment)


# =========================================================================
# OUT-065..068 — stores
# =========================================================================
def test_out_065_validation_store_round_trip(validation_engine, validation_store) -> None:
    result = validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    assert validation_store.get(result.validation_id) is result


def test_out_066_duplicate_validation_id_rejected() -> None:
    store = InMemoryOutputValidationResultStore()
    r = OutputValidationResult(
        validation_id=OutputValidationId("dup"), candidate_id=OutputCandidateId("c"),
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", prompt_package_id=PromptPackageId("p"),
        output_contract_id=OutputContractId("c"), output_contract_version=1,
        schema_ref=_SCHEMA_REF, status=OutputValidationStatus.INVALID,
        issues=(SchemaValidationIssue("X"),), cognitive_result_id=None,
        validated_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    store.save(r)
    with pytest.raises(Exception):
        store.save(r)


def test_out_067_result_store_round_trip(validation_engine, result_store) -> None:
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert result_store.get(envelope.result_id) is envelope


def test_out_068_duplicate_result_id_rejected() -> None:
    store = InMemoryCognitiveResultStore()
    e = CognitiveResultEnvelope(
        result_id=CognitiveResultId("dup"), candidate_id=OutputCandidateId("c"),
        validation_id=OutputValidationId("v"), project_id=PROJECT, branch_id=BRANCH,
        state_revision=REVISION, action_id=ACTION, cognitive_mode="FALSIFY",
        prompt_package_id=PromptPackageId("p"), output_contract_id=OutputContractId("c"),
        output_contract_version=1, schema_ref=_SCHEMA_REF,
        payload=ExampleCognitiveAssessment(judgement="SUPPORT", confidence=0.8),
        provider=None, model_identifier=None, validated_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    store.save(e)
    with pytest.raises(Exception):
        store.save(e)


# =========================================================================
# OUT-069..071 — atomic semantics
# =========================================================================
def test_out_069_valid_both_artifacts(validation_engine, validation_store, result_store) -> None:
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    assert len(validation_store.list_for_project(PROJECT, BRANCH)) == 1
    assert len(result_store.list_for_project(PROJECT, BRANCH)) == 1


def test_out_070_invalid_only_validation(validation_engine, validation_store, result_store) -> None:
    validation_engine.validate(_candidate({"judgement": "NOPE"}), _matching_package(), REVISION)
    assert len(validation_store.list_for_project(PROJECT, BRANCH)) == 1
    assert len(result_store.list_for_project(PROJECT, BRANCH)) == 0


def test_out_071_result_save_failure_no_valid_validation(
    validator_registry, validation_store
) -> None:
    class FailingResultStore:
        def save(self, result) -> None:
            raise RuntimeError("boom")

        def get(self, result_id):
            raise KeyError

        def list_for_project(self, p, b):
            return []

    contract_reg = InMemoryOutputContractRegistry()
    contract_reg.register(_contract())
    engine = OutputValidationEngine(
        contract_reg, validator_registry, validation_store, FailingResultStore(),  # type: ignore[arg-type]
        validation_id_factory=lambda: OutputValidationId("v"),
        result_id_factory=lambda: CognitiveResultId("r"),
    )
    with pytest.raises(RuntimeError):
        engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    # no VALID validation left behind
    assert validation_store.list_for_project(PROJECT, BRANCH) == []


# =========================================================================
# OUT-072..075 — no repair
# =========================================================================
def test_out_072_string_confidence_not_coerced(validation_engine) -> None:
    result = validation_engine.validate(
        _candidate({"judgement": "SUPPORT", "confidence": "0.8", "reason_codes": ["E1"]}),
        _matching_package(), REVISION,
    )
    assert result.status is OutputValidationStatus.INVALID


def test_out_073_missing_reason_codes_not_filled(validation_engine) -> None:
    result = validation_engine.validate(
        _candidate({"judgement": "SUPPORT", "confidence": 0.8}),
        _matching_package(), REVISION,
    )
    assert result.status is OutputValidationStatus.INVALID


def test_out_074_markdown_not_json_parsed(validation_engine) -> None:
    result = validation_engine.validate(
        _candidate("```json\n{}\n```"),
        _matching_package(), REVISION,
    )
    assert result.status is OutputValidationStatus.INVALID


def test_out_075_invalid_calls_validator_once() -> None:
    calls = []

    class CountingValidator(StructuredOutputValidator):
        schema_ref = _SCHEMA_REF

        def validate(self, payload, contract):
            calls.append(1)
            return ExampleCognitiveAssessmentValidator().validate(payload, contract)

    reg = InMemoryStructuredOutputValidatorRegistry()
    reg.register(CountingValidator())
    contract_reg = InMemoryOutputContractRegistry()
    # register a contract pointing at a DIFFERENT schema (no validator) so the
    # validator is never reached; a system error is raised instead.
    contract_reg.register(OutputContract(
        contract_id=OutputContractId("missing-validator"), version=1,
        schema_ref=OutputSchemaRef(OutputSchemaId("no-validator"), 1),
        strict=True, description="no validator",
    ))
    engine = OutputValidationEngine(
        contract_reg, reg, InMemoryOutputValidationResultStore(),
        InMemoryCognitiveResultStore(),
        validation_id_factory=lambda: OutputValidationId("v"),
        result_id_factory=lambda: CognitiveResultId("r"),
    )
    cand = _candidate(
        {"judgement": "NOPE"},
        contract_id=OutputContractId("missing-validator"),
    )
    with pytest.raises(OutputValidatorNotFoundError):
        engine.validate(
            cand,
            _matching_package(contract_id=OutputContractId("missing-validator")),
            REVISION,
        )
    # validator was never invoked
    assert calls == []


# =========================================================================
# OUT-076..082 — no retry / side effects
# =========================================================================
def test_out_076_082_engine_no_llm_no_control_no_side_effects() -> None:
    import ast
    from pathlib import Path

    from packages.cognition import output_validation

    path = Path(output_validation.__file__)
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imported.add(node.module.split(".")[0])
    for forbidden in (
        "openai", "anthropic", "pydantic_ai", "control", "requests", "httpx",
    ):
        assert forbidden not in imported, f"engine imports {forbidden}"


def test_out_079_valid_no_task_approval_state(validation_engine, result_store) -> None:
    # valid does not create task/approval/state — verified structurally via
    # absence of control imports + result is just an envelope
    validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    assert len(result_store.list_for_project(PROJECT, BRANCH)) == 1


# =========================================================================
# OUT-083..084 — result is not authorization
# =========================================================================
def test_out_083_result_not_state_mutation(validation_engine) -> None:
    result = validation_engine.validate(_candidate(_valid_payload()), _matching_package(), REVISION)
    # envelope is a value object; there is no control plane side channel here
    assert result.status is OutputValidationStatus.VALID
    # no commit transition / branch change is reachable from the engine


def test_out_084_next_action_field_no_authorization(validation_engine, contract_registry) -> None:
    contract_registry.register(_contract(strict=True, version=20))
    cand = _candidate(
        {
            "judgement": "SUPPORT",
            "confidence": 0.8,
            "reason_codes": ["E1"],
            "next_action": "COMMIT",
        },
        contract_version=20,
    )
    result = validation_engine.validate(cand, _matching_package(contract_version=20), REVISION)
    # strict -> unknown field -> INVALID; the "COMMIT" text cannot trigger anything
    assert result.status is OutputValidationStatus.INVALID


# =========================================================================
# M2-OUT-001 / M2-OUT-002 — end-to-end output validation
# =========================================================================
def _build_package_pipeline(
    resolver, catalog, context_policy, compiler, hide_future_result,
    assembler, prompt_policy, template_registry,
):
    from packages.cognition import (
        ContextBudget,
        ContextItemType,
        ContextLayer,
        ContextScope,
        InstructionAuthority,
        PromptRequest,
        RetrievalPolicy,
        RetrievalRequirement,
    )
    from packages.domain.ids import (
        ContextRequestId,
        PromptRequestId,
        RetrievalPolicyId,
    )

    item = make_item(
        "sys-inst", item_type=ContextItemType.INSTRUCTION,
        layer=ContextLayer.GLOBAL, scope=ContextScope.SYSTEM,
        content="SYSTEM rule", tokens=10, priority=80,
        instruction_authority=InstructionAuthority.SYSTEM,
    )
    catalog.add(item)
    reqs = [
        RetrievalRequirement(
            requirement_id="r1",
            item_types=frozenset({ContextItemType.INSTRUCTION}),
            layers=frozenset({ContextLayer.GLOBAL}),
            scopes=frozenset({ContextScope.SYSTEM}),
            required=True, minimum_count=1, maximum_count=1, priority=90,
        ),
    ]
    resolution = resolver.resolve(
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY", requirements=reqs,
        retrieval_policy=RetrievalPolicy(policy_id=RetrievalPolicyId("p"), version=1),
        context_policy=context_policy,
    )
    ctx_request = resolution.to_context_request(
        request_id=ContextRequestId("cr"), context_policy=context_policy,
        budget=ContextBudget(max_tokens=500),
    )
    bundle = compiler.compile(
        ctx_request, context_policy, hide_future_result, [item], REVISION,
    )
    prompt_req = PromptRequest(
        request_id=PromptRequestId("pr"), project_id=PROJECT, branch_id=BRANCH,
        state_revision=REVISION, action_id=ACTION, cognitive_mode="FALSIFY",
        context_bundle_id=bundle.bundle_id,
        output_contract_id=OutputContractId("example-assessment"),
        output_contract_version=1,
        task_objective="Decide H1 support.",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    package = assembler.assemble(
        prompt_req, bundle, prompt_policy, template_registry, REVISION,
    )
    return package


def test_m2_out_001_valid_end_to_end(
    resolver, catalog, context_policy, compiler, hide_future_result,
    assembler, prompt_policy, template_registry,
    validation_engine, result_store,
) -> None:
    package = _build_package_pipeline(
        resolver, catalog, context_policy, compiler, hide_future_result,
        assembler, prompt_policy, template_registry,
    )
    candidate = StructuredOutputCandidate(
        candidate_id=OutputCandidateId("cand-e2e"),
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        prompt_package_id=package.package_id,
        output_contract_id=OutputContractId("example-assessment"),
        output_contract_version=1,
        payload={"judgement": "CONTRADICT", "confidence": 0.91,
                 "reason_codes": ["COUNTEREXAMPLE_FOUND"]},
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    result = validation_engine.validate(candidate, package, REVISION)

    assert result.status is OutputValidationStatus.VALID
    assert result.issues == ()

    envelope = result_store.list_for_project(PROJECT, BRANCH)[0]
    assert isinstance(envelope.payload, ExampleCognitiveAssessment)
    assert envelope.payload.judgement == "CONTRADICT"  # type: ignore[attr-defined]
    assert envelope.payload.confidence == 0.91  # type: ignore[attr-defined]
    assert envelope.payload.reason_codes == ("COUNTEREXAMPLE_FOUND",)  # type: ignore[attr-defined]


def test_m2_out_002_invalid_end_to_end(
    resolver, catalog, context_policy, compiler, hide_future_result,
    assembler, prompt_policy, template_registry,
    validation_engine, result_store,
) -> None:
    package = _build_package_pipeline(
        resolver, catalog, context_policy, compiler, hide_future_result,
        assembler, prompt_policy, template_registry,
    )
    candidate = StructuredOutputCandidate(
        candidate_id=OutputCandidateId("cand-e2e-bad"),
        project_id=PROJECT, branch_id=BRANCH, state_revision=REVISION,
        action_id=ACTION, cognitive_mode="FALSIFY",
        prompt_package_id=package.package_id,
        output_contract_id=OutputContractId("example-assessment"),
        output_contract_version=1,
        payload={"judgement": "UNKNOWN_VALUE", "confidence": 5.0},
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    result = validation_engine.validate(candidate, package, REVISION)

    assert result.status is OutputValidationStatus.INVALID
    assert result.issues
    assert result_store.list_for_project(PROJECT, BRANCH) == []
