import * as fs from "fs";
import * as path from "path";

export interface PaperArchiveResult {
  paperId: string;
  title: string;
  pdfPath: string | null;
  error: string | null;
}

export async function archivePaper(
  projectId: string,
  paper: {
    paperId?: string;
    title: string;
    abstract?: string;
    authors?: string[];
    year?: number | null;
    url?: string;
    citationCount?: number;
    openAccessPdf?: string | null;
  },
  citationId: string,
  baseDir = "/app/data/papers"
): Promise<PaperArchiveResult> {
  const pdfUrl = paper.openAccessPdf || paper.url || null;
  if (!pdfUrl) {
    return { paperId: paper.paperId ?? citationId, title: paper.title, pdfPath: null, error: null };
  }

  try {
    const projectDir = path.join(baseDir, projectId);
    const pdfPath = path.join(projectDir, `${citationId}.pdf`);

    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    const response = await fetch(pdfUrl, {
      headers: {
        "User-Agent": "PaperFactory/1.0 (Research Assistant)",
      },
    });

    if (!response.ok) {
      return { paperId: paper.paperId ?? citationId, title: paper.title, pdfPath: null, error: `HTTP ${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(pdfPath, Buffer.from(buffer));

    return { paperId: paper.paperId ?? citationId, title: paper.title, pdfPath, error: null };
  } catch (err) {
    return {
      paperId: paper.paperId ?? citationId,
      title: paper.title,
      pdfPath: null,
      error: String(err),
    };
  }
}

export async function archivePapers(
  projectId: string,
  papers: Array<Record<string, unknown>>,
  objectStore: { save: (obj: unknown) => Promise<unknown> }
): Promise<Array<PaperArchiveResult>> {
  const results: PaperArchiveResult[] = [];

  for (const paper of papers) {
    const citationId = (paper.citationId as string) ?? crypto.randomUUID();
    const pdfPath = (paper.localPdfPath as string) ?? null;

    const archiveResult = await archivePaper(
      projectId,
      {
        paperId: paper.paperId as string,
        title: (paper.title as string) ?? "",
        abstract: paper.abstract as string,
        authors: paper.authors as string[],
        year: paper.year as number | null,
        url: paper.url as string,
        citationCount: paper.citationCount as number,
        openAccessPdf: paper.openAccessPdf as string | null,
      },
      citationId
    );

    // Update citation with localPdfPath
    if (archiveResult.pdfPath && objectStore) {
      try {
        await objectStore.save({
          citationId,
          projectId,
          sourceTitle: paper.title,
          sourceUrl: paper.url,
          sourceAuthors: paper.authors,
          sourceYear: paper.year,
          abstract: paper.abstract,
          relevanceScore: paper.relevanceScore ?? 0.5,
          localPdfPath: archiveResult.pdfPath,
          metadata: {},
          createdAt: new Date().toISOString(),
        });
      } catch {
        // Silently fail — citation may already exist
      }
    }

    results.push(archiveResult);
  }

  return results;
}
