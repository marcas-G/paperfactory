import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { ObjectStore } from "@persistence/object-store";
import { lineDiff, apiError } from "../utils";
import { toPaper, toPhaseRunDTO } from "../types";

export function createPaperRoutes(objectStore: ObjectStore): Hono {
  const router = new Hono();

  router.get("/api/projects/:id/papers", async (c) => {
    const id = c.req.param("id");
    const citations = await Effect.runPromise(objectStore.list("Citation"));
    const projectCitations = citations
      .filter((ci: Record<string, unknown>) => ci.projectId === id)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aDate = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(String(a.createdAt)).getTime();
        const bDate = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(String(b.createdAt)).getTime();
        return bDate - aDate;
      });
    const papers = projectCitations.map((ci: Record<string, unknown>) => toPaper(ci));
    return c.json(papers);
  });

  router.get("/api/papers/:citationId", async (c) => {
    const citationId = c.req.param("citationId");
    const opt = await Effect.runPromise(objectStore.get(citationId, "Citation"));
    if (opt.isNone()) {
      return c.json(apiError("NOT_FOUND", "Citation not found"), 404);
    }
    const ci = opt.value as Record<string, unknown>;
    return c.json(toPaper(ci));
  });

  router.post("/api/papers/:citationId/download-pdf", async (c) => {
    const citationId = c.req.param("citationId");
    const opt = await Effect.runPromise(objectStore.get(citationId, "Citation"));
    if (opt.isNone()) {
      return c.json(apiError("NOT_FOUND", "Citation not found"), 404);
    }
    const ci = opt.value as Record<string, unknown>;
    const metadata = ci.metadata as Record<string, unknown> | undefined;
    const openAccessPdf = metadata && typeof metadata === "object" && "openAccessPdf" in metadata
      ? metadata.openAccessPdf as Record<string, unknown>
      : null;
    let pdfPath: string;
    if (openAccessPdf && typeof openAccessPdf === "object" && "url" in openAccessPdf) {
      const urlParts = String(openAccessPdf.url).split("/");
      const fileName = urlParts[urlParts.length - 1].split("?")[0] || `${citationId}.pdf`;
      pdfPath = `/data/pdfs/${ci.sourceTitle ? String(ci.sourceTitle).replace(/[^a-zA-Z0-9]/g, "_").substring(0, 60) : citationId}_${fileName}`;
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
      .filter((r: Record<string, unknown>) => r.projectId === id && r.phaseName === phaseName)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.phaseVersion || 0) - Number(b.phaseVersion || 0));
    const mapped = phaseVersions.map((r: Record<string, unknown>) => toPhaseRunDTO(r));
    return c.json(mapped);
  });

  router.get("/api/projects/:id/phases/:phaseName/compare", async (c) => {
    const id = c.req.param("id");
    const phaseName = c.req.param("phaseName");
    const runIdsParam = c.req.query("runIds");
    const runs = await Effect.runPromise(objectStore.list("PhaseRun"));
    let phaseVersions = runs
      .filter((r: Record<string, unknown>) => r.projectId === id && r.phaseName === phaseName)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.phaseVersion || 0) - Number(b.phaseVersion || 0));
    if (runIdsParam) {
      const runIds = runIdsParam.split(",").map((s) => s.trim());
      phaseVersions = phaseVersions.filter((r: Record<string, unknown>) => runIds.includes(String(r.phaseRunId)));
    }
    const versions = phaseVersions.map((r: Record<string, unknown>) => ({
      runId: r.phaseRunId,
      version: r.phaseVersion,
      summary: r.agentOutput ? String(r.agentOutput).substring(0, 200) : "",
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
