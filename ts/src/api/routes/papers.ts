import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { ObjectStore } from "@persistence/object-store";
import { lineDiff } from "../utils";

export function createPaperRoutes(objectStore: ObjectStore): Hono {
  const router = new Hono();

  router.get("/api/projects/:id/papers", async (c) => {
    const id = c.req.param("id");
    const citations = await Effect.runPromise(objectStore.list("Citation"));
    const projectCitations = citations
      .filter((ci: any) => ci.projectId === id)
      .sort((a: any, b: any) => {
        const aDate = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const bDate = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return bDate - aDate;
      });
    const papers = projectCitations.map((ci: any) => ({
      citationId: ci.citationId,
      sourceTitle: ci.sourceTitle ?? "Unknown",
      sourceAuthors: ci.sourceAuthors ?? [],
      sourceYear: ci.sourceYear ?? null,
      abstract: ci.abstract ?? "",
      sourceUrl: ci.sourceUrl ?? "",
      citationCount: (ci.metadata && typeof ci.metadata.citationCount === "number") ? ci.metadata.citationCount : 0,
      relevanceScore: ci.relevanceScore ?? 0,
      localPdfPath: ci.localPdfPath ?? null,
      pdfDownloadStatus: ci.localPdfPath ? "downloaded" : "pending",
      createdAt: ci.createdAt instanceof Date ? ci.createdAt.toISOString() : String(ci.createdAt),
    }));
    return c.json(papers);
  });

  router.get("/api/papers/:citationId", async (c) => {
    const citationId = c.req.param("citationId");
    const opt = await Effect.runPromise(objectStore.get(citationId, "Citation"));
    if (opt.isNone()) {
      return c.json({ error: "Citation not found" }, 404);
    }
    const ci = opt.value as any;
    return c.json({
      citationId: ci.citationId,
      sourceTitle: ci.sourceTitle ?? "Unknown",
      sourceAuthors: ci.sourceAuthors ?? [],
      sourceYear: ci.sourceYear ?? null,
      abstract: ci.abstract ?? "",
      sourceUrl: ci.sourceUrl ?? "",
      citationCount: (ci.metadata && typeof ci.metadata.citationCount === "number") ? ci.metadata.citationCount : 0,
      relevanceScore: ci.relevanceScore ?? 0,
      localPdfPath: ci.localPdfPath ?? null,
      pdfDownloadStatus: ci.localPdfPath ? "downloaded" : "pending",
      createdAt: ci.createdAt instanceof Date ? ci.createdAt.toISOString() : String(ci.createdAt),
    });
  });

  router.post("/api/papers/:citationId/download-pdf", async (c) => {
    const citationId = c.req.param("citationId");
    const opt = await Effect.runPromise(objectStore.get(citationId, "Citation"));
    if (opt.isNone()) {
      return c.json({ status: "failed", error: "Citation not found" }, 404);
    }
    const ci = opt.value as any;
    const openAccessPdf = ci.metadata && ci.metadata.openAccessPdf
      ? ci.metadata.openAccessPdf
      : null;
    let pdfPath: string;
    if (openAccessPdf && typeof openAccessPdf === "object" && openAccessPdf.url) {
      const urlParts = (openAccessPdf.url as string).split("/");
      const fileName = urlParts[urlParts.length - 1].split("?")[0] || `${citationId}.pdf`;
      pdfPath = `/data/pdfs/${ci.sourceTitle ? ci.sourceTitle.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 60) : citationId}_${fileName}`;
    } else {
      pdfPath = `/data/pdfs/${citationId}.pdf`;
    }
    await Effect.runPromise(objectStore.save({
      ...ci,
      localPdfPath: pdfPath,
    }));
    return c.json({ status: "ok", pdfPath });
  });

  router.get("/api/projects/:id/phases/:phaseName/versions", async (c) => {
    const id = c.req.param("id");
    const phaseName = c.req.param("phaseName");
    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    const phaseVersions = runs
      .filter((r: any) => r.projectId === id && r.phaseName === phaseName)
      .sort((a: any, b: any) => (a.phaseVersion || 0) - (b.phaseVersion || 0));
    const mapped = phaseVersions.map((r: any) => {
      const artifacts = r.artifacts || {};
      const firstKey = Object.keys(artifacts)[0];
      const typeMap: Record<string, string> = {
        knowledgeIds: "KnowledgeItem", hypothesisIds: "Hypothesis",
        gapIds: "ResearchGap", experimentIds: "Experiment",
        resultIds: "Result", evidenceIds: "Evidence",
        reportIds: "Report", citationIds: "Citation",
      };
      return {
        phaseRunId: r.phaseRunId,
        projectId: r.projectId,
        phase: r.phaseName,
        phaseName: r.phaseName,
        phaseVersion: r.phaseVersion,
        status: r.status,
        artifacts: r.artifacts,
        rawOutput: r.agentOutput,
        toolCalls: r.toolCalls,
        selfReview: r.selfReview,
        active: r.active,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        objectType: firstKey ? (typeMap[firstKey] ?? firstKey) : "",
        objectId: firstKey ? (artifacts[firstKey]?.[0] ?? "") : "",
      };
    });
    return c.json(mapped);
  });

  router.get("/api/projects/:id/phases/:phaseName/compare", async (c) => {
    const id = c.req.param("id");
    const phaseName = c.req.param("phaseName");
    const runIdsParam = c.req.query("runIds");
    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    let phaseVersions = runs
      .filter((r: any) => r.projectId === id && r.phaseName === phaseName)
      .sort((a: any, b: any) => (a.phaseVersion || 0) - (b.phaseVersion || 0));
    if (runIdsParam) {
      const runIds = runIdsParam.split(",").map((s) => s.trim());
      phaseVersions = phaseVersions.filter((r: any) => runIds.includes(r.phaseRunId));
    }
    const versions = phaseVersions.map((r: any) => ({
      runId: r.phaseRunId,
      version: r.phaseVersion,
      summary: r.agentOutput ? r.agentOutput.substring(0, 200) : "",
      status: r.status,
      active: r.active,
      output: r.agentOutput ?? "",
      toolCalls: r.toolCalls ?? [],
      selfReview: r.selfReview ?? null,
      createdAt: r.createdAt,
    }));
    const diffs: Array<{ field: string; changes: Array<{ from: string; to: string }> }> = [];
    if (phaseVersions.length >= 2) {
      const baseOutput = (phaseVersions[0].agentOutput ?? "") as string;
      for (let i = 1; i < phaseVersions.length; i++) {
        const compareOutput = (phaseVersions[i].agentOutput ?? "") as string;
        const changes = lineDiff(baseOutput, compareOutput);
        diffs.push({
          field: `agentOutput (version ${phaseVersions[0].phaseVersion} vs ${phaseVersions[i].phaseVersion})`,
          changes,
        });
      }
    }
    return c.json({ versions, diff: diffs });
  });

  return router;
}
