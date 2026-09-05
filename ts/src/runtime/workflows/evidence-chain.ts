import * as Effect from "effect/Effect";
import type { ObjectStore } from "@persistence/object-store";
import { createEvidenceChain } from "@domain/objects/evidence-chain";

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
      const evidence = eOpt.value as any;

      if (evidence.resultId) {
        await Effect.runPromise(
          store.save(createEvidenceChain({
            evidenceChainId: generateUuid(),
            projectId,
            sourceType: "Evidence",
            sourceId: evidenceId,
            targetType: "Result",
            targetId: evidence.resultId,
            relation: "derives-from",
          }) as any),
        );
      }

      const hyps = await Effect.runPromise(store.list("Hypothesis"));
      for (const h of hyps.filter((hyp: any) => hyp.projectId === projectId)) {
        await Effect.runPromise(
          store.save(createEvidenceChain({
            evidenceChainId: generateUuid(),
            projectId,
            sourceType: "Evidence",
            sourceId: evidenceId,
            targetType: "Hypothesis",
            targetId: (h as any).hypothesisId,
            relation:
              (evidence.direction as string) === "SUPPORTING"
                ? "supports"
                : (evidence.direction as string) === "CONFLICTING"
                  ? "contradicts"
                  : "neutral",
          }) as any),
        );
      }
    }
  }

  for (const hypId of savedIds.hypothesisIds ?? []) {
    const hOpt = await Effect.runPromise(store.get(hypId, "Hypothesis"));
    if (hOpt.isSome()) {
      const hyp = hOpt.value as any;
      if (hyp.gapId) {
        await Effect.runPromise(
          store.save(createEvidenceChain({
            evidenceChainId: generateUuid(),
            projectId,
            sourceType: "Hypothesis",
            sourceId: hypId,
            targetType: "ResearchGap",
            targetId: hyp.gapId,
            relation: "addresses",
          }) as any),
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
        }) as any),
      );
    }
  }
}

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
