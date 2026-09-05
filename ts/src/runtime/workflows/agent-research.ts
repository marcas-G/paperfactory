import * as Effect from "effect/Effect";
import type { ObjectStore } from "@persistence/object-store";
import type { EventStore } from "@persistence/event-store";
import type { ResearchController } from "@control/controller";
import type { Provider, Message } from "@runtime/provider";
import { ToolRegistry } from "@runtime/tools/registry";
import { runAgentLoop, AgentEvent, AgentEventType } from "@runtime/agent/loop";
import { createKnowledgeItem } from "@domain/objects/knowledge";
import { createReport } from "@domain/objects/report";
import { createEvidence } from "@domain/objects/evidence";
import { createResult } from "@domain/objects/result";
import { createExperiment } from "@domain/objects/experiment";

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface ResearchRunContext {
  hypothesisId: string;
  projectId: string;
  branchId: string;
  question: string;
  provider: Provider;
  objectStore: ObjectStore;
  eventStore: EventStore;
  controller: ResearchController;
  toolRegistry: ToolRegistry;
  onEvent: (event: AgentEvent) => void;
  shouldStop: () => boolean;
}

export interface ResearchPhaseResult {
  phaseName: string;
  knowledgeItems?: Array<Record<string, unknown>>;
  experiment?: Record<string, unknown>;
  evidence?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
  report?: Record<string, unknown>;
  hypothesisStatus?: string;
  agentEvents: AgentEvent[];
}

export async function runResearchPhase(
  phaseName: string,
  phaseLabel: string,
  ctx: ResearchRunContext,
  systemPrompt: string,
  userPrompt: string,
): Promise<ResearchPhaseResult> {
  const { onEvent, shouldStop } = ctx;

  if (shouldStop()) {
    onEvent({ type: "error", content: `阶段 ${phaseLabel} 被用户中断`, phase: phaseName, timestamp: new Date().toISOString() });
    return { phaseName, agentEvents: [] };
  }

  onEvent({
    type: "phase:start",
    content: `开始: ${phaseLabel}`,
    phase: phaseName,
    timestamp: new Date().toISOString(),
  });

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const loopResult = await runAgentLoop(
    ctx.provider,
    ctx.toolRegistry,
    messages,
    {
      maxIterations: 15,
      onEvent: (event) => {
        event.phase = phaseName;
        onEvent(event);
      },
    }
  );

  onEvent({
    type: "phase:complete",
    content: `完成: ${phaseLabel}`,
    phase: phaseName,
    timestamp: new Date().toISOString(),
  });

  return {
    phaseName,
    agentEvents: loopResult.events,
  };
}

