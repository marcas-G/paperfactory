import { describe, it, expect, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import { InMemoryObjectStore } from "@pf/core/persistence/object-store";
import { createEvidence } from "@pf/schema/objects/evidence";
import { createHypothesis } from "@pf/schema/objects/hypothesis";
import { buildEvidenceChain } from "@pf/research/evidence-chain";

describe("buildEvidenceChain", () => {
  let store: InMemoryObjectStore;
  const projectId = "22222222-2222-4222-a222-222222222222";

  beforeEach(() => {
    store = new InMemoryObjectStore();
  });

  it("creates Evidence->Result derives-from links", async () => {
    const evidenceId = "11111111-1111-4111-a111-111111111111";
    const resultId = "33333333-3333-4333-a333-333333333333";

    await Effect.runPromise(store.save(createEvidence({
      evidenceId,
      projectId,
      branchId: "00000000-0000-4000-a000-000000000000",
      resultId,
      direction: "SUPPORTING",
    })));

    await buildEvidenceChain(store, projectId, {
      savedIds: {
        evidenceIds: [evidenceId],
      },
      phaseName: "experiment_execution",
    });

    const chains = await Effect.runPromise(store.list("EvidenceChain"));
    const derivesFromChain = chains.find(
      (c: any) =>
        c.sourceType === "Evidence" &&
        c.sourceId === evidenceId &&
        c.targetType === "Result" &&
        c.targetId === resultId &&
        c.relation === "derives-from",
    );
    expect(derivesFromChain).toBeDefined();
  });

  it("creates Evidence->Hypothesis support/contradict/neutral links based on direction", async () => {
    const supportingEvidenceId = "11111111-1111-4111-a111-111111111111";
    const conflictingEvidenceId = "11111111-1111-4111-a111-111111111112";
    const neutralEvidenceId = "11111111-1111-4111-a111-111111111113";
    const hypothesisId = "44444444-4444-4444-a444-444444444444";
    const gapId = "55555555-5555-4555-a555-555555555555";

    await Effect.runPromise(store.save(createEvidence({
      evidenceId: supportingEvidenceId,
      projectId,
      branchId: "00000000-0000-4000-a000-000000000000",
      resultId: null,
      direction: "SUPPORTING",
    })));
    await Effect.runPromise(store.save(createEvidence({
      evidenceId: conflictingEvidenceId,
      projectId,
      branchId: "00000000-0000-4000-a000-000000000000",
      resultId: null,
      direction: "CONFLICTING",
    })));
    await Effect.runPromise(store.save(createEvidence({
      evidenceId: neutralEvidenceId,
      projectId,
      branchId: "00000000-0000-4000-a000-000000000000",
      resultId: null,
      direction: "NEUTRAL",
    })));
    await Effect.runPromise(store.save(createHypothesis({
      hypothesisId,
      projectId,
      branchId: "00000000-0000-4000-a000-000000000000",
      gapId,
    })));

    await buildEvidenceChain(store, projectId, {
      savedIds: {
        evidenceIds: [supportingEvidenceId, conflictingEvidenceId, neutralEvidenceId],
      },
      phaseName: "evidence_assessment",
    });

    const chains = await Effect.runPromise(store.list("EvidenceChain"));

    const supportsChain = chains.find(
      (c: any) =>
        c.sourceType === "Evidence" &&
        c.sourceId === supportingEvidenceId &&
        c.targetType === "Hypothesis" &&
        c.targetId === hypothesisId &&
        c.relation === "supports",
    );
    expect(supportsChain).toBeDefined();

    const contradictsChain = chains.find(
      (c: any) =>
        c.sourceType === "Evidence" &&
        c.sourceId === conflictingEvidenceId &&
        c.targetType === "Hypothesis" &&
        c.targetId === hypothesisId &&
        c.relation === "contradicts",
    );
    expect(contradictsChain).toBeDefined();

    const neutralChain = chains.find(
      (c: any) =>
        c.sourceType === "Evidence" &&
        c.sourceId === neutralEvidenceId &&
        c.targetType === "Hypothesis" &&
        c.targetId === hypothesisId &&
        c.relation === "neutral",
    );
    expect(neutralChain).toBeDefined();
  });

  it("creates Hypothesis->ResearchGap addresses links", async () => {
    const hypothesisId = "44444444-4444-4444-a444-444444444444";
    const gapId = "55555555-5555-4555-a555-555555555555";

    await Effect.runPromise(store.save(createHypothesis({
      hypothesisId,
      projectId,
      branchId: "00000000-0000-4000-a000-000000000000",
      gapId,
    })));

    await buildEvidenceChain(store, projectId, {
      savedIds: {
        hypothesisIds: [hypothesisId],
      },
      phaseName: "hypothesis_generation",
    });

    const chains = await Effect.runPromise(store.list("EvidenceChain"));
    const addressesChain = chains.find(
      (c: any) =>
        c.sourceType === "Hypothesis" &&
        c.sourceId === hypothesisId &&
        c.targetType === "ResearchGap" &&
        c.targetId === gapId &&
        c.relation === "addresses",
    );
    expect(addressesChain).toBeDefined();
  });

  it("creates KnowledgeItem->Citation cites links", async () => {
    const knowledgeId = "66666666-6666-4666-a666-666666666666";
    const citationId1 = "77777777-7777-4777-a777-777777777777";
    const citationId2 = "77777777-7777-4777-a777-777777777778";

    await buildEvidenceChain(store, projectId, {
      savedIds: {
        knowledgeIds: [knowledgeId],
        citationIds: [citationId1, citationId2],
      },
      phaseName: "literature_search",
    });

    const chains = await Effect.runPromise(store.list("EvidenceChain"));
    const cites1 = chains.find(
      (c: any) =>
        c.sourceType === "KnowledgeItem" &&
        c.sourceId === knowledgeId &&
        c.targetType === "Citation" &&
        c.targetId === citationId1 &&
        c.relation === "cites",
    );
    const cites2 = chains.find(
      (c: any) =>
        c.sourceType === "KnowledgeItem" &&
        c.sourceId === knowledgeId &&
        c.targetType === "Citation" &&
        c.targetId === citationId2 &&
        c.relation === "cites",
    );
    expect(cites1).toBeDefined();
    expect(cites2).toBeDefined();
  });

  it("skips missing evidence gracefully", async () => {
    await buildEvidenceChain(store, projectId, {
      savedIds: {
        evidenceIds: ["00000000-0000-4000-a000-000000000000"],
      },
      phaseName: "experiment_execution",
    });

    const chains = await Effect.runPromise(store.list("EvidenceChain"));
    expect(chains.length).toBe(0);
  });

  it("skips hypothesis without gapId", async () => {
    const hypothesisId = "44444444-4444-4444-a444-444444444444";

    await Effect.runPromise(store.save(createHypothesis({
      hypothesisId,
      projectId,
      branchId: "00000000-0000-4000-a000-000000000000",
      gapId: null,
    })));

    await buildEvidenceChain(store, projectId, {
      savedIds: {
        hypothesisIds: [hypothesisId],
      },
      phaseName: "hypothesis_generation",
    });

    const chains = await Effect.runPromise(store.list("EvidenceChain"));
    const gapLinks = chains.filter(
      (c: any) => c.targetType === "ResearchGap",
    );
    expect(gapLinks.length).toBe(0);
  });

  it("handles empty savedIds", async () => {
    await buildEvidenceChain(store, projectId, {
      savedIds: {},
      phaseName: "literature_search",
    });

    const chains = await Effect.runPromise(store.list("EvidenceChain"));
    expect(chains.length).toBe(0);
  });

  it("only links hypotheses in the same project", async () => {
    const evidenceId = "11111111-1111-4111-a111-111111111111";
    const otherProjectId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const otherHypothesisId = "44444444-4444-4444-a444-444444444444";
    const sameHypothesisId = "44444444-4444-4444-a444-444444444445";

    await Effect.runPromise(store.save(createEvidence({
      evidenceId,
      projectId,
      branchId: "00000000-0000-4000-a000-000000000000",
      resultId: null,
      direction: "SUPPORTING",
    })));
    await Effect.runPromise(store.save(createHypothesis({
      hypothesisId: otherHypothesisId,
      projectId: otherProjectId,
      branchId: "00000000-0000-4000-a000-000000000000",
      gapId: "55555555-5555-4555-a555-555555555555",
    })));
    await Effect.runPromise(store.save(createHypothesis({
      hypothesisId: sameHypothesisId,
      projectId,
      branchId: "00000000-0000-4000-a000-000000000000",
      gapId: "55555555-5555-4555-a555-555555555555",
    })));

    await buildEvidenceChain(store, projectId, {
      savedIds: {
        evidenceIds: [evidenceId],
      },
      phaseName: "evidence_assessment",
    });

    const chains = await Effect.runPromise(store.list("EvidenceChain"));
    const linksToOtherProject = chains.find(
      (c: any) => c.targetId === otherHypothesisId,
    );
    expect(linksToOtherProject).toBeUndefined();

    const linksToSameProject = chains.find(
      (c: any) => c.targetId === sameHypothesisId,
    );
    expect(linksToSameProject).toBeDefined();
  });
});
