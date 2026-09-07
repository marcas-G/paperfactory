import * as Effect from "effect/Effect";
import type { WorkflowPhase } from "@runtime/workflows/engine";
import { runWorkflow } from "@runtime/workflows/engine";
import type { ObjectStore } from "@persistence/object-store";
import type { EventStore } from "@persistence/event-store";
import type { ResearchController } from "@control/controller";
import { createKnowledgeItem } from "@domain/objects/knowledge";
import { createReport } from "@domain/objects/report";
import { createEvidence } from "@domain/objects/evidence";
import { createResult } from "@domain/objects/result";
import { createExperiment } from "@domain/objects/experiment";
import type { Hypothesis } from "@domain/objects/hypothesis";
import { createEmptyManifest } from "./manifest";

import { generateUuid } from "./shared";

export interface HypothesisVerificationContext {
  hypothesisId: string;
  projectId: string;
  branchId: string;
  provider?: import("@runtime/provider").Provider;
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
          const items: Array<Record<string, unknown>> = [];
          if (ctx.literatureResults) {
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
          return { knowledgeItems: items, phase: "literature_search" };
        });
      },
    },
    {
      name: "experiment_design",
      execute: (input) => {
        return Effect.promise(async () => {
          const knowledgeItems = input.knowledgeItems as Array<Record<string, unknown>> | undefined;
          const experiment = createExperiment({
            experimentId: generateUuid(),
            projectId: ctx.projectId,
            branchId: ctx.branchId,
            title: "Verification Experiment",
            status: "PLANNED",
          });
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
          const { Sandbox } = await import("@runtime/sandbox/sandbox");
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

            const response = await Effect.runPromise(
              ctx.provider.sendMessages([{ role: "user", content: prompt }])
            );

            const updatedReport = { ...report, content: response.content };
            await Effect.runPromise(ctx.objectStore.save(updatedReport as unknown as import("@persistence/object-store").ResearchObject));
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