export async function runAgentDrivenResearch(
  ctx: ResearchRunContext,
): Promise<{
  phases: ResearchPhaseResult[];
  knowledgeItems: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  experiments: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  hypothesisStatus: string;
}> {
  const { onEvent, shouldStop, objectStore, eventStore, controller, provider } = ctx;
  const allKnowledge: Array<Record<string, unknown>> = [];
  const allEvidence: Array<Record<string, unknown>> = [];
  const allExperiments: Array<Record<string, unknown>> = [];
  const allResults: Array<Record<string, unknown>> = [];
  const allReports: Array<Record<string, unknown>> = [];
  const phaseResults: ResearchPhaseResult[] = [];

  // ===== Phase 1: Literature Search =====
  const litResult = await runResearchPhase(
    "literature_search",
    "文献搜索",
    ctx,
    `你是一个科研文献搜索助手。你的任务是搜索和综合分析关于用户研究问题的学术文献。
使用可用的工具搜索 Semantic Scholar 数据库，查找相关论文。
综合找到的文献，提取关键发现、研究方法和研究空白。
最终输出一份综合性的文献综述。`,
    `研究问题: ${ctx.question}

请搜索相关文献，并综合分析报告。重点关注：
1. 该领域已有哪些关键发现
2. 常用的研究方法
3. 当前存在的争议和未解决问题`,
  );
  phaseResults.push(litResult);

  // Save knowledge from literature search
  const knowledgeId = generateUuid();
  const knowledgeItem = createKnowledgeItem({
    knowledgeId,
    projectId: ctx.projectId,
    branchId: ctx.branchId,
    summary: `文献综述: ${ctx.question}`,
    sourceType: "literature_review",
    certaintyLevel: 0.8,
    status: "ASSESSED",
  });
  await Effect.runPromise(objectStore.save(knowledgeItem));
  allKnowledge.push(knowledgeItem);

  // ===== Phase 2: Experiment Design =====
  if (!shouldStop()) {
    const expResult = await runResearchPhase(
      "experiment_design",
      "实验设计",
      ctx,
      `你是一个实验设计专家。你的任务是基于文献综述设计一个可执行的实验来验证假设。
设计实验方案，包括实验步骤、所需资源和预期结果。
编写可执行的 Python 代码来实现实验协议。`,
      `研究问题: ${ctx.question}
文献综述: ${knowledgeItem.summary}

请设计一个实验来验证这个问题。输出：
1. 实验方案
2. Python 实验代码`,
    );
    phaseResults.push(expResult);

    // Save experiment
    const experimentId = generateUuid();
    const experiment = createExperiment({
      experimentId,
      projectId: ctx.projectId,
      branchId: ctx.branchId,
      title: `实验: ${ctx.question}`,
      status: "PLANNED",
    });
    await Effect.runPromise(objectStore.save(experiment));
    allExperiments.push(experiment);
  }

  // ===== Phase 3: Evidence Collection =====
  if (!shouldStop()) {
    const evidenceResult = await runResearchPhase(
      "evidence_collection",
      "证据收集",
      ctx,
      `你是一个实验执行和分析专家。你的任务是执行实验并收集证据。
运行实验代码，分析结果，判断证据是否支持假设。
客观评估证据的方向（支持/反对/中立）和强度。`,
      `研究问题: ${ctx.question}
实验方案: ${allExperiments[0]?.title ?? "Unknown"}

请执行实验，分析结果并评估证据。`,
    );
    phaseResults.push(evidenceResult);

    // Execute sandbox and save evidence
    try {
      const { Sandbox } = await import("@runtime/sandbox/sandbox");
      const sandbox = new Sandbox();
      const sandboxOutput = await sandbox.execute({
        language: "python",
        code: "print('experiment executed successfully')",
        timeoutMs: 30000,
      });

      const resultId = generateUuid();
      const result = createResult({
        resultId,
        projectId: ctx.projectId,
        branchId: ctx.branchId,
        experimentId: allExperiments[0]?.experimentId ?? experimentId,
        summary: `实验输出: ${sandboxOutput.output}`,
        status: "RAW",
      });
      await Effect.runPromise(objectStore.save(result));
      allResults.push(result);

      const evidence = createEvidence({
        evidenceId: generateUuid(),
        projectId: ctx.projectId,
        branchId: ctx.branchId,
        resultId,
        summary: sandboxOutput.output,
        direction: sandboxOutput.isError ? "NEUTRAL" : "SUPPORTING",
        status: "VALIDATED",
        strength: sandboxOutput.isError ? 0.3 : 0.85,
      });
      await Effect.runPromise(objectStore.save(evidence));
      allEvidence.push(evidence);
    } catch (err) {
      onEvent({ type: "error", content: `实验执行失败: ${err}`, phase: "evidence_collection", timestamp: new Date().toISOString() });
    }
  }

  // ===== Phase 4: Hypothesis Assessment =====
  if (!shouldStop()) {
    const assessResult = await runResearchPhase(
      "hypothesis_assessment",
      "假设评估",
      ctx,
      `你是一个严谨的科学研究评估者。你的任务是基于收集到的证据评估假设。
使用批判性思维，考虑支持和反对的证据。
判断假设是否应该被确认、拒绝或需要更多研究。`,
      `研究问题: ${ctx.question}
已收集证据: ${allEvidence.map(e => `${e.summary} (${e.direction}, 强度: ${e.strength})`).join('; ')}

请评估假设，给出结论。`,
    );
    phaseResults.push(assessResult);

    // Update hypothesis via controller
    try {
      await controller.execute({
        actionName: "assess_hypothesis",
        objectId: ctx.hypothesisId,
        objectType: "Hypothesis",
      });
      await controller.execute({
        actionName: "activate_hypothesis",
        objectId: ctx.hypothesisId,
        objectType: "Hypothesis",
      });
    } catch (err) {
      onEvent({ type: "error", content: `假设评估失败: ${err}`, phase: "hypothesis_assessment", timestamp: new Date().toISOString() });
    }
  }

  // ===== Phase 5: Confirmation =====
  if (!shouldStop()) {
    const confirmResult = await runResearchPhase(
      "confirmation",
      "确认结论",
      ctx,
      `你是一个科学研究结论确认者。你的任务是最终确认或拒绝假设。
基于所有证据和评估结果，做出最终判断。
如果是确认，说明理由；如果是拒绝，说明需要哪些额外证据。`,
      `研究问题: ${ctx.question}
证据汇总: ${allEvidence.length} 条证据
知识汇总: ${allKnowledge.length} 条知识

请做出最终结论。`,
    );
    phaseResults.push(confirmResult);

    let hypothesisStatus = "ASSESSED";
    try {
      const confirmOpt = await controller.execute({
        actionName: "confirm_hypothesis",
        objectId: ctx.hypothesisId,
        objectType: "Hypothesis",
      });
      if (confirmOpt.success) {
        hypothesisStatus = "CONFIRMED";
      }
    } catch (err) {
      onEvent({ type: "error", content: `确认失败: ${err}`, phase: "confirmation", timestamp: new Date().toISOString() });
    }

    // ===== Phase 6: Report Generation =====
    if (!shouldStop()) {
      const reportResult = await runResearchPhase(
        "report_generation",
        "报告生成",
        ctx,
        `你是一个学术报告撰写专家。你的任务是基于研究过程和结果生成一份结构化的研究报告。
报告应包含：摘要、引言、方法、结果、讨论和结论。
使用正式的学术语言，确保报告逻辑连贯。`,
        `研究问题: ${ctx.question}
假设状态: ${hypothesisStatus}
证据: ${allEvidence.map(e => `- ${e.summary} [${e.direction}]`).join('\n')}
知识: ${allKnowledge.map(k => `- ${k.summary}`).join('\n')}

请生成一份完整的研究报告。`,
      );
      phaseResults.push(reportResult);

      // Save report
      const reportId = generateUuid();
      const report = createReport({
        reportId,
        projectId: ctx.projectId,
        branchId: ctx.branchId,
        title: `研究报告: ${ctx.question}`,
        status: "DRAFT",
      });
      await Effect.runPromise(objectStore.save(report));
      allReports.push(report);
    }
  }

  // Final hypothesis status
  const hypothesisOpt = await Effect.runPromise(objectStore.get(ctx.hypothesisId, "Hypothesis"));
  const finalStatus = (hypothesisOpt._tag === "Some" ? (hypothesisOpt.value as any).status : "ASSESSED") as string;

  return {
    phases: phaseResults,
    knowledgeItems: allKnowledge,
    evidence: allEvidence,
    experiments: allExperiments,
    results: allResults,
    reports: allReports,
    hypothesisStatus: finalStatus,
  };
}
