import { getCognitiveModeByName } from "@cognition/modes";

export interface Context {
  hypotheses: unknown[];
  evidence: unknown[];
  results: unknown[];
  knowledgeItems: unknown[];
  submissions?: unknown[];
  reports?: unknown[];
}

function formatContextSummary(context: Context): string {
  const parts: string[] = [];

  if (context.hypotheses.length > 0) {
    const hypothesisSummaries = context.hypotheses
      .map((h: any) => h.statement || JSON.stringify(h))
      .join("\n");
    parts.push(`Hypotheses:\n${hypothesisSummaries}`);
  }

  if (context.evidence.length > 0) {
    const evidenceSummaries = context.evidence
      .map((e: any) => e.summary || JSON.stringify(e))
      .join("\n");
    parts.push(`Evidence:\n${evidenceSummaries}`);
  }

  if (context.results.length > 0) {
    const resultSummaries = context.results
      .map((r: any) => r.summary || JSON.stringify(r))
      .join("\n");
    parts.push(`Results:\n${resultSummaries}`);
  }

  if (context.knowledgeItems.length > 0) {
    const knowledgeSummaries = context.knowledgeItems
      .map((k: any) => k.summary || JSON.stringify(k))
      .join("\n");
    parts.push(`Knowledge:\n${knowledgeSummaries}`);
  }

  return parts.join("\n\n");
}

export const PromptAssembler = {
  assemble(context: Context, modeName: string): string {
    const mode = getCognitiveModeByName(modeName);
    if (!mode) {
      return `[${modeName}] Unknown cognitive mode`;
    }

    const contextSummary = formatContextSummary(context);

    return [
      `=== Cognitive Mode: ${modeName} ===`,
      "",
      `Instructions: ${mode.instructions}`,
      "",
      contextSummary ? `## Current Context\n${contextSummary}` : "## Current Context\nNo relevant objects in context.",
    ].join("\n");
  },
};
