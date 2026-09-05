import * as Effect from "effect/Effect";
import { ObjectStore } from "@persistence/object-store";

export interface RetrievalOptions {
  maxResults?: number;
  direction?: "SUPPORTING" | "CONTRADICTING";
}

export interface RetrievalResult {
  evidence: Array<Record<string, unknown>>;
  knowledge: Array<Record<string, unknown>>;
}

export class ContextRetriever {
  constructor(private store: ObjectStore) {}

  async retrieve(
    hypothesisId: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const maxResults = options.maxResults ?? 50;

    // Retrieve evidence
    const allEvidence = await Effect.runPromise(this.store.list("Evidence"));
    let evidence = allEvidence.filter(
      (e: Record<string, unknown>) => e.hypothesisId === hypothesisId
    );

    if (options.direction) {
      evidence = evidence.filter(
        (e: Record<string, unknown>) => e.direction === options.direction
      );
    }

    evidence = evidence.slice(0, maxResults);

    // Retrieve related knowledge from same gap
    const firstEvidence = evidence[0] as Record<string, unknown> | undefined;
    const gapId = firstEvidence?.gapId;
    let knowledge: Array<Record<string, unknown>> = [];

    if (gapId) {
      const allKnowledge = await Effect.runPromise(this.store.list("KnowledgeItem"));
      knowledge = allKnowledge.filter(
        (k: Record<string, unknown>) => k.gapId === gapId
      ) as Array<Record<string, unknown>>;
      knowledge = knowledge.slice(0, maxResults);
    }

    return { evidence, knowledge };
  }

  async retrieveByProject(
    projectId: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const maxResults = options.maxResults ?? 50;

    const allEvidence = await Effect.runPromise(this.store.list("Evidence"));
    let evidence = allEvidence.filter(
      (e: Record<string, unknown>) => e.projectId === projectId
    ) as Array<Record<string, unknown>>;

    if (options.direction) {
      evidence = evidence.filter(
        (e) => e.direction === options.direction
      );
    }

    const allKnowledge = await Effect.runPromise(this.store.list("KnowledgeItem"));
    const knowledge = allKnowledge.filter(
      (k: Record<string, unknown>) => k.projectId === projectId
    ) as Array<Record<string, unknown>>;

    return {
      evidence: evidence.slice(0, maxResults),
      knowledge: knowledge.slice(0, maxResults),
    };
  }

  async retrieveByGap(
    gapId: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const maxResults = options.maxResults ?? 50;

    const allKnowledge = await Effect.runPromise(this.store.list("KnowledgeItem"));
    const knowledge = allKnowledge.filter(
      (k: Record<string, unknown>) => k.gapId === gapId
    ) as Array<Record<string, unknown>>;

    const allEvidence = await Effect.runPromise(this.store.list("Evidence"));
    const evidence = allEvidence.filter(
      (e: Record<string, unknown>) => e.gapId === gapId
    ) as Array<Record<string, unknown>>;

    return {
      evidence: evidence.slice(0, maxResults),
      knowledge: knowledge.slice(0, maxResults),
    };
  }
}
