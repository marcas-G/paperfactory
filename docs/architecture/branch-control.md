# Branch Control

Research Branch Control lets one project hold several parallel research lines
that evolve independently. A branch is a **research-state isolation boundary**:
each branch has its own branch-local revision, its own object states, and its
own task / pending / approval lifecycle. Branches are NOT state snapshots —
the snapshot still lives in the `StateStore` keyed by `(project_id, branch_id)`;
the `ResearchBranch` is the lifecycle + provenance record.

This module is part of the Control Plane (M1). See
[control-kernel.md](control-kernel.md) for the kernel it builds on, and
[ADR-002](../adr/ADR-002-research-state-ownership.md) for state ownership.

> **Branch is a research-state isolation boundary.**

## Branch Lifecycle

```
ACTIVE  -> PAUSED | MERGED | REJECTED | ARCHIVED
PAUSED  -> ACTIVE | REJECTED | ARCHIVED
```

Terminal (never revived): **MERGED, REJECTED, ARCHIVED**.

* `ACTIVE` — ordinary research actions allowed.
* `PAUSED` — state retained; no new ordinary actions; only branch-control
  actions; pending transitions may not commit until RESUMED.
* `MERGED / REJECTED / ARCHIVED` — terminal; no ordinary actions, no commits.

A project has at most one **main branch** (`parent_branch_id = None`,
`forked_from_revision = None`). A second `create_main_branch` for the same
project raises `DuplicateBranchError` (BR-INV-01).

## Fork Semantics

`fork_branch(source, new_branch)`:

1. requires the source to be `ACTIVE` or `PAUSED`;
2. reads the source's current `ResearchStateSnapshot`;
3. creates a new `ResearchBranch` with `parent_branch_id = source`,
   `forked_from_revision = source.revision`;
4. initializes the new branch's state via `StateStore.initialize_branch_snapshot`
   — an **independent copy** (no alias) of the source object states;
5. records an immutable `BranchForkPoint` (source branch + revision + base
   object states) for later three-way merge;
6. emits `BRANCH_FORKED` with `source_branch_id` / `source_revision` /
   `new_branch_id`.

**Branch-local revision:** the new branch starts at `revision = 0` regardless
of the source revision. Revision is scoped to `(project_id, branch_id)`, not
global. `main` at revision 4 and `H1` at revision 2 coexist legally.

> **State isolation (hard invariant):** after a fork, mutating the child does
> not affect the source, and the source revision is unchanged. The in-memory
> adapter deep-copies object states on `initialize_branch_snapshot` and on
> every `commit_transition`.

## Task Interaction

* A task's `dependencies` MUST be within the same branch — cross-branch
  dependencies raise `CrossBranchDependencyError` (STEP-004 §20).
* `RUNNING` tasks block `pause` / `archive` / `reject` of a branch
  (`BranchBusyError`) — we do not auto-cancel running side effects
  (STEP-004 §38). `WAITING` tasks do NOT block pause.
* `READY` / `PENDING` tasks keep their status when the branch pauses; they
  simply cannot run (`mark_running` requires an ACTIVE branch implicitly via
  transition legality at commit time).

## Approval Interaction

* An approval belongs to exactly one `(project_id, branch_id)`. Using an
  approval from branch H1 against a pending transition on H2 raises
  `BranchScopeMismatchError` (§22).
* A pending transition may be **approved while the branch is PAUSED**, but it
  **MUST NOT commit** until the branch is RESUMED (§35). Resume on a
  non-ACTIVE branch raises `IllegalActionError`.

## Pending Transition Interaction

* A pending transition resumes only on its own branch.
* A terminal branch forbids resuming/committing its pending transitions (§21).
* Resume always re-validates `expected_revision` against the current state
  (STEP-003 §24 unchanged).

## Merge Preparation

`prepare_merge(source, target)` performs **merge preparation only**:

1. Preconditions: `source != target`, same project, source `ACTIVE|PAUSED`,
   target `ACTIVE`, source has a recorded `BranchForkPoint` whose source is
   the target.
2. Reads source/target states and the fork base.
3. Runs **generic three-way conflict detection** over `object_states`.
4. Produces a typed `BranchMergeProposal` (`READY` or `CONFLICTED`) and emits
   `BRANCH_MERGE_PREPARED`.

It does NOT mutate either branch's state and does NOT mark the source
`MERGED`. `BRANCH_MERGED` is reserved for a future real merge execution and is
never emitted here.

> **Merge preparation is not research-semantic merge.** Research objects
> (Hypothesis, Evidence, Claim, Decision) have their own merge semantics,
> which arrive with the research domain.

### Conflict truth table (per object, three-way: base / source / target)

| Base | Source | Target | Result |
| --- | --- | --- | --- |
| DRAFT | DRAFT | DRAFT | UNCHANGED |
| DRAFT | DRAFT | READY | TARGET_ONLY_CHANGE (no conflict) |
| DRAFT | READY | DRAFT | SOURCE_ONLY_CHANGE (no conflict) |
| DRAFT | READY | READY | SAME_CHANGE (no conflict) |
| DRAFT | READY | COMPLETE | **CONFLICT** |
| — | READY | READY | SAME_CHANGE (no conflict) |

Rule: if `source == target` -> no conflict; else if only one side changed
relative to base -> no conflict; else -> **CONFLICT**.

## Event Inventory (branch)

`BRANCH_CREATED`, `BRANCH_FORKED`, `BRANCH_PAUSED`, `BRANCH_RESUMED`,
`BRANCH_ARCHIVED`, `BRANCH_REJECTED`, `BRANCH_MERGE_PREPARED`. `BRANCH_MERGED`
is defined but not emitted until real merge commit exists.

Every branch lifecycle change emits a `ControlEvent` whose payload records the
project, branch, previous/new status, actor, and (for fork) source branch +
revision.

## STEP-003 Audit Correction

Approval resolution events are now distinct (STEP-004 §3):

| operation | event |
| --- | --- |
| approve | `APPROVAL_APPROVED` |
| reject | `APPROVAL_REJECTED` |
| cancel | `APPROVAL_CANCELLED` |
| expire | `APPROVAL_EXPIRED` |

Previously `cancel` reused `APPROVAL_REJECTED`, which made audit unable to
distinguish "explicitly denied" from "withdrawn". `expire()` is a new
deterministic operation (`PENDING -> EXPIRED`); no automatic TTL is
implemented yet.
