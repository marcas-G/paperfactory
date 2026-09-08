"""BranchManager — deterministic Research Branch lifecycle orchestrator.

Owns create / fork / pause / resume / archive / reject / prepare_merge for
branches. It guarantees:

    * one main branch per project (BR-INV-01);
    * fork provenance + independent state snapshot (BR-INV-02..05);
    * branch-local revision (revision is (project, branch)-scoped);
    * state isolation (no alias contamination);
    * terminal branches never revive (BR-INV-06);
    * RUNNING tasks block pause/archive/reject (BR-INV / STEP-004 §38);
    * merge preparation never mutates Research State (STEP-004 §28).

It does NOT choose the next action, call an LLM, persist to PostgreSQL, or
perform research-semantic merge.
"""

from __future__ import annotations

from ..domain.enums import ActorType
from ..domain.events import ControlEvent, ControlEventType
from ..domain.ids import BranchId, EventId, MergeId, ProjectId
from ..domain.models import ResearchStateSnapshot
from .branches import (
    FORKABLE_BRANCH_STATUSES,
    BranchForkPoint,
    BranchStatus,
    ResearchBranch,
)
from .clock import IdFactory, TimeProvider
from .errors import (
    BranchBusyError,
    BranchMergeError,
    BranchNotFoundError,
    DuplicateBranchError,
    IllegalBranchTransitionError,
)
from .merges import BranchMergeProposal, MergeStatus, detect_conflicts
from .store import BranchStore, ForkPointStore, MergeStore, StateStore, TaskStore
from .tasks import TaskStatus


