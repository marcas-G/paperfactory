export interface ResearchState {
  hypotheses: unknown[];
  evidence: unknown[];
  results: unknown[];
  knowledgeItems: unknown[];
  submissions: unknown[];
  reports: unknown[];
}

export interface Context {
  hypotheses: unknown[];
  evidence: unknown[];
  results: unknown[];
  knowledgeItems: unknown[];
  submissions?: unknown[];
  reports?: unknown[];
}

const MODE_OBJECT_MAP: Record<string, string[]> = {
  FRAME: ["hypotheses", "knowledgeItems"],
  EXPLORE: ["knowledgeItems", "hypotheses", "evidence"],
  MAP: ["knowledgeItems", "evidence"],
  COMPARE: ["hypotheses", "knowledgeItems", "submissions"],
  FALSIFY: ["hypotheses", "evidence"],
  DIAGNOSE: ["results", "evidence"],
  DISCRIMINATE: ["hypotheses", "evidence"],
  VERIFY: ["results", "evidence", "knowledgeItems"],
  SYNTHESIZE: ["evidence", "knowledgeItems", "hypotheses"],
  DECIDE: ["submissions", "evidence", "results"],
};

export const ContextCompiler = {
  compile(state: ResearchState, modeName: string): Context {
    const objects = MODE_OBJECT_MAP[modeName] || MODE_OBJECT_MAP.VERIFY;
    const context: Context = {
      hypotheses: [],
      evidence: [],
      results: [],
      knowledgeItems: [],
    };

    for (const key of objects) {
      const stateKey = key as keyof ResearchState;
      if (stateKey in state) {
        context[key as keyof Context] = state[stateKey] as unknown[];
      }
    }

    return context;
  },
};
