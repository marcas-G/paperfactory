import { describe, it, expect, beforeEach } from "vitest";
import { BranchManager } from "@control/branches";
import { InMemoryObjectStore, ObjectStore } from "@persistence/object-store";

describe("BranchManager", () => {
  let store: ObjectStore;
  let manager: BranchManager;

  const projectId = "00000000-0000-4000-a000-000000000000";
  const branchId1 = "11111111-1111-4111-a111-000000000000";
  const branchId2 = "22222222-2222-4222-a222-000000000000";

  beforeEach(() => {
    store = new InMemoryObjectStore();
    manager = new BranchManager(store);
  });

  it("creates a main branch", async () => {
    const branch = await manager.create(projectId, branchId1, "main");
    expect(branch.branchId).toBe(branchId1);
    expect(branch.projectId).toBe(projectId);
    expect(branch.name).toBe("main");
    expect(branch.status).toBe("ACTIVE");
    expect(branch.parentBranchId).toBeNull();
  });

  it("creates a fork branch from existing branch", async () => {
    await manager.create(projectId, branchId1, "main");
    const forked = await manager.fork(branchId1, branchId2, "experiment-A");

    expect(forked.branchId).toBe(branchId2);
    expect(forked.parentBranchId).toBe(branchId1);
    expect(forked.name).toBe("experiment-A");
    expect(forked.status).toBe("ACTIVE");
  });

  it("fork throws if parent branch does not exist", async () => {
    await expect(manager.fork("nonexistent", branchId2, "child")).rejects.toThrow();
  });

  it("closes a branch", async () => {
    await manager.create(projectId, branchId1, "main");
    const closed = await manager.close(branchId1);
    expect(closed.status).toBe("CLOSED");
  });

  it("lists branches for a project", async () => {
    await manager.create(projectId, branchId1, "main");
    await manager.fork(branchId1, branchId2, "experiment-A");

    const branches = await manager.list(projectId);
    expect(branches.length).toBe(2);
    expect(branches[0].name).toBe("main");
    expect(branches[1].name).toBe("experiment-A");
  });

  it("lists only active branches when filtered", async () => {
    await manager.create(projectId, branchId1, "main");
    await manager.fork(branchId1, branchId2, "experiment-A");
    await manager.close(branchId1);

    const active = await manager.list(projectId, "ACTIVE");
    expect(active.length).toBe(1);
    expect(active[0].branchId).toBe(branchId2);
  });
});
