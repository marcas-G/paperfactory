import * as Effect from "effect/Effect";
import type { ObjectStore } from "@pf/core/persistence/object-store";
import type { EventStore } from "@pf/core/persistence/event-store";
import type { ResearchController } from "@pf/core/control/controller";
import type { Provider, ToolDefinition } from "@pf/core/runtime/provider";
import type { ToolRegistry } from "@pf/core/runtime/tools/registry";
import type { AgentEvent } from "@pf/core/runtime/agent/loop";
import { PHASE_CONTRACTS, runPhase } from "./phase-contracts";
import { createPhaseRun } from "@pf/schema/objects/phase-run";
import { buildEvidenceChain } from "./evidence-chain";

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
  /** REQ-REC4 断点续跑：该阶段（含）之前的所有阶段视为已完成，跳过并从下一阶段继续 */
  resumeFromPhase?: string;
  mode?: "manual" | "auto";
  onApprovalNeeded?: (runId: string, phaseName: string, summary: string) => Promise<"approve" | "modify" | "reject">;
}

import { generateUuid } from "./shared";

/**
 * REQ-REC4 断点判定：项目在 PHASE_CONTRACTS 序列中已完成（COMPLETED）的最靠后阶段。
 *
 * 依据 objectStore 里的 PhaseRun 记录：过滤 projectId + status==="COMPLETED"、
 * 且 phaseName 属于契约序列，取序列位置最靠后的阶段名；无任何完成记录返回 null
 * （调用方据此全量重跑）。
 */
export async function lastCompletedPhase(
  store: ObjectStore,
  projectId: string,
): Promise<string | null> {
  const runs = (await Effect.runPromise(store.list("PhaseRun"))) as Array<Record<string, unknown>>;
  let lastIdx = -1;
  for (const run of runs) {
    if (run.projectId !== projectId) continue;
    if (run.status !== "COMPLETED") continue;
    const idx = PHASE_CONTRACTS.findIndex((p) => p.name === run.phaseName);
    if (idx > lastIdx) lastIdx = idx;
  }
  return lastIdx >= 0 ? PHASE_CONTRACTS[lastIdx].name : null;
}

