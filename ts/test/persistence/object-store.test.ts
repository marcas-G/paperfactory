import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryObjectStore, Option } from "@pf/core/persistence/object-store";
import { createQuestion, ResearchQuestion } from "@pf/schema/objects/question";
import { createKnowledgeItem, KnowledgeItem } from "@pf/schema/objects/knowledge";
import { createResearchGap, ResearchGap } from "@pf/schema/objects/gap";
import * as Effect from "effect/Effect";

describe("ObjectStore", () => {
  let store: InMemoryObjectStore;

  beforeEach(() => {
    store = new InMemoryObjectStore();
  });

  describe("save and get", () => {
    it("saves and retrieves a ResearchQuestion", async () => {
      const q = createQuestion({ questionId: "test-001" });
      const saved = await Effect.runPromise(store.save(q));
      expect(saved.questionId).toBe("test-001");

      const result = await Effect.runPromise(store.get("test-001", "ResearchQuestion"));
      expect(result.isSome()).toBe(true);
      expect(result.value?.title).toBe("Test Question");
    });

    it("returns None for non-existent object", async () => {
      const result = await Effect.runPromise(store.get("nonexistent", "ResearchQuestion"));
      expect(result.isNone()).toBe(true);
    });
  });

  describe("list", () => {
    it("lists all objects of a type", async () => {
      const q1 = createQuestion({ questionId: "q1", title: "Q1" });
      const q2 = createQuestion({ questionId: "q2", title: "Q2" });
      await Effect.runPromise(store.save(q1));
      await Effect.runPromise(store.save(q2));

      const items = await Effect.runPromise(store.list<ResearchQuestion>("ResearchQuestion"));
      expect(items).toHaveLength(2);
    });

    it("lists with filter", async () => {
      const q1 = createQuestion({ questionId: "q1", status: "DRAFT" });
      const q2 = createQuestion({ questionId: "q2", status: "ACTIVE" });
      await Effect.runPromise(store.save(q1));
      await Effect.runPromise(store.save(q2));

      const items = await Effect.runPromise(
        store.list<ResearchQuestion>("ResearchQuestion", (q) => q.status === "DRAFT")
      );
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe("DRAFT");
    });
  });

  describe("delete", () => {
    it("deletes an object", async () => {
      const q = createQuestion({ questionId: "q1" });
      await Effect.runPromise(store.save(q));
      const deleted = await Effect.runPromise(store.delete("q1", "ResearchQuestion"));
      expect(deleted).toBe(true);

      const result = await Effect.runPromise(store.get("q1", "ResearchQuestion"));
      expect(result.isNone()).toBe(true);
    });

    it("returns false for non-existent delete", async () => {
      const deleted = await Effect.runPromise(store.delete("nonexistent", "ResearchQuestion"));
      expect(deleted).toBe(false);
    });
  });

  describe("multiple types", () => {
    it("saves and retrieves different object types", async () => {
      const q = createQuestion({ questionId: "q1" });
      const k = createKnowledgeItem({ knowledgeId: "k1" });
      const g = createResearchGap({ gapId: "g1" });

      await Effect.runPromise(store.save(q));
      await Effect.runPromise(store.save(k));
      await Effect.runPromise(store.save(g));

      const questions = await Effect.runPromise(store.list<ResearchQuestion>("ResearchQuestion"));
      const knowledge = await Effect.runPromise(store.list<KnowledgeItem>("KnowledgeItem"));
      const gaps = await Effect.runPromise(store.list<ResearchGap>("ResearchGap"));

      expect(questions).toHaveLength(1);
      expect(knowledge).toHaveLength(1);
      expect(gaps).toHaveLength(1);
    });
  });
});

describe("Option", () => {
  it("creates some", () => {
    const opt = Option.some(42);
    expect(opt.isSome()).toBe(true);
    expect(opt.value).toBe(42);
  });

  it("creates none", () => {
    const opt = Option.none<number>();
    expect(opt.isNone()).toBe(true);
    expect(opt.value).toBeNull();
  });

  it("maps some", () => {
    const result = Option.some(42).map((x) => x * 2);
    expect(result.value).toBe(84);
  });

  it("maps none", () => {
    const result = Option.none<number>().map((x) => x * 2);
    expect(result.isNone()).toBe(true);
  });

  it("getOrThrow throws on none", () => {
    expect(() => Option.none<number>().getOrThrow()).toThrow();
  });

  it("getOrThrow returns value on some", () => {
    expect(Option.some(42).getOrThrow()).toBe(42);
  });
});
