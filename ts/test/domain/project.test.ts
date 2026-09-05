import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { Project } from "@domain/objects/project";

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const decode = Schema.decodeSync(Project);

describe("Project", () => {
  it("parses valid project with ACTIVE status", () => {
    const now = new Date();
    const result = decode({
      projectId: generateUuid(),
      name: "My Research",
      description: "A research project",
      status: "ACTIVE",
      metadata: { author: "Alice" },
      createdAt: now,
      updatedAt: now,
    });
    expect(result.status).toBe("ACTIVE");
    expect(result.name).toBe("My Research");
    expect(result.metadata.author).toBe("Alice");
  });

  it("parses valid project with ARCHIVED status", () => {
    const now = new Date();
    const result = decode({
      projectId: generateUuid(),
      name: "Old Research",
      description: "",
      status: "ARCHIVED",
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });
    expect(result.status).toBe("ARCHIVED");
  });

  it("rejects invalid status", () => {
    const now = new Date();
    expect(() =>
      decode({
        projectId: generateUuid(),
        name: "Test",
        description: "",
        status: "INVALID" as any,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      })
    ).toThrow();
  });

  it("rejects empty name", () => {
    const now = new Date();
    expect(() =>
      decode({
        projectId: generateUuid(),
        name: "",
        description: "",
        status: "ACTIVE",
        metadata: {},
        createdAt: now,
        updatedAt: now,
      })
    ).toThrow();
  });

  it("rejects invalid UUID", () => {
    const now = new Date();
    expect(() =>
      decode({
        projectId: "not-a-uuid",
        name: "Test",
        description: "",
        status: "ACTIVE",
        metadata: {},
        createdAt: now,
        updatedAt: now,
      })
    ).toThrow();
  });

  it("accepts empty description", () => {
    const now = new Date();
    const result = decode({
      projectId: generateUuid(),
      name: "Test",
      description: "",
      status: "ACTIVE",
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });
    expect(result.description).toBe("");
  });

  it("accepts unknown metadata values", () => {
    const now = new Date();
    const result = decode({
      projectId: generateUuid(),
      name: "Test",
      description: "",
      status: "ACTIVE",
      metadata: { count: 42, flag: true, nested: { key: "val" } },
      createdAt: now,
      updatedAt: now,
    });
    expect(result.metadata.count).toBe(42);
    expect(result.metadata.flag).toBe(true);
    expect(typeof result.metadata.nested).toBe("object");
  });

  it("createdAt and updatedAt are Date objects", () => {
    const now = new Date();
    const result = decode({
      projectId: generateUuid(),
      name: "Test",
      description: "",
      status: "ACTIVE",
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });
    expect(result.createdAt instanceof Date).toBe(true);
    expect(result.updatedAt instanceof Date).toBe(true);
    expect(result.createdAt.getTime()).toBe(now.getTime());
  });
});
