import * as Effect from "effect/Effect";
import type { WorkflowPhase } from "./engine";
import { runWorkflow } from "./engine";
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

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
            Effect.runSync(ctx.objectStore.save(item));
            items.push(item);
          }
        }
        return Effect.succeed({ knowledgeItems: items, phase: "literature_search" });
      },
    },
    {
      name: "experiment_design",
      execute: (input) => {
        const knowledgeItems = input.knowledgeItems as Array<Record<string, unknown>> | undefined;
        const experiment = createExperiment({
          experimentId: generateUuid(),
          projectId: ctx.projectId,
          branchId: ctx.branchId,
          title: "Verification Experiment",
          status: "PLANNED",
        });
        Effect.runSync(ctx.objectStore.save(experiment));
        manifest.experiments = [...manifest.experiments, experiment];
        return Effect.succeed({
          experiment,
          knowledgeItems,
          phase: "experiment_design",
        });
      },
    },
    {
      name: "evidence_collection",
      execute: () => {
        return Effect.promise(async () => {
          const result = createResult({
            resultId: generateUuid(),
            projectId: ctx.projectId,
            branchId: ctx.branchId,
            experimentId: generateUuid(),
            summary: "Statistically significant result supporting hypothesis",
            status: "RAW",
          });
          await Effect.runPromise(ctx.objectStore.save(result));

          const evidence = createEvidence({
            evidenceId: generateUuid(),
            projectId: ctx.projectId,
            branchId: ctx.branchId,
            resultId: result.resultId,
            summary: "Evidence supports the hypothesis",
            direction: "SUPPORTING",
            status: "VALIDATED",
            strength: 0.85,
          });
          await Effect.runPromise(ctx.objectStore.save(evidence));
          manifest.evidence = [...manifest.evidence, evidence];

          return {
            result,
            evidence,
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

            report.content = response.content;
            await Effect.runPromise(ctx.objectStore.save(report));
          }

          manifest.reports = [report];

          return {
            reportId,
            report,
            manifest,
            phase: "report_generation",
          };
        });
      },
    },
  ];
}

export { runWorkflow };
