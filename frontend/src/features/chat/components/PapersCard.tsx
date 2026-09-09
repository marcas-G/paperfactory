/**
 * PapersCard —— 文献卡片（从 AIMessage 拆出）。
 */
import { FileText, ExternalLink } from 'lucide-react';
import type { PaperInfo } from '@/features/chat/types';

export default function PapersCard({ papers }: { papers: PaperInfo[] }) {
  return (
    <div className="mt-2 rounded-xl border border-border-base bg-bg-layer1 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border-base">
        <FileText size={13} className="text-accent" />
        <span className="text-[12px] font-medium text-text-strong">Sources</span>
        <span className="text-[11px] text-text-faint">{papers.length} papers</span>
      </div>
      <div className="divide-y divide-border-base/60">
        {papers.map((p, i) => (
          <div key={i} className="group px-3.5 py-2.5 hover:bg-bg-layer2 transition-colors">
            <div className="flex items-start gap-2">
              <span className="text-[11px] font-mono text-text-faint mt-[3px] flex-shrink-0">[{i + 1}]</span>
              <div className="flex-1 min-w-0">
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] font-medium text-text-strong hover:text-accent transition-colors inline-flex items-start gap-1"
                  >
                    <span>{p.title || 'Untitled'}</span>
                    <ExternalLink size={11} className="mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ) : (
                  <span className="text-[13px] font-medium text-text-strong">{p.title || 'Untitled'}</span>
                )}
                {(p.authors || p.year) && (
                  <div className="text-[11.5px] text-text-muted mt-0.5 truncate">
                    {p.authors}
                    {p.authors && p.year ? ' · ' : ''}
                    {p.year}
                  </div>
                )}
                {p.summary && (
                  <div className="text-[12px] text-text-base mt-1 line-clamp-2 leading-relaxed">{p.summary}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
