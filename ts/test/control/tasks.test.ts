import { describe, it, expect, beforeEach } from "vitest";
import { TaskManager } from "@control/tasks";
import { InMemoryObjectStore } from "@persistence/object-store";

describe("TaskManager", () => {
  let store: InMemoryObjectStore;
  let manager: TaskManager;

  beforeEach(() => {
    store = new InMemoryObjectStore();
    manager = new TaskManager(store);
  });

  it("creates a task", async () => {
    const task = await manager.create({
      taskId: "task-001",
      projectId: "proj-001",
      branchId: "branch-001",
      title: "Search literature",
      status: "PENDING",
    });
    expect(task.taskId).toBe("task-001");
    expect(task.status).toBe("PENDING");
  });

  it("updates task status", async () => {
    await manager.create({
      taskId: "task-001",
      projectId: "proj-001",
      branchId: "branch-001",
      title: "Search",
      status: "PENDING",
    });
    const updated = await manager.update("task-001", { status: "IN_PROGRESS" });
    expect(updated.status).toBe("IN_PROGRESS");
  });

  it("throws on unknown task", async () => {
    await expect(manager.update("unknown", {})).rejects.toThrow();
  });

  it("lists tasks for a project", async () => {
    await manager.create({ taskId: "t1", projectId: "p1", branchId: "b1", title: "A", status: "PENDING" });
    await manager.create({ taskId: "t2", projectId: "p1", branchId: "b1", title: "B", status: "PENDING" });

    const tasks = await manager.list("p1");
    expect(tasks.length).toBe(2);
  });

  it("filters tasks by status", async () => {
    await manager.create({ taskId: "t1", projectId: "p1", branchId: "b1", title: "A", status: "PENDING" });
    await manager.create({ taskId: "t2", projectId: "p1", branchId: "b1", title: "B", status: "IN_PROGRESS" });

    const inProgress = await manager.list("p1", "IN_PROGRESS");
    expect(inProgress.length).toBe(1);
    expect(inProgress[0].taskId).toBe("t2");
  });
});
