import * as Effect from "effect/Effect";
import type { ObjectStore } from "@pf/core/persistence/object-store";
import { createEvidenceChain } from "@pf/schema/objects/evidence-chain";
import { generateUuid } from "./shared";

export interface ChainBuildInput {
  savedIds: Record<string, string[]>;
  phaseName: string;
}

export async function buildEvidenceChain(
  store: ObjectStore,
  projectId: string,
  input: ChainBuildInput,
): Promise<void> {
  const { savedIds, phaseName: _phaseName } = input;

  for (const evidenceId of savedIds.evidenceIds ?? []) {
    const eOpt = await Effect.runPromise(store.get(evidenceId, "Evidence"));
    if (eOpt.isSome()) {
      const evidence = eOpt.value as Record<string, unknown>;

      if (evidence.resultId) {
        await Effect.runPromise(
          store.save(createEvidenceChain({
            evidenceChainId: generateUuid(),
            projectId,
            sourceType: "Evidence",
            sourceId: evidenceId,
            targetType: "Result",
            targetId: evidence.resultId as string,
            relation: "derives-from",
          }) as Record<string, unknown>),
        );
      }

      const hyps = await Effect.runPromise(store.list("Hypothesis"));
      for (const h of hyps.filter((hyp: Record<string, unknown>) => (hyp as Record<string, unknown>).projectId === projectId)) {
        await Effect.runPromise(
          store.save(createEvidenceChain({
            evidenceChainId: generateUuid(),
            projectId,
            sourceType: "Evidence",
            sourceId: evidenceId,
            targetType: "Hypothesis",
            targetId: (h as Record<string, unknown>).hypothesisId as string,
            relation:
              (evidence.direction as string) === "SUPPORTING"
                ? "supports"
                : (evidence.direction as string) === "CONFLICTING"
                  ? "contradicts"
                  : "neutral",
          }) as Record<string, unknown>),
        );
      }
    }
  }

  for (const hypId of savedIds.hypothesisIds ?? []) {
    const hOpt = await Effect.runPromise(store.get(hypId, "Hypothesis"));
    if (hOpt.isSome()) {
      const hyp = hOpt.value as Record<string, unknown>;
      if (hyp.gapId) {
        await Effect.runPromise(
          store.save(createEvidenceChain({
            evidenceChainId: generateUuid(),
            projectId,
            sourceType: "Hypothesis",
            sourceId: hypId,
            targetType: "ResearchGap",
            targetId: hyp.gapId as string,
            relation: "addresses",
          }) as Record<string, unknown>),
        );
      }
    }
  }

  for (const knowledgeId of savedIds.knowledgeIds ?? []) {
    for (const citationId of savedIds.citationIds ?? []) {
      await Effect.runPromise(
        store.save(createEvidenceChain({
          evidenceChainId: generateUuid(),
          projectId,
          sourceType: "KnowledgeItem",
          sourceId: knowledgeId,
          targetType: "Citation",
          targetId: citationId,
          relation: "cites",
        }) as Record<string, unknown>),
      );
    }
  }
}
