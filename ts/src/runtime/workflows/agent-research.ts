import * as Effect from "effect/Effect";
import type { ObjectStore } from "@persistence/object-store";
import type { EventStore } from "@persistence/event-store";
import type { ResearchController } from "@control/controller";
import type { Provider, ToolDefinition } from "@runtime/provider";
import type { ToolRegistry } from "@runtime/tools/registry";
import type { AgentEvent } from "@runtime/agent/loop";
import { PHASE_CONTRACTS, runPhase } from "./phase-contracts";

export interface ResearchRunContext {
  projectId: string;
  branchId: string;
  question: string;
  provider: Provider;
  objectStore: ObjectStore;
  eventStore: EventStore;
  controller: ResearchController;
  toolRegistry: ToolRegistry;
  toolDefinitions: ReadonlyArray<ToolDefinition>;
  onEvent: (event: AgentEvent) => void;
  shouldStop: () => boolean;
  requiresReview?: boolean;
  startFromPhase?: string;
}

export async function runAgentDrivenResearch(
  ctx: ResearchRunContext,
): Promise<{
  phases: Array<{
    phaseName: string;
    status: string;
    output: Record<string, unknown> | null;
    rawOutput: string;
    savedIds: Record<string, string[]>;
    toolCalls: Array<{ toolName: string; input: Record<string, unknown>; output: string }>;
  }>;
  knowledgeItems: Array<Record<string, unknown>>;
  hypotheses: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  experiments: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  citations: Array<Record<string, unknown>>;
  researchGaps: string;
  hypothesisStatements: string[];
}> {
  const { onEvent, shouldStop, objectStore, controller } = ctx;

  const allKnowledge: Array<Record<string, unknown>> = [];
  const allHypotheses: Array<Record<string, unknown>> = [];
  const allEvidence: Array<Record<string, unknown>> = [];
  const allExperiments: Array<Record<string, unknown>> = [];
  const allResults: Array<Record<string, unknown>> = [];
  const allReports: Array<Record<string, unknown>> = [];
  const allCitations: Array<Record<string, unknown>> = [];
  const phaseResults = [];
  let researchGaps = "";
  const hypothesisStatements: string[] = [];

  const contractsToRun = ctx.startFromPhase
    ? PHASE_CONTRACTS.filter((c) => {
        const idx = PHASE_CONTRACTS.findIndex((p) => p.name === ctx.startFromPhase);
        return PHASE_CONTRACTS.findIndex((p) => p.name === c.name) >= idx;
      })
    : PHASE_CONTRACTS;

  for (const contract of contractsToRun) {
    if (shouldStop()) {
      onEvent({ type: "phase:progress", content: `阶段 ${contract.label} 被跳过`, phase: contract.name, timestamp: new Date().toISOString() });
      continue;
    }

    const result = await runPhase(
      contract,
      objectStore,
      ctx.provider,
      ctx.toolRegistry,
      ctx.toolDefinitions,
      ctx.projectId,
      ctx.question,
      onEvent,
      shouldStop
    );

    phaseResults.push({
      phaseName: result.phaseName,
      status: result.status,
      output: result.output,
      rawOutput: result.rawOutput,
      savedIds: result.savedIds,
      toolCalls: result.toolCalls,
    });

    // Collect saved objects
    const collect = async (ids: string[], type: string, arr: Array<Record<string, unknown>>, extra?: (item: any) => void) => {
      for (const id of ids) {
        const item = await Effect.runPromise(objectStore.get(id, type));
        if (item.isSome()) {
          arr.push(item.value as Record<string, unknown>);
          extra?.(item.value);
        }
      }
    };
    if (result.savedIds.knowledgeIds) collect(result.savedIds.knowledgeIds, "KnowledgeItem", allKnowledge);
    if (result.savedIds.hypothesisIds) collect(result.savedIds.hypothesisIds, "Hypothesis", allHypotheses, (v) => hypothesisStatements.push((v as any).statement ?? ""));
    if (result.savedIds.evidenceIds) collect(result.savedIds.evidenceIds, "Evidence", allEvidence);
    if (result.savedIds.experimentIds) collect(result.savedIds.experimentIds, "Experiment", allExperiments);
    if (result.savedIds.resultIds) collect(result.savedIds.resultIds, "Result", allResults);
    if (result.savedIds.reportIds) collect(result.savedIds.reportIds, "Report", allReports);
    if (result.savedIds.citationIds) collect(result.savedIds.citationIds, "Citation", allCitations);

    // Extract research gaps
    if (contract.name === "gap_identification" && result.output) {
      const gaps = (result.output as any).gaps ?? [];
      researchGaps = gaps.map((g: any) => g.description ?? g.gap ?? "").join("\n");
    }
    if (contract.name === "literature_search" && result.output) {
      const gaps = (result.output as any).researchGaps ?? [];
      if (gaps.length > 0) {
        researchGaps = gaps.map((g: any) => g.gap ?? "").join("\n");
      }
    }
  }

  // Update hypotheses via controller
  for (const hyp of allHypotheses) {
    try {
      await controller.execute({
        actionName: "assess_hypothesis",
        objectId: (hyp as any).hypothesisId,
        objectType: "Hypothesis",
      });
      await controller.execute({
        actionName: "activate_hypothesis",
        objectId: (hyp as any).hypothesisId,
        objectType: "Hypothesis",
      });
    } catch { /* ignore */ }
  }

  return {
    phases: phaseResults,
    knowledgeItems: allKnowledge,
    hypotheses: allHypotheses,
    evidence: allEvidence,
    experiments: allExperiments,
    results: allResults,
    reports: allReports,
    citations: allCitations,
    researchGaps,
    hypothesisStatements,
  };
}
