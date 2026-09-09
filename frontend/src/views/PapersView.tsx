import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Download, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import client from '@/api/client';
import { pf } from '@/api/pfClient';
import type { Paper } from '@/api/types';

export default function PapersView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    pf.getProjectPapers(projectId)
      .then((data) => setPapers(Array.isArray(data) ? data : []))
      .catch(() => setPapers([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const filtered = papers.filter((p) =>
    !search || p.sourceTitle.toLowerCase().includes(search.toLowerCase()) || (((p as unknown as Record<string, unknown>).authors as string[] | undefined)?.join('') ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const downloadPdf = async (citationId: string) => {
    try { await pf.downloadPaperPdf(citationId); } catch {}
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-base/50 bg-bg-layer1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-text-muted hover:text-text-strong text-sm cursor-pointer">← Back</button>
            <h1 className="text-lg font-semibold text-text-strong">{t('nav.papers')}</h1>
            <span className="text-[12px] text-text-muted">{papers.length} papers</span>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-bg-base border border-border-base/50 rounded-lg px-3 py-2">
          <Search size={14} className="text-text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search papers..."
            className="flex-1 bg-transparent text-[13px] text-text-strong outline-none placeholder:text-text-faint"
          />
        </div>
      </div>

      {/* Paper list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
        {loading ? (
          <div className="text-center py-16 text-text-faint text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-text-faint text-sm">No papers found</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((paper) => (
              <div key={paper.citationId} className="bg-bg-layer1 border border-border-base/50 rounded-lg overflow-hidden hover:border-border-strong/50 transition-colors">
                <button onClick={() => setExpandedId(expandedId === paper.citationId ? null : paper.citationId)} className="w-full text-left px-4 py-3 cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-text-strong leading-relaxed">{paper.sourceTitle}</div>
                      <div className="text-[12px] text-text-muted mt-0.5">
                        {paper.sourceAuthors?.join(', ')} · {paper.sourceYear}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-text-faint">{paper.citationCount} citations</span>
                      <span className="text-[11px] text-text-faint">{(paper.relevanceScore * 100).toFixed(0)}% relevant</span>
                      {expandedId === paper.citationId ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
                    </div>
                  </div>
                </button>
                {expandedId === paper.citationId && (
                  <div className="px-4 pb-3 border-t border-border-base/50">
                    {paper.abstract && (
                      <div className="mt-2 text-[12px] text-text-base leading-relaxed">
                        <div className="text-text-muted text-[11px] font-semibold uppercase mb-1">Abstract</div>
                        {paper.abstract}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      {paper.sourceUrl && (
                        <a href={paper.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] text-accent hover:text-accentHover cursor-pointer">
                          <ExternalLink size={12} />
                          <span>Source</span>
                        </a>
                      )}
                      <button onClick={() => downloadPdf(paper.citationId)} className="flex items-center gap-1 text-[12px] text-accent hover:text-accentHover cursor-pointer">
                        <Download size={12} />
                        <span>PDF</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
