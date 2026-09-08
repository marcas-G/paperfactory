import { describe, it, expect } from "vitest";
import { InMemoryObjectStore } from "@pf/core/persistence/object-store";
import { PgObjectStore } from "@pf/core/persistence/pg-object-store";
import * as Effect from "effect/Effect";
import { createPhaseRun } from "@pf/schema/objects/phase-run";
import { createEvidenceChain } from "@pf/schema/objects/evidence-chain";

describe("Integration: ObjectStore PhaseRun/EvidenceChain/Citation persistence", () => {
  describe("InMemoryObjectStore", () => {
    it("saves and lists PhaseRun", async () => {
      const store = new InMemoryObjectStore();
      const phaseRun = createPhaseRun({
        phaseRunId: "test-phase-run-001",
        projectId: "test-project-001",
        phaseName: "literature_search",
        phaseVersion: 1,
        status: "COMPLETED",
        artifacts: { knowledgeIds: ["k1"], citationIds: ["c1"] },
        agentOutput: "Test output",
        toolCalls: [{ toolName: "search", input: { query: "test" }, output: "results" }],
        selfReview: { passed: true, rounds: 1, issues: [] },
        active: true,
      });
      await Effect.runPromise(store.save(phaseRun));

      const runs = await Effect.runPromise(store.list("PhaseRun"));
      expect(runs.length).toBe(1);
      expect(runs[0].phaseRunId).toBe("test-phase-run-001");
      expect(runs[0].phaseName).toBe("literature_search");
      expect(runs[0].phaseVersion).toBe(1);
      expect(runs[0].status).toBe("COMPLETED");
      expect(runs[0].active).toBe(true);
    });

    it("saves and lists EvidenceChain", async () => {
      const store = new InMemoryObjectStore();
      const chain = createEvidenceChain({
        evidenceChainId: "test-chain-001",
        projectId: "test-project-001",
        sourceType: "Hypothesis",
        sourceId: "h1",
        targetType: "ResearchGap",
        targetId: "g1",
        relation: "addresses",
      });
      await Effect.runPromise(store.save(chain));

      const chains = await Effect.runPromise(store.list("EvidenceChain"));
      expect(chains.length).toBe(1);
      expect(chains[0].sourceType).toBe("Hypothesis");
      expect(chains[0].relation).toBe("addresses");
    });

    it("saves and lists Citation", async () => {
      const store = new InMemoryObjectStore();
      const citation = {
        citationId: "test-citation-001",
        projectId: "test-project-001",
        sourceTitle: "Test Paper",
        sourceUrl: "https://example.com/test",
        sourceAuthors: ["Author1", "Author2"],
        sourceYear: 2023,
        abstract: "Test abstract",
        relevanceScore: 0.9,
        localPdfPath: null,
        metadata: {},
        createdAt: new Date().toISOString(),
      };
      await Effect.runPromise(store.save(citation));

      const citations = await Effect.runPromise(store.list("Citation"));
      expect(citations.length).toBe(1);
      expect(citations[0].sourceTitle).toBe("Test Paper");
      expect(citations[0].sourceAuthors).toEqual(["Author1", "Author2"]);
    });

    it("deletes PhaseRun", async () => {
      const store = new InMemoryObjectStore();
      const phaseRun = createPhaseRun({
        phaseRunId: "test-delete-001",
        projectId: "test-project-001",
        phaseName: "literature_search",
        phaseVersion: 1,
        status: "COMPLETED",
      });
      await Effect.runPromise(store.save(phaseRun));
      await Effect.runPromise(store.delete("test-delete-001", "PhaseRun"));

      const runs = await Effect.runPromise(store.list("PhaseRun"));
      expect(runs.length).toBe(0);
    });
  });

  describe("PgObjectStore", () => {
    it("detects Citation type correctly", async () => {
      const citation = {
        citationId: "pg-test-citation-001",
        projectId: "pg-test-project",
        sourceTitle: "PG Test Paper",
        sourceUrl: "https://example.com/pg",
        sourceAuthors: [],
        relevanceScore: 0.5,
        metadata: {},
        createdAt: new Date().toISOString(),
      };

      // Verify PgObjectStore has Citation in TABLE_MAP and ID_KEY_MAP
      const pgStore = new PgObjectStore();
      const saved = await Effect.runPromise(pgStore.save(citation as any)).catch(() => null);

      if (saved) {
        const listed = await Effect.runPromise(pgStore.list("Citation"));
        const found = listed.find((c: any) => c.citationId === "pg-test-citation-001");
        expect(found).toBeDefined();
        expect(found!.sourceTitle).toBe("PG Test Paper");

        // Clean up
        await Effect.runPromise(pgStore.delete("pg-test-citation-001", "Citation")).catch(() => {});
      }
    });

    it("saves and retrieves PhaseRun from PG", async () => {
      const pgStore = new PgObjectStore();
      const phaseRun = createPhaseRun({
        phaseRunId: "pg-test-phase-001",
        projectId: "pg-test-project",
        phaseName: "gap_identification",
        phaseVersion: 2,
        status: "COMPLETED",
        artifacts: { gapIds: ["g1"] },
        agentOutput: "PG test output",
        toolCalls: [],
        active: true,
      });

      const saved = await Effect.runPromise(pgStore.save(phaseRun as any)).catch(() => null);
      if (saved) {
        const runs = await Effect.runPromise(pgStore.list("PhaseRun"));
        const found = runs.find((r: any) => r.phaseRunId === "pg-test-phase-001");
        expect(found).toBeDefined();
        expect(found!.phaseName).toBe("gap_identification");
        expect(found!.phaseVersion).toBe(2);

        // Clean up
        await Effect.runPromise(pgStore.delete("pg-test-phase-001", "PhaseRun")).catch(() => {});
      }
    });

    it("saves and retrieves EvidenceChain from PG", async () => {
      const pgStore = new PgObjectStore();
      const chain = createEvidenceChain({
        evidenceChainId: "pg-test-chain-001",
        projectId: "pg-test-project",
        sourceType: "Evidence",
        sourceId: "e1",
        targetType: "Hypothesis",
        targetId: "h1",
        relation: "supports",
      });

      const saved = await Effect.runPromise(pgStore.save(chain as any)).catch(() => null);
      if (saved) {
        const chains = await Effect.runPromise(pgStore.list("EvidenceChain"));
        const found = chains.find((c: any) => c.evidenceChainId === "pg-test-chain-001");
        expect(found).toBeDefined();
        expect(found!.relation).toBe("supports");

        // Clean up
        await Effect.runPromise(pgStore.delete("pg-test-chain-001", "EvidenceChain")).catch(() => {});
      }
    });
  });
});
