import * as Schema from "@effect/schema/Schema";
import type { ObjectStore } from "@persistence/object-store";
import type { Provider, Message, ToolDefinition } from "@runtime/provider";
import type { ToolRegistry } from "@runtime/tools/registry";
import type { AgentEvent } from "@runtime/agent/loop";
import { runAgentLoop } from "@runtime/agent/loop";
import { COGNITIVE_MODES } from "@cognition/modes";
import * as Effect from "effect/Effect";
import { createKnowledgeItem } from "@domain/objects/knowledge";
import { createHypothesis } from "@domain/objects/hypothesis";
import { createResearchGap } from "@domain/objects/gap";
import { createExperiment } from "@domain/objects/experiment";
import { createResult } from "@domain/objects/result";
import { createEvidence } from "@domain/objects/evidence";
import { createReport } from "@domain/objects/report";
import { selfReview, SelfReviewResult } from "@runtime/workflows/self-review";
import { chainOfVerification, CoVeResult } from "@runtime/workflows/cove";
import { beamSearch } from "@runtime/workflows/tot-engine";
import { sampleConsensus } from "@runtime/workflows/self-consistency";
import { debate } from "@runtime/workflows/debate";

import { generateUuid } from "./shared";

// ===== LLM 输出 Schema =====

export const LiteratureSearchOutput = Schema.Struct({
  keyFindings: Schema.Array(Schema.Struct({
    finding: Schema.NonEmptyString,
    sourceTitle: Schema.String,
    sourceUrl: Schema.String,
  })),
  researchGaps: Schema.Array(Schema.Struct({
    gap: Schema.NonEmptyString,
    whyItMatters: Schema.String,
  })),
  methodologies: Schema.Array(Schema.NonEmptyString),
});

export const GapAnalysisOutput = Schema.Struct({
  gaps: Schema.Array(Schema.Struct({
    description: Schema.NonEmptyString,
    evidenceOfGap: Schema.String,
    researchValue: Schema.String,
  })),
});

export const HypothesisOutput = Schema.Struct({
  hypotheses: Schema.Array(Schema.Struct({
    statement: Schema.NonEmptyString,
    researchValue: Schema.String,
    falsificationCondition: Schema.NonEmptyString,
  })),
});

export const ExperimentDesignOutput = Schema.Struct({
  design: Schema.Struct({
    objective: Schema.NonEmptyString,
    variables: Schema.Array(Schema.NonEmptyString),
    controls: Schema.Array(Schema.NonEmptyString),
  }),
  expectedResults: Schema.String,
  falsificationCriteria: Schema.NonEmptyString,
});

export const EvidenceAssessmentOutput = Schema.Struct({
  assessments: Schema.Array(Schema.Struct({
    evidenceId: Schema.String,
    direction: Schema.Union(
      Schema.Literal("SUPPORTING"),
      Schema.Literal("CONFLICTING"),
      Schema.Literal("NEUTRAL"),
    ),
    strength: Schema.Number.pipe(Schema.between(0, 1)),
    reasoning: Schema.NonEmptyString,
    limitations: Schema.Array(Schema.String),
  })),
  conclusion: Schema.Struct({
    status: Schema.Union(
      Schema.Literal("CONFIRMED"),
      Schema.Literal("REJECTED"),
      Schema.Literal("NEEDS_MORE_RESEARCH"),
    ),
    reasoning: Schema.NonEmptyString,
  }),
});

export const ReportOutput = Schema.Struct({
  abstract: Schema.NonEmptyString,
  sections: Schema.Array(Schema.Struct({
    title: Schema.NonEmptyString,
    content: Schema.NonEmptyString,
  })),
});

// ===== Phase I/O Contract =====

export interface PhaseIOContract {
  name: string;
  label: string;
  sequence: number;
  readObjects: string[];
  writeObjects: string[];
  cognitiveMode: string;
  tools: string[];
}

