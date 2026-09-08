"""RuntimeExecutionCoordinator (STEP-012 §28).

Connects provider execution to the Run/Attempt lifecycle. Validates scope,
persists request/response, calls the executor exactly once, and delegates
terminal transitions to RuntimeRunManager.

NO retry, NO output validation, NO cognition import.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from ..domain.ids import (
    RuntimeEventId,
)
from .contracts import (
    RuntimeFailure,
    RuntimeFailureCategory,
    RuntimeOutputRef,
    RuntimeRun,
)
from .errors import (
    ProviderExecutionInputMismatchError,
    ProviderExecutionScopeError,
)
from .events import RuntimeEvent, RuntimeEventType
from .lifecycle import RuntimeRunManager
from .provider import (
    ProviderExecutionOutcome,
    ProviderExecutionOutcomeStatus,
    ProviderExecutionPort,
    ProviderExecutionRequest,
)
from .store import (
    ProviderExecutionRequestStore,
    ProviderExecutionResponseStore,
    RuntimeEventSink,
)


class RuntimeExecutionCoordinator:
    """Coordinates one provider execution → run/attempt terminal."""

    def __init__(
        self,
        run_manager: RuntimeRunManager,
        request_store: ProviderExecutionRequestStore,
        response_store: ProviderExecutionResponseStore,
        event_sink: RuntimeEventSink,
        *,
        response_id_factory: Callable[[], str] | None = None,
        artifact_id_factory: Callable[[], str] | None = None,
        event_id_factory: Callable[[], str] | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._run_mgr = run_manager
        self._req_store = request_store
        self._resp_store = response_store
        self._sink = event_sink
        import uuid

        self._response_id_factory = response_id_factory or (lambda: uuid.uuid4().hex)
        self._artifact_id_factory = artifact_id_factory or (lambda: uuid.uuid4().hex)
        self._event_id_factory = event_id_factory or (lambda: uuid.uuid4().hex)
        self._now = now or _default_now

    async def execute(
        self,
        request: ProviderExecutionRequest,
        executor: ProviderExecutionPort,
    ) -> tuple[RuntimeRun, ProviderExecutionOutcome]:
        """Execute provider call, transition run/attempt, return outcome."""
        # 1. validate
        run = self._run_mgr.get_run(request.run_id)
        self._validate_scope(request, run)
        active_attempt = self._run_mgr._require_active_attempt(request.run_id)
        if active_attempt.attempt_id != request.attempt_id:
            raise ProviderExecutionScopeError(
                f"attempt mismatch: request={request.attempt_id} active={active_attempt.attempt_id}"
            )
        if request.input_ref != run.input_ref:
            raise ProviderExecutionInputMismatchError(
                "request.input_ref does not match run.input_ref"
            )

        session = self._run_mgr._get_session(run)

        # 2. persist request BEFORE calling executor
        self._req_store.save(request)

        ts = self._now()
        # 3. emit STARTED
        self._emit_provider_event(
            RuntimeEventType.PROVIDER_EXECUTION_STARTED,
            request,
            session,
            ts,
        )

        # 4. call executor exactly once
        try:
            outcome = await executor.execute(request)
        except Exception as exc:
            if isinstance(exc, (KeyboardInterrupt, SystemExit, GeneratorExit)):
                raise
            outcome = ProviderExecutionOutcome(
                status=ProviderExecutionOutcomeStatus.FAILED,
                failure=RuntimeFailure(
                    category=RuntimeFailureCategory.INTERNAL,
                    code="PROVIDER_EXECUTOR_EXCEPTION",
                    message=str(exc),
                    transient=False,
                ),
            )

        # 5. handle outcome
        if outcome.status is ProviderExecutionOutcomeStatus.SUCCEEDED:
            return await self._handle_success(
                request,
                run,
                session,
                outcome,
                ts,
            )
        return await self._handle_failure(
            request,
            run,
            session,
            outcome,
            ts,
        )

    async def _handle_success(
        self,
        request,
        run,
        session,
        outcome,
        ts,  # type: ignore[no-untyped-def]
    ):
        response = outcome.response
        assert response is not None

        # persist response BEFORE marking run success
        try:
            self._resp_store.save(response)
        except Exception:
            # response persistence failure → INTERNAL failure, NOT run success
            failure = RuntimeFailure(
                category=RuntimeFailureCategory.INTERNAL,
                code="PROVIDER_RESPONSE_PERSIST_FAILED",
                message="failed to persist provider response",
                transient=False,
            )
            self._emit_provider_failed(request, session, failure, self._now())
            final_run, _ = self._run_mgr.fail_run(
                request.run_id,
                failure=failure,
            )
            failed_outcome = ProviderExecutionOutcome(
                status=ProviderExecutionOutcomeStatus.FAILED,
                failure=failure,
            )
            return final_run, failed_outcome

        output_ref = RuntimeOutputRef(
            artifact_type="provider_response",
            artifact_id=str(response.artifact_id),
            version="1",
        )
        self._emit_provider_event(
            RuntimeEventType.PROVIDER_EXECUTION_SUCCEEDED,
            request,
            session,
            self._now(),
            response_id=response.response_id,
        )
        final_run, final_attempt = self._run_mgr.succeed_run(
            request.run_id,
            output_ref=output_ref,
        )
        return final_run, outcome

    async def _handle_failure(
        self,
        request,
        run,
        session,
        outcome,
        ts,  # type: ignore[no-untyped-def]
    ):
        failure = outcome.failure
        assert failure is not None
        self._emit_provider_failed(request, session, failure, self._now())
        final_run, _ = self._run_mgr.fail_run(
            request.run_id,
            failure=failure,
        )
        return final_run, outcome

    # --- scope validation ------------------------------------------------
    def _validate_scope(
        self,
        request: ProviderExecutionRequest,
        run: RuntimeRun,
    ) -> None:
        if request.session_id != run.session_id:
            raise ProviderExecutionScopeError("session_id mismatch")
        if request.project_id != run.project_id:
            raise ProviderExecutionScopeError("project_id mismatch")
        if request.branch_id != run.branch_id:
            raise ProviderExecutionScopeError("branch_id mismatch")
        from .contracts import RunStatus

        if run.status is not RunStatus.RUNNING:
            raise ProviderExecutionScopeError(f"run must be RUNNING, got {run.status.value}")

    # --- events ----------------------------------------------------------
    def _emit_provider_event(
        self,
        event_type,
        request,
        session,
        ts,  # type: ignore[no-untyped-def]
        response_id=None,  # type: ignore[no-untyped-def]
    ) -> None:
        self._sink.append(
            RuntimeEvent(
                event_id=RuntimeEventId(self._event_id_factory()),
                event_type=event_type,
                session_id=session.session_id,
                run_id=request.run_id,
                attempt_id=request.attempt_id,
                project_id=session.project_id,
                branch_id=session.branch_id,
                occurred_at=ts,
                metadata={
                    "provider": request.provider.name,
                    "model": request.model.name,
                    "request_id": str(request.request_id),
                    **({"response_id": str(response_id)} if response_id else {}),
                },
            )
        )

    def _emit_provider_failed(
        self,
        request,
        session,
        failure,
        ts,  # type: ignore[no-untyped-def]
    ) -> None:
        self._sink.append(
            RuntimeEvent(
                event_id=RuntimeEventId(self._event_id_factory()),
                event_type=RuntimeEventType.PROVIDER_EXECUTION_FAILED,
                session_id=session.session_id,
                run_id=request.run_id,
                attempt_id=request.attempt_id,
                project_id=session.project_id,
                branch_id=session.branch_id,
                occurred_at=ts,
                metadata={
                    "provider": request.provider.name,
                    "model": request.model.name,
                    "request_id": str(request.request_id),
                    "failure_category": failure.category.value,
                    "failure_code": failure.code,
                },
            )
        )


def _default_now():
    from datetime import UTC, datetime

    return datetime.now(UTC)


__all__ = ["RuntimeExecutionCoordinator"]
