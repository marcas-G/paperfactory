import * as Effect from "effect/Effect";
import { ObjectStore } from "@persistence/object-store";
import { VectorStore } from "@persistence/vector/store";

export interface RetrievalOptions {
  maxResults?: number;
  direction?: "SUPPORTING" | "CONTRADICTING";
}

export interface RetrievalResult {
  evidence: Array<Record<string, unknown>>;
  knowledge: Array<Record<string, unknown>>;
}

export class ContextRetriever {
  private vectorStore: VectorStore;

  constructor(private store: ObjectStore) {
    this.vectorStore = new VectorStore();
  }

  async indexKnowledge(knowledge: Array<Record<string, unknown>>): Promise<void> {
    for (const item of knowledge) {
      const text = (item.summary as string) || (item.content as string) || "";
      const vector = this.simpleEmbed(text);
      await this.vectorStore.add(item.knowledgeId as string, vector, {
        summary: item.summary,
        sourceType: item.sourceType,
      });
    }
  }

  async semanticSearch(query: string, topK: number = 5): Promise<Array<Record<string, unknown>>> {
    const queryVector = this.simpleEmbed(query);
    const hits = await this.vectorStore.search(queryVector, topK);

    const results: Array<Record<string, unknown>> = [];
    for (const hit of hits) {
      const opt = await Effect.runPromise(this.store.get(hit.id, "KnowledgeItem"));
      if (!opt.isNone()) {
        results.push(opt.value as Record<string, unknown>);
      }
    }
    return results;
  }

  private simpleEmbed(text: string): number[] {
    const hash = this.fnv1a(text);
    const vector: number[] = [];
    for (let i = 0; i < 16; i++) {
      vector.push(((hash >> (i * 2)) & 0xff) / 255);
    }
    return vector;
  }

  private fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

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
