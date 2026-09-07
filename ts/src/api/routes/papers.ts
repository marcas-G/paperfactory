import * as Effect from "effect/Effect";
import { Hono } from "hono";
import { ObjectStore } from "@persistence/object-store";
import { apiError } from "../utils";
import { toPaper } from "../types";

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

  return router;
}
