import * as Effect from "effect/Effect";
import { ObjectStore } from "@persistence/object-store";

export interface ApprovalRequest {
  approvalId: string;
  projectId: string;
  branchId: string;
  requestor: string;
  type: "hypothesis_confirm" | "hypothesis_reject" | "submission" | "protocol_change";
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ApprovalManager {
  constructor(private store: ObjectStore) {}

  async request(approval: ApprovalRequest): Promise<ApprovalRequest> {
    const now = new Date();
    const created: ApprovalRequest = {
      ...approval,
      createdAt: now,
      updatedAt: now,
    };
    await Effect.runPromise(this.store.save(created as unknown as import("@persistence/object-store").ResearchObject));
    return created;
  }

  async approve(approvalId: string, approvedBy: string): Promise<ApprovalRequest> {
    const opt = await Effect.runPromise(this.store.get(approvalId, "ApprovalRequest"));
    if (opt.isNone()) {
      throw new Error(`Approval request ${approvalId} not found`);
    }
    const existing = opt.value as unknown as ApprovalRequest;
    const updated: ApprovalRequest = {
      ...existing,
      status: "APPROVED",
      approvedBy,
      updatedAt: new Date(),
    };
    await Effect.runPromise(this.store.save(updated as unknown as import("@persistence/object-store").ResearchObject));
    return updated;
  }

  async reject(
    approvalId: string,
    approvedBy: string,
    rejectionReason: string
  ): Promise<ApprovalRequest> {
    const opt = await Effect.runPromise(this.store.get(approvalId, "ApprovalRequest"));
    if (opt.isNone()) {
      throw new Error(`Approval request ${approvalId} not found`);
    }
    const existing = opt.value as unknown as ApprovalRequest;
    const updated: ApprovalRequest = {
      ...existing,
      status: "REJECTED",
      approvedBy,
      rejectionReason,
      updatedAt: new Date(),
    };
    await Effect.runPromise(this.store.save(updated as unknown as import("@persistence/object-store").ResearchObject));
    return updated;
  }

  async list(
    projectId: string,
    status?: "PENDING" | "APPROVED" | "REJECTED"
  ): Promise<ApprovalRequest[]> {
    const all = await Effect.runPromise(this.store.list("ApprovalRequest"));
    const projectApprovals = (all as unknown as ApprovalRequest[]).filter(
      (a) => a.projectId === projectId
    );
    if (status) {
      return projectApprovals.filter((a) => a.status === status);
    }
    return projectApprovals;
  }
}
