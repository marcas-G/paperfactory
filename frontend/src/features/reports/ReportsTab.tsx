/**
 * ReportsTab —— 右栏报告列表：点击展开 Markdown，带证据链下钻入口。
 * 列表数据来自 researchStore.reports（useEventStream 挂载/完成时回填），
 * 为空时兜底自查一次（直接进右栏、未经历事件的场景）。
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { pf } from '@/api/pfClient';
import { useResearchStore } from '@/stores/researchStore';
import { useUIStore } from '@/stores/uiStore';
import { parseReports } from '@/hooks/useEventStream';

interface Props {
  projectId: string | null;
}

export default function ReportsTab({ projectId }: Props) {
  const { t } = useTranslation();
  const reports = useResearchStore((s) => s.reports);
  const setReports = useResearchStore((s) => s.setReports);
  const openChain = useUIStore((s) => s.openChain);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    pf.getProjectReports(projectId)
      .then((res) => {
        const raw = ((res as { data?: unknown[] }).data ?? (res as unknown[])) as unknown[];
        setReports(parseReports(Array.isArray(raw) ? raw : []));
      })
      .catch(() => setReports([]));
  }, [projectId, setReports]);

  if (!projectId) {
    return <div className="px-4 py-8 text-center text-[12px] text-text-faint">{t('reports.noProject')}</div>;
  }
  if (reports.length === 0) {
    return <div className="px-4 py-8 text-center text-[12px] text-text-faint">{t('reports.empty')}</div>;
  }

  return (
    <div className="divide-y divide-border-base/40">
      {reports.map((r, i) => {
        const key = r.reportId ?? String(i);
        const expanded = expandedId === key;
        return (
          <div key={key} className="px-3 py-2">
            <button
              onClick={() => setExpandedId(expanded ? null : key)}
              className="w-full flex items-center gap-2 text-left group cursor-pointer"
            >
              {expanded ? (
                <ChevronDown size={12} className="text-text-muted flex-shrink-0" />
              ) : (
                <ChevronRight size={12} className="text-text-muted flex-shrink-0" />
              )}
              <FileText size={12} className="text-accent flex-shrink-0" />
              <span className="flex-1 min-w-0 text-[12.5px] text-text-strong truncate group-hover:text-accent transition-colors">
                {r.title}
              </span>
              {r.createdAt && (
                <span className="text-[10px] text-text-faint flex-shrink-0">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              )}
            </button>

            {expanded && (
              <div className="mt-2">
                <div className="px-3 py-2.5 rounded-lg bg-bg-base border border-border-base/50 max-h-[420px] overflow-y-auto scrollbar-thin text-[12px] leading-relaxed text-text-base [&_h1]:text-[15px] [&_h1]:font-semibold [&_h2]:text-[13.5px] [&_h2]:font-semibold [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_a]:text-accent [&_a]:underline [&_code]:bg-bg-layer2 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-bg-layer2 [&_pre]:p-2.5 [&_pre]:rounded [&_table]:w-full [&_th]:border [&_th]:border-border-base [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border-base [&_td]:px-1.5 [&_td]:py-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.content}</ReactMarkdown>
              </div>
                {r.reportId && (
                  <button
                    onClick={() => openChain({ objectType: 'Report', objectId: r.reportId! })}
                    className="mt-1.5 flex items-center gap-1 text-[11px] text-text-muted hover:text-accent transition-colors cursor-pointer"
                  >
                    <Link2 size={11} />
                    <span>{t('evidenceChain.chain')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
