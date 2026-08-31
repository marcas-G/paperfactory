"""STEP-015 — real-LLM smoke test against DeepSeek (OpenAI-compatible API).

OPT-IN: skipped unless ``DEEPSEEK_API_KEY`` is exported. Never committed,
never logged. Uses ONLY stdlib (urllib) — no SDK dependency is added.

    export DEEPSEEK_API_KEY=sk-...
    uv run pytest tests/integration/test_deepseek_smoke.py -v

The model is a v4-flash class model (NOT pro), confirmed against
GET /models at runtime.
"""

from __future__ import annotations

import json
import os
import urllib.request

import pytest

# Reuse the deterministic slice stack builder. Fixtures (clock/seq/snapshot/
# definition) resolve through pytest's fixture lookup into the slice module.
import tests.integration.test_vertical_slice as _slice
from packages.domain.ids import (
    ProviderExecutionResponseId,
    RuntimeArtifactId,
)
from packages.runtime.contracts import RuntimeFailure, RuntimeFailureCategory
from packages.runtime.provider import (
    ProviderExecutionOutcome,
    ProviderExecutionOutcomeStatus,
    ProviderExecutionRequest,
    ProviderExecutionResponse,
)
from tests.integration.test_vertical_slice import (  # noqa: F401 — fixture re-export
    clock,
    definition,
    seq,
    snapshot,
)

pytestmark = pytest.mark.skipif(
    not os.environ.get("DEEPSEEK_API_KEY"),
    reason="DEEPSEEK_API_KEY not set — real-provider smoke test is opt-in",
)

_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
_TIMEOUT_SECONDS = 120


def _http_json(url: str, payload: dict, api_key: str) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(  # noqa: S310 — fixed https endpoint, no user input in URL
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8"))


def _resolve_model_id(api_key: str) -> str:
    """Pick a v4-flash class model id from GET /models (never pro)."""
    req = urllib.request.Request(  # noqa: S310
        f"{_BASE_URL}/models",
        headers={"Authorization": f"Bearer {api_key}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
        data = json.loads(resp.read().decode("utf-8"))
    ids = [m.get("id", "") for m in data.get("data", [])]
    flash = [i for i in ids if "flash" in i.lower()]
    assert flash, f"no flash-class model available: {ids}"
    chosen = flash[0]
    assert "pro" not in chosen.lower(), f"refusing pro model: {chosen}"
    return chosen


class DeepSeekProviderExecutor:
    """ProviderExecutionPort adapter over the DeepSeek chat-completions API.

    The prompt package arrives as an OpenAI-compatible projection
    (instructions -> system, input entries -> user turns). Output is coerced
    to JSON — the untrusted payload then faces the SAME OutputContract
    validation as any provider.
    """

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._model: str | None = None

    async def execute(
        self, request: ProviderExecutionRequest
    ) -> ProviderExecutionOutcome:
        projection = request.projected_input
        try:
            if self._model is None:
                self._model = _resolve_model_id(self._api_key)
            messages = [
                {
                    "role": "system",
                    "content": getattr(projection, "instructions", ""),
                },
                {
                    "role": "user",
                    "content": "\n\n".join(
                        entry.rendered_content
                        for entry in getattr(projection, "input", ())
                    )
                    + (
                        "\n\nRespond with ONLY a JSON object with keys "
                        '"judgement" (one of SUPPORT/CONTRADICT/INCONCLUSIVE), '
                        '"confidence" (0..1), "reason_codes" (array of strings). '
                        "No markdown, no prose outside the JSON."
                    ),
                },
            ]
            data = _http_json(
                f"{_BASE_URL}/chat/completions",
                {
                    "model": self._model,
                    "messages": messages,
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                },
                self._api_key,
            )
            content = data["choices"][0]["message"]["content"]
            raw = json.loads(content)
            # Defensive against wrapped/markdown JSON.
            if isinstance(raw, str):
                raw = json.loads(raw)
            return ProviderExecutionOutcome(
                status=ProviderExecutionOutcomeStatus.SUCCEEDED,
                response=ProviderExecutionResponse(
                    response_id=ProviderExecutionResponseId(
                        "resp-deepseek"
                    ),
                    artifact_id=RuntimeArtifactId("art-deepseek"),
                    request_id=request.request_id,
                    session_id=request.session_id,
                    run_id=request.run_id,
                    attempt_id=request.attempt_id,
                    project_id=request.project_id,
                    branch_id=request.branch_id,
                    provider=request.provider,
                    model=request.model,
                    raw_output=raw,
                    created_at=request.created_at,
                ),
            )
        except Exception as exc:  # noqa: BLE001 — mapped to RuntimeFailure below
            return ProviderExecutionOutcome(
                status=ProviderExecutionOutcomeStatus.FAILED,
                failure=RuntimeFailure(
                    category=RuntimeFailureCategory.PROVIDER,
                    code="DEEPSEEK_HTTP_ERROR",
                    message=str(exc)[:500],
                    transient=True,
                ),
            )


def test_deepseek_smoke_full_chain(
    clock,  # noqa: F811 — pytest fixture, shadows the module import on purpose
    seq,  # noqa: F811
    snapshot,  # noqa: F811
    definition,  # noqa: F811
):
    """Real DeepSeek output traverses the ENTIRE governed chain and commits."""
    from packages.control.tasks import TaskStatus
    from packages.domain.enums import TransitionDecision
    from packages.runtime.contracts import RunStatus

    api_key = os.environ["DEEPSEEK_API_KEY"]
    executor, stores = _slice._build_stack(clock, seq, snapshot, definition)
    deepseek = DeepSeekProviderExecutor(api_key)

    record = executor.execute(_slice._make_request(), definition, _slice._binding_spec(), deepseek)

    assert record.run is not None
    assert record.run.status is RunStatus.SUCCEEDED, (
        f"provider failed: {record.run.failure}"
    )
    assert record.validation is not None
    assert record.validation.status.value == "VALID", (
        f"raw output rejected: {getattr(record.validation, 'issues', None)}"
    )
    assert record.transition is not None
    assert record.transition.decision is TransitionDecision.COMMIT
    assert record.task.status is TaskStatus.SUCCEEDED
    assert record.failure is None
    new_state = stores["controller"].get_state(
        _slice._make_request().project_id, _slice._make_request().branch_id
    )
    assert new_state.object_states[_slice._make_request().target_object_id] == "ASSESSED"
    assert stores["state_store"].events()
