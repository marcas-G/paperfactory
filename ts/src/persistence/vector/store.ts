export interface VectorEntry {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export interface SearchHit {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export class VectorStore {
  private entries: Map<string, VectorEntry> = new Map();

  async add(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<string> {
    this.entries.set(id, { id, vector, metadata });
    return id;
  }

  async search(query: number[], topK: number = 5): Promise<SearchHit[]> {
    const hits: Array<{ entry: VectorEntry; score: number }> = [];

    for (const [, entry] of this.entries) {
      const score = this.cosineSimilarity(query, entry.vector);
      hits.push({ entry, score });
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK).map(({ entry, score }) => ({
      id: entry.id,
      score,
      metadata: entry.metadata,
    }));
  }

  async delete(id: string): Promise<boolean> {
    return this.entries.delete(id);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
  }
}