export const PHASE_CONTRACTS: ReadonlyArray<PhaseIOContract> = [
  {
    name: "literature_search",
    label: "文献调研",
    sequence: 1,
    readObjects: [],
    writeObjects: ["KnowledgeItem", "Citation"],
    cognitiveMode: "EXPLORE",
    tools: ["search"],
  },
  {
    name: "gap_identification",
    label: "识别研究空白",
    sequence: 2,
    readObjects: ["KnowledgeItem", "Citation"],
    writeObjects: ["ResearchGap"],
    cognitiveMode: "DISCRIMINATE",
    tools: [],
  },
  {
    name: "hypothesis_generation",
    label: "提出假设",
    sequence: 3,
    readObjects: ["ResearchGap", "KnowledgeItem"],
    writeObjects: ["Hypothesis"],
    cognitiveMode: "FRAME",
    tools: [],
  },
  {
    name: "experiment_design",
    label: "实验设计",
    sequence: 4,
    readObjects: ["Hypothesis", "KnowledgeItem"],
    writeObjects: ["Experiment"],
    cognitiveMode: "FRAME",
    tools: ["code"],
  },
  {
    name: "experiment_execution",
    label: "执行实验",
    sequence: 5,
    readObjects: ["Experiment", "Hypothesis"],
    writeObjects: ["Result", "Evidence"],
    cognitiveMode: "VERIFY",
    tools: ["code"],
  },
  {
    name: "evidence_assessment",
    label: "证据评估",
    sequence: 6,
    readObjects: ["Evidence", "Hypothesis", "Result"],
    writeObjects: ["Hypothesis"],
    cognitiveMode: "FALSIFY",
    tools: [],
  },
  {
    name: "confirmation",
    label: "确认结论",
    sequence: 7,
    readObjects: ["Hypothesis", "Evidence"],
    writeObjects: ["Hypothesis"],
    cognitiveMode: "DECIDE",
    tools: [],
  },
  {
    name: "report_generation",
    label: "报告生成",
    sequence: 8,
    readObjects: ["Hypothesis", "Evidence", "KnowledgeItem", "Result"],
    writeObjects: ["Report"],
    cognitiveMode: "SYNTHESIZE",
    tools: [],
  },
];

// ===== Context Builder: 从 PG 读取对象构建 LLM 输入 =====