class BranchManager:
    """Deterministic branch lifecycle controller."""

    def __init__(
        self,
        branch_store: BranchStore,
        fork_point_store: ForkPointStore,
        state_store: StateStore,
        merge_store: MergeStore,
        task_store: TaskStore,
        event_sink,  # ControlEventSink (avoid circular type import)
        *,
        id_factory: IdFactory,
        now: TimeProvider,
    ) -> None:
        self._branches = branch_store
        self._fork_points = fork_point_store
        self._states = state_store
        self._merges = merge_store
        self._tasks = task_store
        self._sink = event_sink
        self._id_factory = id_factory
        self._now = now

    # ===================================================================
    # Creation
    # ===================================================================
    def create_main_branch(
        self,
        *,
        project_id: ProjectId,
        branch_id: BranchId,
        name: str = "main",
        purpose: str = "",
        created_by: ActorType = ActorType.SYSTEM,
        initial_snapshot: ResearchStateSnapshot | None = None,
    ) -> ResearchBranch:
        """Create the single main branch for a project (BR-INV-01)."""
        if self._branches.get_main(project_id) is not None:
            raise DuplicateBranchError(f"project {project_id} already has a main branch")
        ts = self._now()
        branch = ResearchBranch(
            branch_id=branch_id,
            project_id=project_id,
            name=name,
            created_at=ts,
            updated_at=ts,
            purpose=purpose,
            created_by=created_by,
        )
        self._branches.save_new(branch)
        # Initialize the branch's state (formal port path, STEP-004 §14).
        snapshot = initial_snapshot or ResearchStateSnapshot(
            project_id=project_id, branch_id=branch_id, revision=0
        )
        self._states.initialize_branch_snapshot(snapshot)
        self._emit(
            ControlEventType.BRANCH_CREATED,
            branch,
            actor=created_by,
            payload={"is_main": True},
        )
        return branch

    # ===================================================================
    # Fork
    # ===================================================================
    def fork_branch(
        self,
        *,
        source_branch_id: BranchId,
        new_branch_id: BranchId,
        name: str,
        purpose: str = "",
        created_by: ActorType = ActorType.SYSTEM,
    ) -> ResearchBranch:
        """Fork a new branch from ``source`` (STEP-004 §12).

        Captures the source snapshot as the new branch's initial state
        (branch-local revision 0) and records a ``BranchForkPoint`` for later
        three-way merge. Source and target states are independent snapshots.
        """
        source = self._require_branch(source_branch_id)
        if source.status not in FORKABLE_BRANCH_STATUSES:
            raise IllegalBranchTransitionError(
                f"cannot fork from branch in status {source.status.value}"
            )
        if self._branches.exists(new_branch_id):
            raise DuplicateBranchError(f"branch already exists: {new_branch_id}")

        source_snapshot = self._states.get_snapshot(source.project_id, source_branch_id)

        ts = self._now()
        new_branch = ResearchBranch(
            branch_id=new_branch_id,
            project_id=source.project_id,
            name=name,
            created_at=ts,
            updated_at=ts,
            purpose=purpose,
            parent_branch_id=source_branch_id,
            forked_from_revision=source_snapshot.revision,
            created_by=created_by,
        )
        self._branches.save_new(new_branch)

        # Independent initial state for the new branch — revision is
        # branch-local, so the new branch starts at 0 even though the source
        # may be at a higher revision.
        initial = ResearchStateSnapshot(
            project_id=source.project_id,
            branch_id=new_branch_id,
            revision=0,
            object_states=dict(source_snapshot.object_states),
            metadata=dict(source_snapshot.metadata),
        )
        self._states.initialize_branch_snapshot(initial)

        # Record immutable fork provenance + base snapshot for merge.
        self._fork_points.save(
            BranchForkPoint(
                branch_id=new_branch_id,
                source_branch_id=source_branch_id,
                source_revision=source_snapshot.revision,
                object_states=dict(source_snapshot.object_states),
            )
        )

        self._emit(
            ControlEventType.BRANCH_FORKED,
            new_branch,
            actor=created_by,
            payload={
                "source_branch_id": str(source_branch_id),
                "source_revision": source_snapshot.revision,
                "new_branch_id": str(new_branch_id),
            },
        )
        return new_branch

    # ===================================================================
    # Lifecycle transitions
    # ===================================================================
    def pause_branch(
        self, branch_id: BranchId, *, actor: ActorType = ActorType.SYSTEM
    ) -> ResearchBranch:
        self._require_no_running_tasks(branch_id, operation="pause")
        return self._transition(
            branch_id, BranchStatus.PAUSED, ControlEventType.BRANCH_PAUSED, actor
        )

    def resume_branch(
        self, branch_id: BranchId, *, actor: ActorType = ActorType.SYSTEM
    ) -> ResearchBranch:
        return self._transition(
            branch_id, BranchStatus.ACTIVE, ControlEventType.BRANCH_RESUMED, actor
        )

    def archive_branch(
        self, branch_id: BranchId, *, actor: ActorType = ActorType.SYSTEM
    ) -> ResearchBranch:
        self._require_no_running_tasks(branch_id, operation="archive")
        return self._transition(
            branch_id, BranchStatus.ARCHIVED, ControlEventType.BRANCH_ARCHIVED, actor
        )

    def reject_branch(
        self, branch_id: BranchId, *, actor: ActorType = ActorType.SYSTEM
    ) -> ResearchBranch:
        self._require_no_running_tasks(branch_id, operation="reject")
        return self._transition(
            branch_id, BranchStatus.REJECTED, ControlEventType.BRANCH_REJECTED, actor
        )

    # ===================================================================
    # Merge preparation (NOT merge commit)
    # ===================================================================
    def prepare_merge(
        self,
        *,
        source_branch_id: BranchId,
        target_branch_id: BranchId,
        actor: ActorType = ActorType.SYSTEM,
    ) -> BranchMergeProposal:
        """Prepare a merge: read both states, three-way compare against the
        fork base, produce a typed proposal. Does NOT mutate any state and
        does NOT emit BRANCH_MERGED (STEP-004 §28)."""
        if source_branch_id == target_branch_id:
            raise BranchMergeError("source and target branches are the same")
        source = self._require_branch(source_branch_id)
        target = self._require_branch(target_branch_id)
        if source.project_id != target.project_id:
            raise BranchMergeError("source and target belong to different projects")
        if source.status not in FORKABLE_BRANCH_STATUSES:
            raise BranchMergeError(
                f"source branch status {source.status.value} is not forkable/mergeable"
            )
        if target.status is not BranchStatus.ACTIVE:
            raise BranchMergeError(f"target branch status {target.status.value} is not ACTIVE")

        # Fork base must be traceable (the source was forked from target, or
        # shares a common base). We require the source to have a recorded fork
        # point whose source is the target (simplest first-version policy).
        try:
            fork_point = self._fork_points.get(source_branch_id)
        except KeyError as exc:
            raise BranchMergeError(
                f"source branch has no recorded fork point: {source_branch_id}"
            ) from exc
        if fork_point.source_branch_id != target_branch_id:
            raise BranchMergeError(
                "source fork base does not point at target branch "
                f"(fork base source={fork_point.source_branch_id})"
            )

        source_snapshot = self._states.get_snapshot(source.project_id, source_branch_id)
        target_snapshot = self._states.get_snapshot(target.project_id, target_branch_id)

        conflicts = detect_conflicts(
            base=fork_point.object_states,
            source=source_snapshot.object_states,
            target=target_snapshot.object_states,
        )
        status = MergeStatus.CONFLICTED if conflicts else MergeStatus.READY

        proposal = BranchMergeProposal(
            merge_id=MergeId(self._id_factory()),
            project_id=source.project_id,
            source_branch_id=source_branch_id,
            target_branch_id=target_branch_id,
            source_head_revision=source_snapshot.revision,
            target_head_revision=target_snapshot.revision,
            fork_base_branch_id=fork_point.source_branch_id,
            fork_base_revision=fork_point.source_revision,
            conflicts=tuple(conflicts),
            status=status,
            created_by=actor,
            created_at=self._now(),
        )
        self._merges.save(proposal)
        self._emit(
            ControlEventType.BRANCH_MERGE_PREPARED,
            target,  # aggregate on target branch
            actor=actor,
            payload={
                "merge_id": str(proposal.merge_id),
                "source_branch_id": str(source_branch_id),
                "target_branch_id": str(target_branch_id),
                "source_head_revision": source_snapshot.revision,
                "target_head_revision": target_snapshot.revision,
                "status": status.value,
                "conflict_count": len(conflicts),
            },
        )
        return proposal

    # ===================================================================
    # Reads
    # ===================================================================
    def get_branch(self, branch_id: BranchId) -> ResearchBranch:
        return self._require_branch(branch_id)

    def list_branches(self, project_id: ProjectId) -> list[ResearchBranch]:
        return self._branches.list_for_project(project_id)

    # ===================================================================
    # Internals
    # ===================================================================
    def _require_branch(self, branch_id: BranchId) -> ResearchBranch:
        try:
            return self._branches.get(branch_id)
        except BranchNotFoundError:
            raise
        except KeyError:
            raise BranchNotFoundError(f"branch not found: {branch_id}") from None

    def _require_no_running_tasks(self, branch_id: BranchId, *, operation: str) -> None:
        branch = self._require_branch(branch_id)
        for task in self._tasks.list_for_project(branch.project_id, branch_id):
            if task.status is TaskStatus.RUNNING:
                raise BranchBusyError(
                    f"cannot {operation} branch {branch_id}: task {task.task_id} is RUNNING"
                )

    def _transition(
        self,
        branch_id: BranchId,
        target_status: BranchStatus,
        event_type: ControlEventType,
        actor: ActorType,
    ) -> ResearchBranch:
        branch = self._require_branch(branch_id)
        previous = branch.status
        updated = branch.with_status(target_status, now=self._now())
        self._branches.save(updated)
        self._emit(
            event_type,
            updated,
            actor=actor,
            payload={"previous_status": previous.value, "new_status": target_status.value},
        )
        return updated

    def _emit(
        self,
        event_type: ControlEventType,
        branch: ResearchBranch,
        *,
        actor: ActorType,
        payload: dict[str, object],
    ) -> None:
        self._sink.append(
            ControlEvent(
                event_id=EventId(self._id_factory()),
                project_id=branch.project_id,
                branch_id=branch.branch_id,
                event_type=event_type,
                aggregate_id=str(branch.branch_id),
                actor_type=actor,
                created_at=self._now(),
                payload=payload,
            )
        )


__all__ = ["BranchManager"]
