import { describe, it, expect, beforeEach } from "vitest";
import { ApprovalManager } from "@control/approvals";
import { InMemoryObjectStore } from "@persistence/object-store";

describe("ApprovalManager", () => {
  let store: InMemoryObjectStore;
  let manager: ApprovalManager;

  beforeEach(() => {
    store = new InMemoryObjectStore();
    manager = new ApprovalManager(store);
  });

  it("creates an approval request", async () => {
    const req = await manager.request({
      approvalId: "appr-001",
      projectId: "proj-001",
      branchId: "branch-001",
      requestor: "alice",
      type: "hypothesis_confirm",
      reason: "Evidence supports hypothesis",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(req.status).toBe("PENDING");
    expect(req.approvedBy).toBeUndefined();
  });

  it("approves a request", async () => {
    await manager.request({
      approvalId: "appr-001",
      projectId: "proj-001",
      branchId: "branch-001",
      requestor: "alice",
      type: "hypothesis_confirm",
      reason: "Support",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const approved = await manager.approve("appr-001", "bob");
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedBy).toBe("bob");
  });

  it("rejects a request", async () => {
    await manager.request({
      approvalId: "appr-001",
      projectId: "proj-001",
      branchId: "branch-001",
      requestor: "alice",
      type: "hypothesis_confirm",
      reason: "Support",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const rejected = await manager.reject("appr-001", "charlie", "Not enough evidence");
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.approvedBy).toBe("charlie");
    expect(rejected.rejectionReason).toBe("Not enough evidence");
  });

  it("throws on approving unknown request", async () => {
    await expect(manager.approve("unknown", "bob")).rejects.toThrow();
  });

  it("lists pending approvals", async () => {
    await manager.request({
      approvalId: "a1", projectId: "p1", branchId: "b1", requestor: "alice",
      type: "hypothesis_confirm", reason: "R1", status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await manager.request({
      approvalId: "a2", projectId: "p1", branchId: "b1", requestor: "bob",
      type: "submission", reason: "R2", status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const pending = await manager.list("p1", "PENDING");
    expect(pending.length).toBe(2);
  });
});