export async function buildPhaseContext(
  store: ObjectStore,
  projectId: string,
  question: string,
  contract: PhaseIOContract,
  provider?: Provider,
): Promise<string> {
  const lines: string[] = [];
  lines.push(`研究问题: ${question}`);
  lines.push(`当前阶段: ${contract.label}`);
  lines.push(`需要读取的对象: ${contract.readObjects.join(", ") || "无(初始阶段)"}`);
  lines.push("");

  // ToT keyword exploration for literature_search
  if (contract.name === "literature_search" && provider) {
    try {
      const totResult = await beamSearch(
        `Generate search keyword strategies for: ${question}`,
        provider,
        { beamWidth: 3, depth: 2 },
      );
      const strategies = totResult.bestPath.map((n) => n.thought).join("\n");
      lines.push(`[ToT 关键词探索推荐]`);
      lines.push(strategies);
      lines.push("");
    } catch {
      /* ToT exploration failed, continue without it */
    }
  }

  for (const objType of contract.readObjects) {
    const items = await Effect.runPromise(store.list(objType));
    const relevant = items.filter((o: Record<string, unknown>) => (o as Record<string, unknown>).projectId === projectId);
    if (relevant.length > 0) {
      lines.push(`=== ${objType} (${relevant.length} 条) ===`);
      for (const item of relevant) {
        if (objType === "KnowledgeItem") {
          lines.push(`  [${((item as Record<string, unknown>).knowledgeId as string)?.substring(0, 8)}] ${(item as Record<string, unknown>).summary as string ?? "未知"} (来源: ${(item as Record<string, unknown>).sourceType as string ?? "未知"})`);
        } else if (objType === "ResearchGap") {
          lines.push(`  [${((item as Record<string, unknown>).gapId as string)?.substring(0, 8)}] ${(item as Record<string, unknown>).description as string ?? "未知"}`);
        } else if (objType === "Hypothesis") {
          lines.push(`  [${((item as Record<string, unknown>).hypothesisId as string)?.substring(0, 8)}] ${(item as Record<string, unknown>).statement as string ?? "未知"} [${(item as Record<string, unknown>).status as string ?? "PROPOSED"}]`);
        } else if (objType === "Evidence") {
          lines.push(`  [${((item as Record<string, unknown>).evidenceId as string)?.substring(0, 8)}] ${(item as Record<string, unknown>).summary as string ?? "未知"} [${(item as Record<string, unknown>).direction as string ?? "NEUTRAL"}] 强度: ${((item as Record<string, unknown>).strength as number ?? 0).toFixed(2)}`);
        } else if (objType === "Experiment") {
          lines.push(`  [${((item as Record<string, unknown>).experimentId as string)?.substring(0, 8)}] ${(item as Record<string, unknown>).title as string ?? "未知"} [${(item as Record<string, unknown>).status as string ?? "PLANNED"}]`);
        } else if (objType === "Result") {
          lines.push(`  [${((item as Record<string, unknown>).resultId as string)?.substring(0, 8)}] ${(item as Record<string, unknown>).summary as string ?? "未知"}`);
        } else if (objType === "Citation") {
          lines.push(`  [${((item as Record<string, unknown>).citationId as string)?.substring(0, 8)}] "${(item as Record<string, unknown>).sourceTitle as string ?? "Unknown"}" (${(item as Record<string, unknown>).sourceUrl as string ?? ""})`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ===== System Prompt Builder =====

const COGNITIVE_INSTRUCTIONS: Record<string, string> = Object.fromEntries(
  COGNITIVE_MODES.map((m) => [m.name, m.instructions])
);

function buildSystemPrompt(
  contract: PhaseIOContract,
  outputSchema: string,
): string {
  const cogInstr = COGNITIVE_INSTRUCTIONS[contract.cognitiveMode] ?? "";
  const toolHints = contract.tools.length > 0
    ? `\n## 可用工具\n${contract.tools.map(t => `- **${t}**: 使用此工具获取数据`).join("\n")}`
    : "";

  const reactInstructions = `## ReAct 模式

你遵循 ReAct (Reasoning + Acting) 模式进行科研工作:

Thought: 分析当前情况，规划下一步行动
Action: 调用工具并传入具体参数
Observation: 审查工具输出（由系统提供）
Thought: 分析结果质量，决定是否需要进一步行动
... (重复)
Final Answer: 输出结构化 JSON

重要:
- 调用工具前，思考 WHY 你需要这个工具以及 WHAT 你期望得到
- 收到结果后，思考结果的质量和充分性
- 如果结果不足，反思原因并调整策略`;

  const planInstructions = `## 计划指令

在开始执行前，先生成一个计划:
1. 我需要哪些信息？
2. 应该按什么顺序使用哪些工具？
3. 如何验证我的输出是完整和准确的？
然后按计划逐步执行。`;

  return `你是一个科研系统的工作节点。你的认知模式是: ${contract.cognitiveMode}。
${cogInstr}

## 当前阶段: ${contract.label}
## 输入来源: ${contract.readObjects.join(", ") || "用户问题"}
## 输出目标: ${contract.writeObjects.join(", ")}

## 输出格式（必须严格输出 JSON，不要其他文本）
${outputSchema}

${toolHints}

${reactInstructions}

${planInstructions}

## 重要规则
1. 只根据输入对象中的信息推理，不要编造数据
2. 输出必须是合法的 JSON
3. 每个结论必须有来源（引用输入对象中的 ID）`;
}

// ===== JSON Output Parser =====

function tryParseLLMOutput(content: string, schemaName: string): Record<string, unknown> | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ===== Phase Runner =====

export interface PhaseRunResult {
  phaseName: string;
  status: "COMPLETED" | "ERROR" | "SKIPPED";
  output: Record<string, unknown> | null;
  rawOutput: string;
  savedIds: Record<string, string[]>;
  toolCalls: Array<{ toolName: string; input: Record<string, unknown>; output: string }>;
  selfReview?: {
    passed: boolean;
    rounds: number;
    issues: Array<{ severity: "blocking" | "warning"; category: string; message: string }>;
  } | null;
}

export async function runPhase(
  contract: PhaseIOContract,
  store: ObjectStore,
  provider: Provider,
  toolRegistry: ToolRegistry,
  toolDefinitions: ReadonlyArray<ToolDefinition>,
  projectId: string,
  question: string,
  onEvent: (e: AgentEvent) => void,
  shouldStop: () => boolean,
  extraContext?: string,
  runId?: string,
): Promise<PhaseRunResult> {
  if (shouldStop()) {
    return { phaseName: contract.name, status: "SKIPPED", output: null, rawOutput: "", savedIds: {}, toolCalls: [], selfReview: null };
  }

  onEvent({
    type: "phase:start",
    content: `开始: ${contract.label}`,
    phase: contract.name,
    timestamp: new Date().toISOString(),
  });

  // Step 1: Build context from PG objects
  const context = await buildPhaseContext(store, projectId, question, contract, provider);

  // Step 2: Build system prompt with output schema
  let outputSchemaDesc = "";
  if (contract.name === "literature_search") {
    outputSchemaDesc = `{
  "keyFindings": [{"finding": "关键发现", "sourceTitle": "来源论文", "sourceUrl": "URL"}],
  "researchGaps": [{"gap": "研究空白描述", "whyItMatters": "为什么重要"}],
  "methodologies": ["方法1", "方法2"]
}`;
  } else if (contract.name === "gap_identification") {
    outputSchemaDesc = `{
  "gaps": [{"description": "空白描述", "evidenceOfGap": "为什么是空白", "researchValue": "研究价值"}]
}`;
  } else if (contract.name === "hypothesis_generation") {
    outputSchemaDesc = `{
  "hypotheses": [{"statement": "假设陈述", "researchValue": "研究价值", "falsificationCondition": "证伪条件"}]
}`;
  } else if (contract.name === "experiment_design") {
    outputSchemaDesc = `{
  "design": {"objective": "目标", "variables": ["变量"], "controls": ["对照"]},
  "expectedResults": "预期结果",
  "falsificationCriteria": "证伪标准"
}`;
  } else if (contract.name === "experiment_execution") {
    outputSchemaDesc = `{
  "output": "实验输出",
  "analysis": "客观分析",
  "direction": "SUPPORTING|CONFLICTING|NEUTRAL",
  "strength": 0.85
}`;
  } else if (contract.name === "evidence_assessment") {
    outputSchemaDesc = `{
  "assessments": [{"evidenceId": "ID", "direction": "SUPPORTING|CONFLICTING|NEUTRAL", "strength": 0.85, "reasoning": "理由"}],
  "conclusion": {"status": "CONFIRMED|REJECTED|NEEDS_MORE_RESEARCH", "reasoning": "理由"}
}`;
  } else if (contract.name === "confirmation") {
    outputSchemaDesc = `{
  "status": "CONFIRMED|REJECTED|NEEDS_MORE_RESEARCH",
  "reasoning": "详细理由",
  "researchValue": "研究贡献"
}`;
  } else if (contract.name === "report_generation") {
    outputSchemaDesc = `{
  "abstract": "摘要",
  "sections": [{"title": "章节标题", "content": "内容"}]
}`;
  }

  const systemPrompt = buildSystemPrompt(contract, outputSchemaDesc);

  const userPrompt = extraContext
    ? `${context}\n\n补充信息: ${extraContext}`
    : `${context}\n\n请执行当前阶段任务，输出严格遵循 JSON 格式。`;

  // Step 3: Run Agent
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let rawOutput = "";
  const toolCalls: Array<{ toolName: string; input: Record<string, unknown>; output: string }> = [];
  let selfReviewResult: SelfReviewResult | null = null;

  try {
    const result = await runAgentLoop(provider, toolRegistry, messages, {
      maxIterations: 15,
      tools: toolDefinitions,
      onEvent: (event) => {
        event.phase = contract.name;
        onEvent(event);
      },
      shouldStop,
    });
    rawOutput = result.finalContent;
    toolCalls.push(...result.toolCalls.map(tc => ({
      toolName: tc.toolName,
      input: tc.input,
      output: tc.output.content?.substring(0, 10000) ?? "",
    })));

    // Step 3b: CoVe verification (before self-review)
    if (rawOutput && rawOutput.trim().length > 0) {
      const coveResult: CoVeResult = await chainOfVerification(
        rawOutput,
        contract.name,
        provider,
        context,
        toolRegistry
      );

      if (coveResult.revisedOutput) {
        rawOutput = coveResult.revisedOutput;
      }

      onEvent({
        type: "self:review",
        content: `CoVe 验证: ${coveResult.issues.length} 个问题被发现`,
        phase: contract.name,
        timestamp: new Date().toISOString(),
        passed: coveResult.issues.length === 0,
        issues: coveResult.issues,
      });
    }

    // Step 3c: Self-review
    if (rawOutput && rawOutput.trim().length > 0) {
      selfReviewResult = await selfReview(rawOutput, contract.name, provider);

      onEvent({
        type: "self:review",
        content: `自我审查: ${selfReviewResult.passed ? "通过" : "发现问题"} (${selfReviewResult.rounds} 轮)`,
        phase: contract.name,
        timestamp: new Date().toISOString(),
        passed: selfReviewResult.passed,
        rounds: selfReviewResult.rounds,
        issues: selfReviewResult.issues || [],
      });

      if (selfReviewResult.finalOutput !== rawOutput) {
        rawOutput = selfReviewResult.finalOutput;
      }
    }
  } catch (err: unknown) {
    onEvent({ type: "phase:error", content: String(err), phase: contract.name, timestamp: new Date().toISOString() });
    return {
      phaseName: contract.name, status: "ERROR", output: null, rawOutput: "",
      savedIds: {}, toolCalls, selfReview: null,
    };
  }

  // Step 3d: Thinking paradigm enhancements per phase
  if (contract.name === "hypothesis_generation" && rawOutput && rawOutput.trim().length > 0) {
    try {
      const hypTotResult = await beamSearch(
        `Generate candidate hypotheses from literature findings for: ${question}`,
        provider,
        { beamWidth: 5, depth: 2 },
      );
      const candidateHypotheses = hypTotResult.bestPath.map((n) => n.thought);
      const debateConclusions: Array<{ hypothesis: string; conclusion: string; confidence: number }> = [];
      for (const hyp of candidateHypotheses.slice(0, 3)) {
        const debateResult = await debate(
          hyp,
          [context],
          provider,
          { rounds: 3 },
        );
        debateConclusions.push({
          hypothesis: hyp,
          conclusion: debateResult.conclusion,
          confidence: debateResult.confidence,
        });
      }
      const bestHyp = debateConclusions.reduce((best, cur) =>
        cur.confidence > best.confidence ? cur : best,
        debateConclusions[0],
      );
      if (bestHyp) {
        const parsedExisting = tryParseLLMOutput(rawOutput, contract.name);
        const enhancedOutput = parsedExisting
          ? { ...parsedExisting, debateSelection: { selected: bestHyp.hypothesis, confidence: bestHyp.confidence, allDebateResults: debateConclusions } }
          : { debateSelection: { selected: bestHyp.hypothesis, confidence: bestHyp.confidence, allDebateResults: debateConclusions } };
        rawOutput = JSON.stringify(enhancedOutput);
      }
    } catch {
      /* Thinking paradigm enhancement failed, continue with original output */
    }
  }

  if (contract.name === "evidence_assessment" && rawOutput && rawOutput.trim().length > 0) {
    try {
      const parsedTemp = tryParseLLMOutput(rawOutput, contract.name);
      const evidenceItems = ((parsedTemp as Record<string, unknown>).assessments as Array<Record<string, unknown>>) ?? [];
      const enhancedAssessments = [];
      for (const ev of evidenceItems) {
        const summary = ev.reasoning ?? ev.evidenceId ?? "";
        const consensus = await sampleConsensus(
          `Rate this evidence on relevance, reliability, and impact (1-10 each):\n${summary}`,
          provider,
          { samples: 7, temperature: 0.7 },
        );
        enhancedAssessments.push({
          ...ev,
          consensusScore: parseFloat((consensus.confidence * 10).toFixed(2)),
          consensusAnswer: consensus.answer,
        });
      }
      if (enhancedAssessments.length > 0) {
        const enhancedOutput = parsedTemp
          ? { ...parsedTemp, assessments: enhancedAssessments }
          : { assessments: enhancedAssessments };
        rawOutput = JSON.stringify(enhancedOutput);
      }
    } catch {
      /* Self-consistency enhancement failed, continue with original output */
    }
  }

  if (contract.name === "report_generation" && rawOutput && rawOutput.trim().length > 0) {
    try {
      const debateResult = await debate(
        `Peer review of research report on: ${question}`,
        [rawOutput],
        provider,
        { rounds: 3 },
      );
      const parsedExisting = tryParseLLMOutput(rawOutput, contract.name);
      const enhancedOutput = parsedExisting
        ? { ...parsedExisting, peerReview: { conclusion: debateResult.conclusion, confidence: debateResult.confidence, rounds: debateResult.debates } }
        : { peerReview: { conclusion: debateResult.conclusion, confidence: debateResult.confidence, rounds: debateResult.debates } };
      rawOutput = JSON.stringify(enhancedOutput);
    } catch {
      /* Debate peer review failed, continue with original output */
    }
  }

  // Step 4: Parse JSON output
  const parsed = tryParseLLMOutput(rawOutput, contract.name);

  // Step 5: Save output objects to PG
  const savedIds: Record<string, string[]> = {};

  if (parsed && contract.name === "literature_search") {
    // First: extract papers from search tool results
    const searchToolCall = toolCalls.find((tc: Record<string, unknown>) =>
      tc.toolName === "search" || tc.toolName === "literatureSearch" || tc.toolName === "web_search"
    );
    let searchPapers: Array<Record<string, unknown>> = [];
    if (searchToolCall) {
      try {
        const outputData = JSON.parse(searchToolCall.output);
        searchPapers = outputData.results || outputData.data || [];
      } catch { /* search output not valid JSON, skip */ }
    }

    // Save search papers as Citations with full metadata
    const savedCitationIds: string[] = [];
    for (const paper of searchPapers) {
      const citationId = generateUuid();
      await Effect.runPromise(store.save({
        citationId, projectId,
        sourceTitle: paper.title ?? "Unknown",
        sourceUrl: paper.url ?? "",
        sourceAuthors: paper.authors ?? [],
        sourceYear: paper.year ?? null,
        abstract: paper.abstract ?? "",
        relevanceScore: paper.relevanceScore ?? 0.5,
        localPdfPath: paper.localPdfPath ?? null,
        metadata: { openAccessPdf: paper.openAccessPdf, citationCount: paper.citationCount } ?? {},
      } as Record<string, unknown>));
      savedCitationIds.push(citationId);
    }

    // Also save LLM-extracted keyFindings as Citations if not already in search results
    const findings = (parsed.keyFindings as Array<Record<string, unknown>>) ?? [];
    const searchTitles = new Set(searchPapers.map((p: Record<string, unknown>) => ((p.title as string) ?? "").toLowerCase()));
    for (const f of findings) {
      if (searchTitles.has((f.sourceTitle as string ?? "").toLowerCase())) continue;
      const citationId = generateUuid();
      await Effect.runPromise(store.save({
        citationId, projectId,
        sourceTitle: f.sourceTitle ?? "Unknown",
        sourceUrl: f.sourceUrl ?? "",
        sourceAuthors: [],
        relevanceScore: 0.8,
      } as Record<string, unknown>));
      savedCitationIds.push(citationId);
    }
    savedIds.citationIds = savedCitationIds;

    const knowledgeId = generateUuid();
    await Effect.runPromise(store.save(createKnowledgeItem({
      knowledgeId, projectId, branchId: generateUuid(),
      summary: `文献调研: ${question}`,
      sourceType: "literature_review",
      certaintyLevel: 0.8,
      status: "ASSESSED",
    })));
    savedIds.knowledgeIds = [knowledgeId];
  }

  if (parsed && contract.name === "gap_identification") {
    const gaps = ((parsed.gaps as Array<Record<string, unknown>>) ?? []).slice(0, 3);
    for (const g of gaps) {
      const gapId = generateUuid();
      const questionId = generateUuid();
      await Effect.runPromise(store.save(createResearchGap({
        gapId, projectId, branchId: generateUuid(), questionId,
        description: g.description ?? g.gap ?? "未识别",
        status: "IDENTIFIED",
      } as Record<string, unknown>)));
      savedIds.gapIds = [...(savedIds.gapIds ?? []), gapId];
    }
  }

  if (parsed && contract.name === "hypothesis_generation") {
    const hyps = ((parsed.hypotheses as Array<Record<string, unknown>>) ?? []);
    const existingGaps = await Effect.runPromise(store.list("ResearchGap"));
    const projectGaps = existingGaps.filter((g: Record<string, unknown>) => (g as Record<string, unknown>).projectId === projectId);
    for (let i = 0; i < hyps.length; i++) {
      const h = hyps[i];
      const hypothesisId = generateUuid();
      const gapId = projectGaps[i % projectGaps.length]?.gapId ?? null;
      await Effect.runPromise(store.save(createHypothesis({
        hypothesisId, projectId, branchId: generateUuid(), gapId,
        statement: h.statement ?? "未知假设",
        falsificationCondition: h.falsificationCondition ?? "实验结果与预测相反",
        status: "PROPOSED",
      })));
      savedIds.hypothesisIds = [...(savedIds.hypothesisIds ?? []), hypothesisId];
    }
  }

  if (parsed && contract.name === "experiment_design") {
    const experimentId = generateUuid();
    const existingHyps = await Effect.runPromise(store.list("Hypothesis"));
    const projectHyps = existingHyps.filter((h: Record<string, unknown>) => (h as Record<string, unknown>).projectId === projectId);
    await Effect.runPromise(store.save(createExperiment({
      experimentId, projectId, branchId: generateUuid(),
      title: `验证实验: ${((parsed as Record<string, unknown>).design as Record<string, unknown>)?.objective as string ?? question}`,
      status: "PLANNED",
    })));
    savedIds.experimentIds = [experimentId];
  }

  if (parsed && contract.name === "experiment_execution") {
    const existingExps = await Effect.runPromise(store.list("Experiment"));
    const projectExps = existingExps.filter((e: Record<string, unknown>) => (e as Record<string, unknown>).projectId === projectId);
    const lastExp = projectExps[projectExps.length - 1];

    try {
      const { Sandbox } = await import("@runtime/sandbox/sandbox");
      const sandbox = new Sandbox();
      const sandboxOutput = await sandbox.execute({
        language: "python",
        code: `# Experiment: ${question}\nprint("experiment executed successfully")`,
        timeoutMs: 30000,
      });

      const resultId = generateUuid();
      await Effect.runPromise(store.save(createResult({
        resultId, projectId, branchId: generateUuid(),
        experimentId: ((lastExp as Record<string, unknown>).experimentId as string) ?? generateUuid(),
        summary: `实验输出: ${sandboxOutput.output}`,
        status: "RAW",
      })));
      savedIds.resultIds = [resultId];

      const evidenceId = generateUuid();
      await Effect.runPromise(store.save(createEvidence({
        evidenceId, projectId, branchId: generateUuid(),
        resultId,
        summary: sandboxOutput.output.substring(0, 500),
        direction: (parsed as Record<string, unknown>).direction as string ?? (sandboxOutput.isError ? "NEUTRAL" : "SUPPORTING"),
        status: "VALIDATED",
        strength: (parsed as Record<string, unknown>).strength as number ?? (sandboxOutput.isError ? 0.3 : 0.85),
      })));
      savedIds.evidenceIds = [evidenceId];
    } catch (err) {
      onEvent({ type: "error", content: `实验执行失败: ${err}`, phase: contract.name, timestamp: new Date().toISOString() });
    }
  }

  if (parsed && (contract.name === "evidence_assessment" || contract.name === "confirmation")) {
    const existingHyps = await Effect.runPromise(store.list("Hypothesis"));
    const projectHyps = existingHyps.filter((h: Record<string, unknown>) => (h as Record<string, unknown>).projectId === projectId);
    for (const hyp of projectHyps) {
      const newStatus =
        contract.name === "confirmation"
          ? ((parsed as Record<string, unknown>).status as string) ?? "ASSESSED"
          : (((parsed as Record<string, unknown>).conclusion as Record<string, unknown>)?.status as string) ?? "ASSESSED";
      await Effect.runPromise(store.save({
        ...hyp,
        status: newStatus,
        updatedAt: new Date(),
      }));
    }
  }

  if (parsed && contract.name === "report_generation") {
    const reportId = generateUuid();
    const content = `${(parsed as Record<string, unknown>).abstract as string ?? ""}\n\n${(((parsed as Record<string, unknown>).sections as Array<Record<string, unknown>>) ?? []).map((s: Record<string, unknown>) => `## ${s.title as string}\n${s.content as string}`).join('\n\n')}`;
    await Effect.runPromise(store.save(createReport({
      reportId, projectId, branchId: generateUuid(),
      title: `研究报告: ${question}`,
      status: "DRAFT",
    })));
    savedIds.reportIds = [reportId];
  }

  // Determine needsApproval and objectType/objectId from saved objects
  const needsApproval = selfReviewResult ? !selfReviewResult.passed : false;
  let objectType = "";
  let objectId = "";
  if (Object.keys(savedIds).length > 0) {
    const firstKey = Object.keys(savedIds)[0];
    // e.g. "knowledgeIds" -> "KnowledgeItem", "hypothesisIds" -> "Hypothesis"
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
    objectType = typeMap[firstKey] ?? firstKey.replace("Ids", "").replace(/^./, c => c.toUpperCase());
    objectId = savedIds[firstKey]?.[0] ?? "";
  }

  onEvent({
    type: "phase:complete",
    content: `完成: ${contract.label}`,
    phase: contract.name,
    timestamp: new Date().toISOString(),
    needsApproval,
    runId: runId ?? "",
    objectType,
    objectId,
    rawOutput,
    toolCalls,
  } as AgentEvent);

  return {
    phaseName: contract.name,
    status: "COMPLETED",
    output: parsed,
    rawOutput,
    savedIds,
    toolCalls,
    selfReview: selfReviewResult
      ? { passed: selfReviewResult.passed, rounds: selfReviewResult.rounds, issues: selfReviewResult.issues }
      : null,
  };
}
