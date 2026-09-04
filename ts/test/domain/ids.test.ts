import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import * as Ids from "../../src/domain/ids";

const validUUID = "00000000-0000-4000-a000-000000000000";

describe("Domain IDs", () => {
  it("all ID schemas accept valid UUIDs", () => {
    const idKeys = [
      "ProjectId", "BranchId", "QuestionId", "KnowledgeId", "GapId",
      "HypothesisId", "ProtocolId", "ExperimentId", "ResultId",
      "EvidenceId", "ClaimId", "FailureId", "ReportId", "SubmissionId",
      "ActionId", "TaskId", "ProposalId", "ApprovalId", "ContextBundleId",
      "SessionId", "AgentId", "ToolId", "BlockId", "WorkflowId", "HookId",
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idSchemas: Record<string, any> = Ids as any;
    for (const key of idKeys) {
      expect(Schema.decodeSync(idSchemas[key])(validUUID)).toBe(validUUID);
    }
  });

  it("all ID schemas reject invalid UUIDs", () => {
    const idKeys = Object.keys(Ids).filter((k) => k.endsWith("Id"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allIdSchemas: Record<string, any> = Ids as any;
    for (const key of idKeys) {
      expect(() => Schema.decodeSync(allIdSchemas[key])("not-a-uuid")).toThrow();
      expect(() => Schema.decodeSync(allIdSchemas[key])("")).toThrow();
    }
  });

  it("UUID format validation", () => {
    const decode = Schema.decodeSync(Ids.ProjectId);
    expect(decode("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(() => decode("550e8400-e29b-41d4-a716")).toThrow();
    expect(() => decode("not-a-uuid")).toThrow();
  });
});
