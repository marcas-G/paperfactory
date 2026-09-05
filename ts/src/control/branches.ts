import * as Effect from "effect/Effect";
import { ObjectStore } from "@persistence/object-store";

export interface Branch {
  branchId: string;
  projectId: string;
  name: string;
  status: "ACTIVE" | "CLOSED" | "MERGED";
  parentBranchId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class BranchManager {
  constructor(private store: ObjectStore) {}

  async create(projectId: string, branchId: string, name: string): Promise<Branch> {
    const now = new Date();
    const branch: Branch = {
      branchId,
      projectId,
      name,
      status: "ACTIVE",
      parentBranchId: null,
      createdAt: now,
      updatedAt: now,
    };
    await Effect.runPromise(this.store.save(branch as unknown as import("@persistence/object-store").ResearchObject));
    return branch;
  }

  async fork(parentBranchId: string, newBranchId: string, name: string): Promise<Branch> {
    const parentOpt = await Effect.runPromise(this.store.get(parentBranchId, "Branch"));
    if (parentOpt.isNone()) {
      throw new Error(`Parent branch ${parentBranchId} not found`);
    }
    const parent = parentOpt.value as unknown as Branch;
    const now = new Date();
    const branch: Branch = {
      branchId: newBranchId,
      projectId: parent.projectId,
      name,
      status: "ACTIVE",
      parentBranchId,
      createdAt: now,
      updatedAt: now,
    };
    await Effect.runPromise(this.store.save(branch as unknown as import("@persistence/object-store").ResearchObject));
    return branch;
  }

  async close(branchId: string): Promise<Branch> {
    const opt = await Effect.runPromise(this.store.get(branchId, "Branch"));
    if (opt.isNone()) {
      throw new Error(`Branch ${branchId} not found`);
    }
    const branch = opt.value as unknown as Branch;
    const updated: Branch = {
      ...branch,
      status: "CLOSED",
      updatedAt: new Date(),
    };
    await Effect.runPromise(this.store.save(updated as unknown as import("@persistence/object-store").ResearchObject));
    return updated;
  }

  async merge(branchId: string, targetBranchId: string): Promise<Branch> {
    const opt = await Effect.runPromise(this.store.get(branchId, "Branch"));
    if (opt.isNone()) {
      throw new Error(`Branch ${branchId} not found`);
    }
    const branch = opt.value as unknown as Branch;
    const updated: Branch = {
      ...branch,
      status: "MERGED",
      updatedAt: new Date(),
    };
    await Effect.runPromise(this.store.save(updated as unknown as import("@persistence/object-store").ResearchObject));
    return updated;
  }

  async list(projectId: string, status?: "ACTIVE" | "CLOSED" | "MERGED"): Promise<Branch[]> {
    const all = await Effect.runPromise(this.store.list("Branch"));
    const projectBranches = (all as unknown as Branch[]).filter(
      (b) => b.projectId === projectId
    );
    if (status) {
      return projectBranches.filter((b) => b.status === status);
    }
    return projectBranches;
  }
}
