import * as Effect from "effect/Effect";
import type { WorkflowPhase } from "@pf/core/runtime/workflows/engine";
import { runWorkflow } from "@pf/core/runtime/workflows/engine";
import type { ObjectStore } from "@pf/core/persistence/object-store";
import type { EventStore } from "@pf/core/persistence/event-store";
import type { ResearchController } from "@pf/core/control/controller";
import { createKnowledgeItem, type KnowledgeItem } from "@pf/schema/objects/knowledge";
import { createReport } from "@pf/schema/objects/report";
import { createEvidence } from "@pf/schema/objects/evidence";
import { createResult } from "@pf/schema/objects/result";
import { createExperiment } from "@pf/schema/objects/experiment";
import type { Hypothesis } from "@pf/schema/objects/hypothesis";
import { createEmptyManifest } from "./manifest";

import { generateUuid } from "./shared";
import { literatureSearchTool, type ArxivPaper } from "@pf/core/runtime/tools/builtins/literature";

type Provider = NonNullable<HypothesisVerificationContext["provider"]>;

/** LLM 调用统一入口：断线/网关抖动重试一次（主体健壮性）。 */
async function sendWithRetry(
  provider: Provider,
  prompt: string,
  retries = 1
): Promise<{ content: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Effect.runPromise(provider.sendMessages([{ role: "user", content: prompt }]));
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

export interface HypothesisVerificationContext {
  hypothesisId: string;
  projectId: string;
  branchId: string;
  researchQuery?: string;
  provider?: import("@pf/core/runtime/provider").Provider;
  objectStore: ObjectStore;
  eventStore: EventStore;
  controller: ResearchController;
  literatureResults?: Array<{ summary: string; certaintyLevel: number }>;
}

export function createHypothesisVerificationWorkflow(
  ctx: HypothesisVerificationContext
): ReadonlyArray<WorkflowPhase> {
  const manifest = createEmptyManifest();

  return [
    {
      name: "literature_search",
      execute: () => {
        return Effect.promise(async () => {
          const items: KnowledgeItem[] = [];

          if (ctx.provider && ctx.researchQuery) {
            // 检索式转写：研究问题 → arXiv 友好的学术检索式（去教育措辞、保留核心概念）
            let searchQuery = ctx.researchQuery;
            try {
              const rewrite = await sendWithRetry(
                ctx.provider,
                `Convert this research question into a short academic literature search query ` +
                  `(3-6 words, core concepts only, no question mark, no field jargon like "effectiveness"):\n` +
                  `"${ctx.researchQuery}"\nRespond with ONLY the query text, nothing else.`
              );
              const rewritten = rewrite.content.trim().replace(/^["']|["']$/g, "");
              if (rewritten.length > 2 && rewritten.length < 120) {
                searchQuery = rewritten;
              }
            } catch {
              // 转写失败就用原问题
            }

            // 真实检索链：arXiv API 取真论文 → LLM 逐篇评估 → 存 knowledge items
            const toolResult = await Effect.runPromise(
              literatureSearchTool.execute({ query: searchQuery, maxResults: 5 })
            );
            const papers = (toolResult.papers as ArxivPaper[]) ?? [];

            interface Assessment {
              index: number;
              relevance: number;
              certaintyLevel: number;
              summary: string;
            }
            let assessments: Assessment[] = [];
            if (papers.length > 0) {
              const listing = papers
                .map(
                  (paper, index) =>
                    `[${index}] Title: ${paper.title}\nAbstract: ${paper.summary.slice(0, 500)}\nURL: ${paper.url}`
                )
                .join("\n\n");
              const evalPrompt =
                `You are a research literature assessor. For each paper below, judge its relevance to this ` +
                `research question:\n"${ctx.researchQuery}"\n\nPapers:\n${listing}\n\n` +
                `Respond with ONLY a JSON array (no markdown fences), one object per paper:\n` +
                `[{"index":0,"relevance":0.8,"certaintyLevel":0.7,"summary":"one-sentence summary of the finding"}]\n` +
                `relevance/certaintyLevel are 0-1; summary is one sentence about what the paper establishes.`;
              try {
                const response = await sendWithRetry(ctx.provider, evalPrompt);
                const jsonText = response.content.slice(
                  response.content.indexOf("["),
                  response.content.lastIndexOf("]") + 1
                );
                assessments = JSON.parse(jsonText) as Assessment[];
              } catch (error) {
                console.warn("literature assessment fallback (LLM parse failed):", String(error));
              }
            }

            const byIndex = new Map(assessments.map((a) => [a.index, a]));
            for (const [index, paper] of papers.entries()) {
              const assessed = byIndex.get(index);
              const relevance = typeof assessed?.relevance === "number" ? assessed.relevance : 0.5;
              if (relevance < 0.3) continue; // 低相关直接不入库
              const item = createKnowledgeItem({
                knowledgeId: generateUuid(),
                projectId: ctx.projectId,
                branchId: ctx.branchId,
                summary:
                  assessed?.summary?.trim() ||
                  `${paper.title} — ${paper.summary.slice(0, 200)}`,
                sourceType: "paper",
                sourceIds: [paper.url], // 真实来源：可点开验证
                certaintyLevel:
                  typeof assessed?.certaintyLevel === "number" ? assessed.certaintyLevel : 0.5,
                status: "ASSESSED",
                tags: ["arxiv", `${paper.published.slice(0, 4)}`],
                metadata: { title: paper.title, authors: paper.authors, url: paper.url },
              });
              await Effect.runPromise(ctx.objectStore.save(item));
              items.push(item);
            }
          } else if (ctx.literatureResults) {
            for (const result of ctx.literatureResults) {
              const item = createKnowledgeItem({
                knowledgeId: generateUuid(),
                projectId: ctx.projectId,
                branchId: ctx.branchId,
                summary: result.summary,
                sourceType: "paper",
                certaintyLevel: result.certaintyLevel,
                status: "ASSESSED",
              });
              await Effect.runPromise(ctx.objectStore.save(item));
              items.push(item);
            }
          }

          manifest.knowledgeItems = items;
          return { knowledgeItems: items, phase: "literature_search" };
        });
      },
    },
    {
      name: "experiment_design",
      execute: (input) => {
        return Effect.promise(async () => {
          const knowledgeItems = input.knowledgeItems as Array<Record<string, unknown>> | undefined;
          let protocol = "print('experiment executed')";

          // 有 provider 时：基于文献与研究问题生成一个可执行的模拟实验协议
          if (ctx.provider && ctx.researchQuery) {
            const findings = (knowledgeItems ?? [])
              .map((item) => `- ${(item as { summary?: string }).summary ?? ""}`)
              .slice(0, 5)
              .join("\n");
            const designPrompt =
              `You are designing a computational experiment for this research question:\n` +
              `"${ctx.researchQuery}"\n\n` +
              `Known literature findings:\n${findings || "(none)"}\n\n` +
              `Write a self-contained Python 3 script (standard library only, no network, no file access) ` +
              `that runs a small simulation illustrating the core phenomenon (e.g. spaced vs massed practice ` +
              `in a memory model). It must print numeric results. Respond with ONLY the Python code, no markdown fences.`;
            try {
              const response = await sendWithRetry(ctx.provider, designPrompt);
              let code = response.content.trim();
              if (code.includes("```")) {
                code = code.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
              }
              if (code.includes("print")) protocol = code;
            } catch (error) {
              console.warn("experiment design fallback (LLM failed):", String(error));
            }
          }

          const experiment = createExperiment({
            experimentId: generateUuid(),
            projectId: ctx.projectId,
            branchId: ctx.branchId,
            title: "Verification Experiment",
            status: "PLANNED",
            protocol,
          } as Parameters<typeof createExperiment>[0]);
          await Effect.runPromise(ctx.objectStore.save(experiment));
          manifest.experiments = [...manifest.experiments, experiment];
          return {
            experiment,
            knowledgeItems,
            phase: "experiment_design",
          };
        });
      },
    },
    {
      name: "evidence_collection",
      execute: () => {
        return Effect.promise(async () => {
          const { Sandbox } = await import("@pf/core/runtime/sandbox/sandbox");
          const sandbox = new Sandbox();

          const experiment =
            manifest.experiments[manifest.experiments.length - 1] as
              | Record<string, unknown>
              | undefined;

          const code = (experiment?.protocol as string) ?? "print('experiment executed')";
          const sandboxResult = await sandbox.execute({
            language: "python",
            code,
            timeoutMs: 30000,
          });

          const result = createResult({
            resultId: generateUuid(),
            projectId: ctx.projectId,
            branchId: ctx.branchId,
            experimentId: (experiment?.experimentId as string) ?? generateUuid(),
            summary: sandboxResult.isError
              ? `Experiment had issues: ${sandboxResult.output}`
              : `Experiment output: ${sandboxResult.output}`,
            status: "RAW",
          });
          await Effect.runPromise(ctx.objectStore.save(result));

          const direction = sandboxResult.isError ? "NEUTRAL" : "SUPPORTING";
          const strength = sandboxResult.isError ? 0.3 : 0.85;

          const evidence = createEvidence({
            evidenceId: generateUuid(),
            projectId: ctx.projectId,
            branchId: ctx.branchId,
            resultId: result.resultId,
            summary: sandboxResult.output,
            direction,
            status: "VALIDATED",
            strength,
          });
          await Effect.runPromise(ctx.objectStore.save(evidence));
          manifest.evidence = [...manifest.evidence, evidence];

          return {
            result,
            evidence,
            sandboxResult,
            phase: "evidence_collection",
          };
        });
      },
    },
    {
      name: "link_evidence_and_assess",
      execute: () => {
        return Effect.promise(async () => {
          const opt = await Effect.runPromise(
            ctx.objectStore.get(ctx.hypothesisId, "Hypothesis")
          );

          const evidenceList = await Effect.runPromise(
            ctx.objectStore.list("Evidence")
          );
          const evidenceIds = evidenceList
            .map((e) => e.evidenceId)
            .filter((id): id is string => typeof id === "string");

          if (opt.isSome()) {
            const hypothesis = opt.value as Record<string, unknown>;
            const updatedHypothesis = {
              ...hypothesis,
              supportingEvidenceIds: evidenceIds,
            };
            await Effect.runPromise(ctx.objectStore.save(updatedHypothesis));
          }

          const assessResult = await ctx.controller.execute({
            actionName: "assess_hypothesis",
            objectId: ctx.hypothesisId,
            objectType: "Hypothesis",
          });

          const activateResult = await ctx.controller.execute({
            actionName: "activate_hypothesis",
            objectId: ctx.hypothesisId,
            objectType: "Hypothesis",
          });

          return {
            assessResult,
            activateResult,
            phase: "link_evidence_and_assess",
          };
        });
      },
    },
    {
      name: "confirm",
      execute: () => {
        return Effect.promise(async () => {
          const controllerResult = await ctx.controller.execute({
            actionName: "confirm_hypothesis",
            objectId: ctx.hypothesisId,
            objectType: "Hypothesis",
          });

          if (controllerResult.success) {
            const updatedOpt = await Effect.runPromise(
              ctx.objectStore.get(ctx.hypothesisId, "Hypothesis")
            );
            if (updatedOpt.isSome()) {
              manifest.hypotheses = [updatedOpt.value as Hypothesis];
            }
          }

          return {
            controllerResult,
            hypothesisConfirmed: controllerResult.success,
            manifest,
            phase: "confirm",
          };
        });
      },
    },
    {
      name: "report_generation",
      execute: () => {
        return Effect.promise(async () => {
          const reportId = generateUuid();
          const report = createReport({
            reportId,
            projectId: ctx.projectId,
            branchId: ctx.branchId,
            title: "Research Report",
            status: "DRAFT",
          });
          await Effect.runPromise(ctx.objectStore.save(report));

          if (ctx.provider) {
            const prompt = `Generate a research report based on the following findings:
Hypothesis: ${manifest.hypotheses[0]?.statement ?? "Unknown"}
Evidence: ${manifest.evidence.map((e) => JSON.stringify(e)).join(", ")}
Knowledge: ${manifest.knowledgeItems.map((k) => JSON.stringify(k)).join(", ")}

Format as a structured report with abstract, introduction, methods, results, and conclusion.`;

            const response = await sendWithRetry(ctx.provider, prompt);

            const updatedReport = { ...report, content: response.content };
            await Effect.runPromise(ctx.objectStore.save(updatedReport as Record<string, unknown>));
            manifest.reports = [updatedReport];
          } else {
            manifest.reports = [report];
          }

          return {
            reportId,
            report: manifest.reports[0],
            manifest,
            phase: "report_generation",
          };
        });
      },
    },
  ];
}

export { runWorkflow };
