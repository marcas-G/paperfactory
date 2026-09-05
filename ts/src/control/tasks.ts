import * as Effect from "effect/Effect";
import { ObjectStore } from "@persistence/object-store";

export interface Task {
  taskId: string;
  projectId: string;
  branchId: string;
  title: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class TaskManager {
  constructor(private store: ObjectStore) {}

  async create(task: Task): Promise<Task> {
    const now = new Date();
    const created: Task = {
      ...task,
      createdAt: now,
      updatedAt: now,
    };
    await Effect.runPromise(this.store.save(created));
    return created;
  }

  async update(taskId: string, updates: Partial<Task>): Promise<Task> {
    const opt = await Effect.runPromise(this.store.get(taskId, "Task"));
    if (opt.isNone()) {
      throw new Error(`Task ${taskId} not found`);
    }
    const existing = opt.value as Task;
    const updated: Task = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    await Effect.runPromise(this.store.save(updated));
    return updated;
  }

  async list(projectId: string, status?: Task["status"]): Promise<Task[]> {
    const all = await Effect.runPromise(this.store.list("Task"));
    const projectTasks = all.filter((t: Task) => t.projectId === projectId) as Task[];
    if (status) {
      return projectTasks.filter((t) => t.status === status);
    }
    return projectTasks;
  }
}
