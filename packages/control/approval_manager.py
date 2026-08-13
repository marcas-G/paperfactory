"""ApprovalManager — deterministic approval lifecycle orchestrator.

Owns the create/resolve flow for ApprovalRequest. It NEVER mutates Research
State directly; resolving an approval only updates the ApprovalRequest and
emits a ControlEvent. The Controller wires approval resolution to the
pending-transition / task lifecycle (STEP-003 §24/§25).

Time and id generation are injected for deterministic tests.
"""

from __future__ import annotations

from ..domain.enums import ActorType, SideEffectLevel
from ..domain.events import ControlEvent, ControlEventType
from ..domain.ids import (
    ApprovalId,
    BranchId,
    EventId,
    ProjectId,
    ProposalId,
    TaskId,
)
from .approvals import ApprovalRequest, ApprovalStatus
from .clock import IdFactory, TimeProvider
from .store import ApprovalStore, ControlEventSink


class ApprovalManager:
    """Create and resolve ApprovalRequests deterministically."""

    def __init__(
        self,
        store: ApprovalStore,
        event_sink: ControlEventSink,
        *,
        id_factory: IdFactory,
        now: TimeProvider,
    ) -> None:
        self._store = store
        self._sink = event_sink
        self._id_factory = id_factory
        self._now = now

    def request(
        self,
        *,
        project_id: ProjectId,
        branch_id: BranchId,
        task_id: TaskId,
        proposal_id: ProposalId,
        requested_action: str,
        reason: str,
        impact: str,
        side_effect_level: SideEffectLevel,
        requested_by: ActorType = ActorType.SYSTEM,
    ) -> ApprovalRequest:
        approval = ApprovalRequest(
            approval_id=ApprovalId(self._id_factory()),
            project_id=project_id,
            branch_id=branch_id,
            task_id=task_id,
            proposal_id=proposal_id,
            requested_action=requested_action,
            reason=reason,
            impact=impact,
            side_effect_level=side_effect_level,
            requested_by=requested_by,
            requested_at=self._now(),
        )
        self._store.save(approval)
        self._emit(ControlEventType.APPROVAL_REQUESTED, approval, requested_by)
        return approval

    def approve(
        self, approval_id: ApprovalId, *, resolved_by: ActorType, note: str = ""
    ) -> ApprovalRequest:
        return self._resolve(
            approval_id,
            status=ApprovalStatus.APPROVED,
            resolved_by=resolved_by,
            note=note,
            event_type=ControlEventType.APPROVAL_APPROVED,
        )

    def reject(
        self, approval_id: ApprovalId, *, resolved_by: ActorType, note: str = ""
    ) -> ApprovalRequest:
        return self._resolve(
            approval_id,
            status=ApprovalStatus.REJECTED,
            resolved_by=resolved_by,
            note=note,
            event_type=ControlEventType.APPROVAL_REJECTED,
        )

    def cancel(
        self, approval_id: ApprovalId, *, resolved_by: ActorType, note: str = ""
    ) -> ApprovalRequest:
        return self._resolve(
            approval_id,
            status=ApprovalStatus.CANCELLED,
            resolved_by=resolved_by,
            note=note,
            event_type=ControlEventType.APPROVAL_REJECTED,
        )

    def get(self, approval_id: ApprovalId) -> ApprovalRequest:
        return self._store.get(approval_id)

    # --- internals ------------------------------------------------------
    def _resolve(
        self,
        approval_id: ApprovalId,
        *,
        status: ApprovalStatus,
        resolved_by: ActorType,
        note: str,
        event_type: ControlEventType,
    ) -> ApprovalRequest:
        current = self._store.get(approval_id)
        resolved = current.resolve(
            status=status, resolved_by=resolved_by, now=self._now(), note=note
        )
        self._store.update(resolved)
        self._emit(event_type, resolved, resolved_by)
        return resolved

    def _emit(
        self, event_type: ControlEventType, approval: ApprovalRequest, actor: ActorType
    ) -> None:
        self._sink.append(
            ControlEvent(
                event_id=EventId(self._id_factory()),
                project_id=approval.project_id,
                branch_id=approval.branch_id,
                event_type=event_type,
                aggregate_id=str(approval.approval_id),
                actor_type=actor,
                created_at=self._now(),
                payload={
                    "approval_id": str(approval.approval_id),
                    "task_id": str(approval.task_id),
                    "proposal_id": str(approval.proposal_id),
                    "status": approval.status.value,
                },
            )
        )


__all__ = ["ApprovalManager"]