function buildPhaseSummary(phaseName: string, result: { output?: Record<string, unknown> | null }): string {
  if (!result?.output) return "阶段完成";
  const o = result.output as Record<string, unknown>;
  if (phaseName === "literature_search") {
    const findings = (o.keyFindings as Array<unknown> | undefined) ?? [];
    const gaps = (o.researchGaps as Array<unknown> | undefined) ?? [];
    return `找到 ${findings.length} 个关键发现，${gaps.length} 个研究空白`;
  }
  if (phaseName === "hypothesis_generation") {
    const hyps = (o.hypotheses as Array<unknown> | undefined) ?? [];
    return `提出 ${hyps.length} 个假设`;
  }
  if (phaseName === "evidence_assessment" || phaseName === "confirmation") {
    const conclusion = (o.conclusion as Record<string, unknown> | undefined) ?? o;
    return `结论: ${conclusion.status ?? "未完成"} — ${(conclusion.reasoning as string | undefined)?.substring(0, 200) ?? ""}`;
  }
  return `阶段完成`;
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

  const phaseVersions: Record<string, number> = {};
  const phaseRunIds: Record<string, string> = {};

  const contractsToRun = PHASE_CONTRACTS.filter((c) => {
    const idx = PHASE_CONTRACTS.findIndex((p) => p.name === c.name);
    const startIdx = ctx.startFromPhase
      ? PHASE_CONTRACTS.findIndex((p) => p.name === ctx.startFromPhase)
      : -1;
    const resumeIdx = ctx.resumeFromPhase
      ? PHASE_CONTRACTS.findIndex((p) => p.name === ctx.resumeFromPhase)
      : -1;
    return idx >= startIdx && idx > resumeIdx;
  });

  // REQ-REC4：断点续跑——发一条恢复事件说明跳过范围（X-Y），已完成阶段不重跑
  if (ctx.resumeFromPhase) {
    const resumeIdx = PHASE_CONTRACTS.findIndex((p) => p.name === ctx.resumeFromPhase);
    if (resumeIdx >= 0) {
      const firstSkipped = PHASE_CONTRACTS[0].name;
      const lastSkipped = PHASE_CONTRACTS[resumeIdx].name;
      onEvent({
        type: "phase:progress",
        content:
          firstSkipped === lastSkipped
            ? `恢复：跳过已完成阶段 ${firstSkipped}`
            : `恢复：跳过已完成阶段 ${firstSkipped}-${lastSkipped}`,
        phase: ctx.resumeFromPhase,
        timestamp: new Date().toISOString(),
      });
    }
  }

  for (const contract of contractsToRun) {
    if (shouldStop()) {
      onEvent({ type: "phase:progress", content: `阶段 ${contract.label} 被跳过`, phase: contract.name, timestamp: new Date().toISOString() });
      continue;
    }

    const phaseRunId = generateUuid();
    const version = (phaseVersions[contract.name] ?? 0) + 1;

    const result = await runPhase(
      contract,
      objectStore,
      ctx.provider,
      ctx.toolRegistry,
      ctx.toolDefinitions,
      ctx.projectId,
      ctx.question,
      onEvent,
      shouldStop,
      undefined,
      phaseRunId
    );

    // Save PhaseRun to PG
    phaseVersions[contract.name] = version;

    const phaseRun = createPhaseRun({
      phaseRunId,
      projectId: ctx.projectId,
      phaseName: contract.name,
      phaseVersion: version,
      parentRunId: version > 1 ? (phaseRunIds[contract.name] ?? null) : null,
      status: result.status,
      artifacts: result.savedIds,
      agentOutput: result.rawOutput,
      toolCalls: result.toolCalls,
      selfReview: result.selfReview,
      active: true,
    });
    await Effect.runPromise(objectStore.save(phaseRun as Record<string, unknown>));
    phaseRunIds[contract.name] = phaseRunId;

    await buildEvidenceChain(objectStore, ctx.projectId, {
      savedIds: result.savedIds,
      phaseName: contract.name,
    });

    const firstKey = Object.keys(result.savedIds)[0];
    const typeMap: Record<string, string> = {
      knowledgeIds: "KnowledgeItem",
      hypothesisIds: "Hypothesis",
      gapIds: "ResearchGap",
      experimentIds: "Experiment",
      resultIds: "Result",
      evidenceIds: "Evidence",
      reportIds: "Report",
      citationIds: "Citation",
    };
    const objectType = firstKey ? (typeMap[firstKey] ?? firstKey) : "";
    const objectId = firstKey ? (result.savedIds[firstKey]?.[0] ?? "") : "";

    onEvent({
      type: "phase:progress",
      content: `阶段 ${contract.label} 已保存 (v${version})`,
      phase: contract.name,
      timestamp: new Date().toISOString(),
      runId: phaseRunId,
      objectType,
      objectId,
    } as AgentEvent);

    // Approval gate (manual mode)
    if (ctx.mode === "manual" && ctx.onApprovalNeeded) {
      const summary = buildPhaseSummary(contract.name, result);
      onEvent({
        type: "phase:progress",
        content: `等待审核: ${contract.label} v${version}`,
        phase: contract.name,
        timestamp: new Date().toISOString(),
      });

      const decision = await ctx.onApprovalNeeded(phaseRunId, contract.name, summary);

      if (decision === "approve") {
        onEvent({
          type: "phase:approved",
          content: `用户已批准: ${contract.label}`,
          phase: contract.name,
          timestamp: new Date().toISOString(),
        });
      } else if (decision === "reject") {
        onEvent({
          type: "phase:rejected",
          content: `用户已拒绝: ${contract.label}`,
          phase: contract.name,
          timestamp: new Date().toISOString(),
        });
      } else if (decision === "modify") {
        onEvent({
          type: "phase:modified",
          content: `用户请求修改: ${contract.label}`,
          phase: contract.name,
          timestamp: new Date().toISOString(),
        });
      }
    }

    phaseResults.push({
      phaseName: result.phaseName,
      status: result.status,
      output: result.output,
      rawOutput: result.rawOutput,
      savedIds: result.savedIds,
      toolCalls: result.toolCalls,
    });

    // Collect saved objects
    const collect = async (ids: string[], type: string, arr: Array<Record<string, unknown>>, extra?: (item: Record<string, unknown>) => void) => {
      for (const id of ids) {
        const item = await Effect.runPromise(objectStore.get(id, type));
        if (item.isSome()) {
          arr.push(item.value as Record<string, unknown>);
          extra?.(item.value);
        }
      }
    };
    if (result.savedIds.knowledgeIds) collect(result.savedIds.knowledgeIds, "KnowledgeItem", allKnowledge);
    if (result.savedIds.hypothesisIds) collect(result.savedIds.hypothesisIds, "Hypothesis", allHypotheses, (v) => hypothesisStatements.push((v as Record<string, unknown>).statement as string ?? ""));
    if (result.savedIds.evidenceIds) collect(result.savedIds.evidenceIds, "Evidence", allEvidence);
    if (result.savedIds.experimentIds) collect(result.savedIds.experimentIds, "Experiment", allExperiments);
    if (result.savedIds.resultIds) collect(result.savedIds.resultIds, "Result", allResults);
    if (result.savedIds.reportIds) collect(result.savedIds.reportIds, "Report", allReports);
    if (result.savedIds.citationIds) collect(result.savedIds.citationIds, "Citation", allCitations);

    // Extract research gaps
    if (contract.name === "gap_identification" && result.output) {
      const gaps = (result.output as Record<string, unknown>).gaps as Array<Record<string, unknown>> ?? [];
      researchGaps = gaps.map((g: Record<string, unknown>) => (g.description as string) ?? (g.gap as string) ?? "").join("\n");
    }
    if (contract.name === "literature_search" && result.output) {
      const gaps = (result.output as Record<string, unknown>).researchGaps as Array<Record<string, unknown>> ?? [];
      if (gaps.length > 0) {
        researchGaps = gaps.map((g: Record<string, unknown>) => (g.gap as string) ?? "").join("\n");
      }
    }
  }

  // Update hypotheses via controller
  for (const hyp of allHypotheses) {
    try {
      await controller.execute({
        actionName: "assess_hypothesis",
        objectId: (hyp as Record<string, unknown>).hypothesisId as string,
        objectType: "Hypothesis",
      });
      await controller.execute({
        actionName: "activate_hypothesis",
        objectId: (hyp as Record<string, unknown>).hypothesisId as string,
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
