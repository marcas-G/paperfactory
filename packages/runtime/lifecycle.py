"""Runtime lifecycle managers (STEP-011 §31..48).

RuntimeSessionManager and RuntimeRunManager are deterministic lifecycle
controllers. They do NOT call providers, execute tools, retry, or mutate
Research State. They manage immutable lifecycle transitions, emit RuntimeEvents,
and enforce invariants (single active attempt, session busy, clock ordering).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from ..domain.enums import ActorType
from ..domain.ids import (
    BranchId,
    ExecutionAttemptId,
    ProjectId,
    RuntimeEventId,
    RuntimeRunId,
    RuntimeSessionId,
)
from .contracts import (
    RUN_NON_TERMINAL,
    AttemptStatus,
    ExecutionAttempt,
    RunStatus,
    RuntimeFailure,
    RuntimeFailureCategory,
    RuntimeInputRef,
    RuntimeOutputRef,
    RuntimeRun,
    RuntimeSession,
    RuntimeSessionStatus,
    RunWaitReason,
)
from .errors import (
    IllegalRunTransitionError,
    IllegalSessionTransitionError,
    RuntimeInvariantViolationError,
    RuntimeRunNotFoundError,
    RuntimeSessionNotFoundError,
    SessionBusyError,
)
from .events import RuntimeEvent, RuntimeEventType
from .store import (
    ExecutionAttemptStore,
    RuntimeEventSink,
    RuntimeRunStore,
    RuntimeSessionStore,
)

TimeProvider = Callable[[], datetime]
IdFactory = Callable[[], str]


def _default_now() -> datetime:
    return datetime.now(UTC)


def _default_id() -> str:
    return uuid.uuid4().hex


# =========================================================================
# RuntimeSessionManager
# =========================================================================
class RuntimeSessionManager:
    """Deterministic Session lifecycle (STEP-011 §31/§32)."""

    def __init__(
        self,
        session_store: RuntimeSessionStore,
        run_store: RuntimeRunStore,
        event_sink: RuntimeEventSink,
        *,
        session_id_factory: IdFactory | None = None,
        event_id_factory: IdFactory | None = None,
        now: TimeProvider | None = None,
    ) -> None:
        self._sessions = session_store
        self._runs = run_store
        self._sink = event_sink
        self._session_id_factory = session_id_factory or _default_id
        self._event_id_factory = event_id_factory or _default_id
        self._now = now or _default_now

    def create_session(
        self,
        *,
        project_id: ProjectId,
        branch_id: BranchId,
        created_by: ActorType = ActorType.SYSTEM,
    ) -> RuntimeSession:
        ts = self._now()
        session = RuntimeSession(
            session_id=RuntimeSessionId(self._session_id_factory()),
            project_id=project_id,
            branch_id=branch_id,
            status=RuntimeSessionStatus.OPEN,
            created_by=created_by,
            created_at=ts,
        )
        self._sessions.save(session)
        self._emit(
            RuntimeEventType.SESSION_CREATED, session, None,
            RuntimeSessionStatus.OPEN, ts, created_by,
        )
        return session

    def get_session(self, session_id: RuntimeSessionId) -> RuntimeSession:
        try:
            return self._sessions.get(session_id)
        except KeyError:
            raise RuntimeSessionNotFoundError(f"session not found: {session_id}") from None

    def close_session(
        self, session_id: RuntimeSessionId, *, actor: ActorType = ActorType.SYSTEM
    ) -> RuntimeSession:
        session = self._require_open(session_id)
        self._check_no_busy_runs(session_id)
        ts = self._now()
        updated = session.with_status(
            RuntimeSessionStatus.CLOSED, closed_by=actor, closed_at=ts
        )
        self._sessions.update(updated)
        self._emit(
            RuntimeEventType.SESSION_CLOSED, updated, None,
            RuntimeSessionStatus.CLOSED, ts, actor,
        )
        return updated

    def cancel_session(
        self, session_id: RuntimeSessionId, *, actor: ActorType = ActorType.SYSTEM
    ) -> RuntimeSession:
        session = self._require_open(session_id)
        self._check_no_busy_runs(session_id)
        ts = self._now()
        updated = session.with_status(
            RuntimeSessionStatus.CANCELLED, closed_by=actor, closed_at=ts
        )
        self._sessions.update(updated)
        self._emit(
            RuntimeEventType.SESSION_CANCELLED, updated, None,
            RuntimeSessionStatus.CANCELLED, ts, actor,
        )
        return updated

    # --- internals -------------------------------------------------------
    def _require_open(self, session_id: RuntimeSessionId) -> RuntimeSession:
        session = self.get_session(session_id)
        if session.status is not RuntimeSessionStatus.OPEN:
            raise IllegalSessionTransitionError(
                f"session {session_id} is {session.status.value}; must be OPEN"
            )
        return session

    def _check_no_busy_runs(self, session_id: RuntimeSessionId) -> None:
        for run in self._runs.list_for_session(session_id):
            if run.status in RUN_NON_TERMINAL:
                raise SessionBusyError(
                    f"session {session_id} has non-terminal run {run.run_id}"
                )

    def _emit(
        self,
        event_type: RuntimeEventType,
        session: RuntimeSession,
        run: RuntimeRun | None,
        new_status: object,
        ts: datetime,
        actor: ActorType,
        run_id: RuntimeRunId | None = None,
        attempt_id: ExecutionAttemptId | None = None,
        prev_status: str | None = None,
    ) -> None:
        self._sink.append(RuntimeEvent(
            event_id=RuntimeEventId(self._event_id_factory()),
            event_type=event_type,
            session_id=session.session_id,
            run_id=run_id or (run.run_id if run else None),
            attempt_id=attempt_id,
            project_id=session.project_id,
            branch_id=session.branch_id,
            actor=actor,
            occurred_at=ts,
            previous_status=prev_status,
            new_status=str(new_status),
        ))


# =========================================================================
# RuntimeRunManager
# =========================================================================
class RuntimeRunManager:
    """Deterministic Run + Attempt lifecycle (STEP-011 §33..48)."""

    def __init__(
        self,
        session_store: RuntimeSessionStore,
        run_store: RuntimeRunStore,
        attempt_store: ExecutionAttemptStore,
        event_sink: RuntimeEventSink,
        *,
        run_id_factory: IdFactory | None = None,
        attempt_id_factory: IdFactory | None = None,
        event_id_factory: IdFactory | None = None,
        now: TimeProvider | None = None,
    ) -> None:
        self._sessions = session_store
        self._runs = run_store
        self._attempts = attempt_store
        self._sink = event_sink
        self._run_id_factory = run_id_factory or _default_id
        self._attempt_id_factory = attempt_id_factory or _default_id
        self._event_id_factory = event_id_factory or _default_id
        self._now = now or _default_now

    # --- create / ready --------------------------------------------------
    def create_run(
        self,
        *,
        session_id: RuntimeSessionId,
        input_ref: RuntimeInputRef,
        created_by: ActorType = ActorType.SYSTEM,
    ) -> RuntimeRun:
        session = self._require_session(session_id)
        if session.status is not RuntimeSessionStatus.OPEN:
            raise IllegalRunTransitionError(
                f"session {session_id} is not OPEN"
            )
        ts = self._now()
        run = RuntimeRun(
            run_id=RuntimeRunId(self._run_id_factory()),
            session_id=session_id,
            project_id=session.project_id,
            branch_id=session.branch_id,
            status=RunStatus.CREATED,
            input_ref=input_ref,
            created_by=created_by,
            created_at=ts,
        )
        self._runs.save(run)
        self._emit(session, RuntimeEventType.RUN_CREATED, run, RunStatus.CREATED, ts, created_by)
        return run

    def mark_ready(
        self, run_id: RuntimeRunId, *, actor: ActorType = ActorType.SYSTEM
    ) -> RuntimeRun:
        run = self._require_run(run_id)
        ts = self._now()
        prev = run.status
        updated = run.with_status(RunStatus.READY, now=ts)
        self._runs.update(updated)
        self._emit(self._get_session(run), RuntimeEventType.RUN_READY, updated, RunStatus.READY,
            ts, actor, prev)
        return updated

    # --- start -----------------------------------------------------------
    def start_run(
        self, run_id: RuntimeRunId, *, actor: ActorType = ActorType.SYSTEM
    ) -> tuple[RuntimeRun, ExecutionAttempt]:
        run = self._require_run(run_id)
        session = self._get_session(run)
        ts = self._now()
        prev = run.status
        updated_run = run.with_status(RunStatus.RUNNING, now=ts)

        # create attempt
        existing = self._attempts.list_for_run(run_id)
        attempt_number = len(existing) + 1
        # invariant: no other RUNNING attempt
        active = [a for a in existing if a.status is AttemptStatus.RUNNING]
        if active:
            raise RuntimeInvariantViolationError(
                f"run {run_id} already has an active RUNNING attempt"
            )
        attempt = ExecutionAttempt(
            attempt_id=ExecutionAttemptId(self._attempt_id_factory()),
            run_id=run_id,
            attempt_number=attempt_number,
            status=AttemptStatus.RUNNING,
            started_at=ts,
        )
        updated_run = RuntimeRun(
            **{**updated_run.__dict__, "attempt_count": updated_run.attempt_count + 1}
        )
        # Save atomically (logical): attempt first, then run update, then events
        self._attempts.save(attempt)
        self._runs.update(updated_run)
        self._emit(session, RuntimeEventType.RUN_STARTED, updated_run, RunStatus.RUNNING,
            ts, actor, prev,
            run_id=run_id)
        self._emit(session, RuntimeEventType.ATTEMPT_STARTED, updated_run, AttemptStatus.RUNNING,
            ts, actor,
            run_id=run_id,
            attempt_id=attempt.attempt_id)
        return updated_run, attempt

    # --- pause / resume --------------------------------------------------
    def pause_run(
        self, run_id: RuntimeRunId, *, reason: RunWaitReason,
        actor: ActorType = ActorType.SYSTEM,
    ) -> RuntimeRun:
        run = self._require_run(run_id)
        session = self._get_session(run)
        ts = self._now()
        prev = run.status
        updated = run.with_status(RunStatus.WAITING, now=ts, wait_reason=reason)
        self._runs.update(updated)
        self._emit(session, RuntimeEventType.RUN_WAITING, updated, RunStatus.WAITING,
            ts, actor, prev)
        return updated

    def resume_run(
        self, run_id: RuntimeRunId, *, actor: ActorType = ActorType.SYSTEM
    ) -> RuntimeRun:
        run = self._require_run(run_id)
        session = self._get_session(run)
        ts = self._now()
        prev = run.status
        updated = run.with_status(RunStatus.RUNNING, now=ts)
        self._runs.update(updated)
        self._emit(session, RuntimeEventType.RUN_RESUMED, updated, RunStatus.RUNNING,
            ts, actor, prev)
        return updated

    # --- succeed ---------------------------------------------------------
    def succeed_run(
        self, run_id: RuntimeRunId, *,
        output_ref: RuntimeOutputRef | None = None,
        actor: ActorType = ActorType.SYSTEM,
    ) -> tuple[RuntimeRun, ExecutionAttempt]:
        run = self._require_run(run_id)
        session = self._get_session(run)
        ts = self._now()
        prev = run.status
        attempt = self._require_active_attempt(run_id)
        updated_attempt = attempt.with_status(
            AttemptStatus.SUCCEEDED, now=ts, output_ref=output_ref,
        )
        updated_run = run.with_status(
            RunStatus.SUCCEEDED, now=ts, output_ref=output_ref,
        )
        self._attempts.update(updated_attempt)
        self._runs.update(updated_run)
        self._emit(
            session, RuntimeEventType.ATTEMPT_SUCCEEDED, updated_run,
            AttemptStatus.SUCCEEDED,
            ts, actor,
            run_id=run_id,
            attempt_id=attempt.attempt_id)
        self._emit(session, RuntimeEventType.RUN_SUCCEEDED, updated_run, RunStatus.SUCCEEDED,
            ts, actor, prev)
        return updated_run, updated_attempt

    # --- fail ------------------------------------------------------------
    def fail_run(
        self, run_id: RuntimeRunId, *, failure: RuntimeFailure,
        actor: ActorType = ActorType.SYSTEM,
    ) -> tuple[RuntimeRun, ExecutionAttempt]:
        run = self._require_run(run_id)
        session = self._get_session(run)
        ts = self._now()
        prev = run.status
        attempt = self._require_active_attempt(run_id)
        updated_attempt = attempt.with_status(
            AttemptStatus.FAILED, now=ts, failure=failure,
        )
        updated_run = run.with_status(
            RunStatus.FAILED, now=ts, failure=failure,
        )
        self._attempts.update(updated_attempt)
        self._runs.update(updated_run)
        self._emit(session, RuntimeEventType.ATTEMPT_FAILED, updated_run, AttemptStatus.FAILED,
            ts, actor,
            run_id=run_id,
            attempt_id=attempt.attempt_id)
        self._emit(session, RuntimeEventType.RUN_FAILED, updated_run, RunStatus.FAILED,
            ts, actor, prev)
        return updated_run, updated_attempt

    # --- cancel ----------------------------------------------------------
    def cancel_run(
        self, run_id: RuntimeRunId, *, actor: ActorType = ActorType.SYSTEM
    ) -> RuntimeRun:
        run = self._require_run(run_id)
        session = self._get_session(run)
        ts = self._now()
        prev = run.status
        active = self._maybe_active_attempt(run_id)
        if active is not None:
            updated_attempt = active.with_status(AttemptStatus.CANCELLED, now=ts)
            self._attempts.update(updated_attempt)
            self._emit(session, RuntimeEventType.ATTEMPT_CANCELLED, run, AttemptStatus.CANCELLED,
                ts, actor,
                run_id=run_id,
                attempt_id=active.attempt_id)
        updated_run = run.with_status(RunStatus.CANCELLED, now=ts)
        self._runs.update(updated_run)
        self._emit(session, RuntimeEventType.RUN_CANCELLED, updated_run, RunStatus.CANCELLED,
            ts, actor, prev)
        return updated_run

    # --- timeout ---------------------------------------------------------
    def timeout_run(
        self, run_id: RuntimeRunId, *, actor: ActorType = ActorType.SYSTEM
    ) -> tuple[RuntimeRun, ExecutionAttempt]:
        run = self._require_run(run_id)
        session = self._get_session(run)
        ts = self._now()
        prev = run.status
        attempt = self._require_active_attempt(run_id)
        failure = RuntimeFailure(
            category=RuntimeFailureCategory.TIMEOUT,
            code="EXECUTION_TIMEOUT",
            message=f"run {run_id} timed out",
        )
        updated_attempt = attempt.with_status(
            AttemptStatus.TIMED_OUT, now=ts, failure=failure,
        )
        updated_run = run.with_status(
            RunStatus.TIMED_OUT, now=ts, failure=failure,
        )
        self._attempts.update(updated_attempt)
        self._runs.update(updated_run)
        self._emit(
            session, RuntimeEventType.ATTEMPT_TIMED_OUT, updated_run,
            AttemptStatus.TIMED_OUT,
            ts, actor,
            run_id=run_id,
            attempt_id=attempt.attempt_id)
        self._emit(session, RuntimeEventType.RUN_TIMED_OUT, updated_run, RunStatus.TIMED_OUT,
            ts, actor, prev)
        return updated_run, updated_attempt

    # --- run lookup ------------------------------------------------------
    def get_run(self, run_id: RuntimeRunId) -> RuntimeRun:
        return self._require_run(run_id)

    def list_attempts(self, run_id: RuntimeRunId) -> list[ExecutionAttempt]:
        return self._attempts.list_for_run(run_id)

    # --- internals -------------------------------------------------------
    def _require_session(self, session_id: RuntimeSessionId) -> RuntimeSession:
        try:
            return self._sessions.get(session_id)
        except KeyError:
            raise RuntimeSessionNotFoundError(f"session not found: {session_id}") from None

    def _get_session(self, run: RuntimeRun) -> RuntimeSession:
        return self._require_session(run.session_id)

    def _require_run(self, run_id: RuntimeRunId) -> RuntimeRun:
        try:
            return self._runs.get(run_id)
        except KeyError:
            raise RuntimeRunNotFoundError(f"run not found: {run_id}") from None

    def _require_active_attempt(self, run_id: RuntimeRunId) -> ExecutionAttempt:
        active = [a for a in self._attempts.list_for_run(run_id)
                  if a.status is AttemptStatus.RUNNING]
        if not active:
            raise RuntimeInvariantViolationError(
                f"run {run_id} has no active RUNNING attempt"
            )
        if len(active) > 1:
            raise RuntimeInvariantViolationError(
                f"run {run_id} has multiple active RUNNING attempts"
            )
        return active[0]

    def _maybe_active_attempt(self, run_id: RuntimeRunId) -> ExecutionAttempt | None:
        active = [a for a in self._attempts.list_for_run(run_id)
                  if a.status is AttemptStatus.RUNNING]
        return active[0] if active else None

    def _emit(
        self,
        session: RuntimeSession,
        event_type: RuntimeEventType,
        run: RuntimeRun | None,
        new_status: object,
        ts: datetime,
        actor: ActorType,
        prev_status: str | None = None,
        run_id: RuntimeRunId | None = None,
        attempt_id: ExecutionAttemptId | None = None,
    ) -> None:
        self._sink.append(RuntimeEvent(
            event_id=RuntimeEventId(self._event_id_factory()),
            event_type=event_type,
            session_id=session.session_id,
            run_id=run_id or (run.run_id if run else None),
            attempt_id=attempt_id,
            project_id=session.project_id,
            branch_id=session.branch_id,
            actor=actor,
            occurred_at=ts,
            previous_status=prev_status,
            new_status=str(new_status),
        ))


__all__ = ["IdFactory", "RuntimeRunManager", "RuntimeSessionManager", "TimeProvider"]
