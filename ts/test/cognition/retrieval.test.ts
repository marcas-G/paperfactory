import { describe, it, expect, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import { ContextRetriever } from "@cognition/retrieval";
import { InMemoryObjectStore } from "@persistence/object-store";

describe("ContextRetriever", () => {
  let store: InMemoryObjectStore;
  let retriever: ContextRetriever;

  beforeEach(() => {
    store = new InMemoryObjectStore();
    retriever = new ContextRetriever(store);
  });

  it("retrieves evidence for a project", async () => {
    const projectId = "00000000-0000-4000-a000-000000000001";

    await Effect.runPromise(
      store.save({
        evidenceId: "ev-001",
        projectId,
        branchId: "00000000-0000-4000-a000-000000000000",
        resultId: null,
        summary: "Evidence A",
        direction: "SUPPORTING",
        status: "VALIDATED",
        strength: 0.8,
        scope: "",
        metadata: {},
        createdAt: new Date(),
      })
    );
    await Effect.runPromise(
      store.save({
        evidenceId: "ev-002",
        projectId,
        branchId: "00000000-0000-4000-a000-000000000000",
        resultId: null,
        summary: "Evidence B",
        direction: "SUPPORTING",
        status: "VALIDATED",
        strength: 0.9,
        scope: "",
        metadata: {},
        createdAt: new Date(),
      })
    );

    const result = await retriever.retrieveByProject(projectId, { maxResults: 10 });
    expect(result.evidence.length).toBe(2);
    expect(result.evidence[0].evidenceId).toBe("ev-001");
  });

  it("retrieves knowledge items for a project", async () => {
    const projectId = "00000000-0000-4000-a000-000000000001";

    await Effect.runPromise(
      store.save({
        knowledgeId: "k1",
        projectId,
        branchId: "00000000-0000-4000-a000-000000000000",
        summary: "Knowledge about X",
        sourceType: "paper",
        sourceIds: [],
        status: "DRAFT",
        certaintyLevel: 0.9,
        questionIds: [],
        tags: [],
        metadata: {},
        createdAt: new Date(),
      })
    );

    const result = await retriever.retrieveByProject(projectId, { maxResults: 10 });
    expect(result.knowledge.length).toBe(1);
    expect(result.knowledge[0].knowledgeId).toBe("k1");
  });

  it("returns empty result when no matches", async () => {
    const result = await retriever.retrieveByProject(
      "00000000-0000-4000-a000-000000000099",
      { maxResults: 10 }
    );
    expect(result.evidence.length).toBe(0);
    expect(result.knowledge.length).toBe(0);
  });

  it("respects maxResults limit", async () => {
    const projectId = "00000000-0000-4000-a000-000000000001";

    for (let i = 0; i < 5; i++) {
      await Effect.runPromise(
        store.save({
          evidenceId: `ev-${i}`,
          projectId,
          branchId: "00000000-0000-4000-a000-000000000000",
          resultId: null,
          summary: `Evidence ${i}`,
          direction: "SUPPORTING",
          status: "VALIDATED",
          strength: 0.5,
          scope: "",
          metadata: {},
          createdAt: new Date(),
        })
      );
    }

    const result = await retriever.retrieveByProject(projectId, { maxResults: 2 });
    expect(result.evidence.length).toBe(2);
  });

  it("filters evidence by direction", async () => {
    const projectId = "00000000-0000-4000-a000-000000000001";

    await Effect.runPromise(
      store.save({
        evidenceId: "ev-s",
        projectId,
        branchId: "00000000-0000-4000-a000-000000000000",
        resultId: null,
        summary: "Supporting",
        direction: "SUPPORTING",
        status: "VALIDATED",
        strength: 0.8,
        scope: "",
        metadata: {},
        createdAt: new Date(),
      })
    );
    await Effect.runPromise(
      store.save({
        evidenceId: "ev-c",
        projectId,
        branchId: "00000000-0000-4000-a000-000000000000",
        resultId: null,
        summary: "Conflicting",
        direction: "CONFLICTING",
        status: "VALIDATED",
        strength: 0.6,
        scope: "",
        metadata: {},
        createdAt: new Date(),
      })
    );

    const result = await retriever.retrieveByProject(projectId, {
      maxResults: 10,
      direction: "SUPPORTING",
    });
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].direction).toBe("SUPPORTING");
  });
});
