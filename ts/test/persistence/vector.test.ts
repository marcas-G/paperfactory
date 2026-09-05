import { describe, it, expect, beforeEach } from "vitest";
import { VectorStore } from "@persistence/vector/store";

describe("VectorStore", () => {
  let store: VectorStore;

  beforeEach(() => {
    store = new VectorStore();
  });

  it("stores and retrieves vectors", async () => {
    const id = await store.add("doc-1", [0.1, 0.2, 0.3]);
    expect(id).toBe("doc-1");

    const results = await store.search([0.1, 0.2, 0.3], 1);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("doc-1");
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it("returns most similar vector", async () => {
    await store.add("close", [1, 0, 0]);
    await store.add("far", [0, 1, 0]);

    const results = await store.search([0.9, 0.1, 0], 2);
    expect(results[0].id).toBe("close");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("returns empty when no vectors stored", async () => {
    const results = await store.search([0.1, 0.2], 5);
    expect(results.length).toBe(0);
  });

  it("respects topK limit", async () => {
    for (let i = 0; i < 10; i++) {
      await store.add(`doc-${i}`, [i * 0.1, 0, 0]);
    }

    const results = await store.search([0.9, 0, 0], 3);
    expect(results.length).toBe(3);
  });

  it("deletes vectors", async () => {
    await store.add("doc-1", [0.1, 0.2, 0.3]);
    expect(await store.delete("doc-1")).toBe(true);
    expect(await store.delete("nonexistent")).toBe(false);

    const results = await store.search([0.1, 0.2, 0.3], 1);
    expect(results.length).toBe(0);
  });

  it("stores metadata with vectors", async () => {
    await store.add("doc-1", [0.5, 0.5, 0], { title: "Test Doc", source: "arxiv" });

    const results = await store.search([0.5, 0.5, 0], 1);
    expect(results[0].metadata?.title).toBe("Test Doc");
    expect(results[0].metadata?.source).toBe("arxiv");
  });
});
