import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import {
  ResearchQuestion,
  QuestionStatus,
  createQuestion,
} from "../../../src/domain/objects/question";

const validUUID = "00000000-0000-4000-a000-000000000000";
const anotherUUID = "11111111-1111-4111-a111-111111111111";

describe("ResearchQuestion Schema", () => {
  const decode = Schema.decodeSync(ResearchQuestion);

  it("accepts valid question", () => {
    const q = createQuestion();
    expect(q.questionId).toBe(validUUID);
    expect(q.title).toBe("Test Question");
    expect(q.status).toBe("DRAFT");
    expect(q.relatedKnowledgeIds).toEqual([]);
    expect(q.parentQuestionId).toBeNull();
    expect(q.metadata).toEqual({});
    expect(q.createdAt).toBeInstanceOf(Date);
    expect(q.updatedAt).toBeInstanceOf(Date);
  });

  it("validates through Schema decode", () => {
    const q = decode(createQuestion());
    expect(q.title).toBe("Test Question");
  });

  it("requires non-empty title", () => {
    expect(() =>
      decode({
        ...createQuestion(),
        title: "",
      })
    ).toThrow();
  });

  it("requires non-empty statement", () => {
    expect(() =>
      decode({
        ...createQuestion(),
        statement: "",
      })
    ).toThrow();
  });

  it("requires non-empty domain", () => {
    expect(() =>
      decode({
        ...createQuestion(),
        domain: "",
      })
    ).toThrow();
  });

  it("validates status enum", () => {
    expect(() =>
      decode({
        ...createQuestion(),
        status: "INVALID_STATUS" as never,
      })
    ).toThrow();
  });

  it("accepts all valid status values", () => {
    for (const status of ["DRAFT", "ACTIVE", "SCOPED", "ARCHIVED"] as const) {
      const q = decode({
        ...createQuestion(),
        status,
      });
      expect(q.status).toBe(status);
    }
  });

  it("accepts related knowledge IDs", () => {
    const q = decode({
      ...createQuestion(),
      relatedKnowledgeIds: [anotherUUID],
    });
    expect(q.relatedKnowledgeIds).toEqual([anotherUUID]);
  });

  it("accepts parent question ID", () => {
    const q = decode({
      ...createQuestion(),
      parentQuestionId: anotherUUID,
    });
    expect(q.parentQuestionId).toBe(anotherUUID);
  });

  it("accepts custom metadata", () => {
    const q = decode({
      ...createQuestion(),
      metadata: { key1: "value1", key2: 42 },
    });
    expect(q.metadata).toEqual({ key1: "value1", key2: 42 });
  });

  it("validates UUID format", () => {
    expect(() =>
      decode({
        ...createQuestion(),
        questionId: "not-a-uuid",
      })
    ).toThrow();
  });

  it("factory with override", () => {
    const q = createQuestion({
      title: "Custom Title",
      status: "ACTIVE",
      domain: "Custom Domain",
    });
    expect(q.title).toBe("Custom Title");
    expect(q.status).toBe("ACTIVE");
    expect(q.domain).toBe("Custom Domain");
    expect(q.questionId).toBe(validUUID);
  });

  it("QuestionStatus enum values", () => {
    const valid = Schema.decodeSync(QuestionStatus)("DRAFT");
    expect(valid).toBe("DRAFT");
    expect(() =>
      Schema.decodeSync(QuestionStatus)("INVALID" as never)
    ).toThrow();
  });
});
