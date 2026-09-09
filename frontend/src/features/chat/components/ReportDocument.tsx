/**
 * ReportDocument —— 报告文档容器（从 AIMessage 拆出）。
 * 带标题栏 + Evidence Chain 入口的 Markdown 文档卡片。
 */
import { FileText, Sparkles, Link2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  title?: string;
  content?: string;
  reportId?: string;
  onOpenChain?: (reportId: string) => void;
}

export default function ReportDocument({ title, content, reportId, onOpenChain }: Props) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accentHover flex items-center justify-center text-white flex-shrink-0 mt-0.5">
        <Sparkles size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-xl border border-border-strong bg-bg-layer1 overflow-hidden shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-base bg-bg-layer2">
            <FileText size={13} className="text-accent" />
            <span className="text-[12.5px] font-medium text-text-strong truncate flex-1">
              {title || 'Research Report'}
            </span>
            {reportId && onOpenChain && (
              <button
                onClick={() => onOpenChain(reportId)}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-bg-layer3 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer flex-shrink-0"
              >
                <Link2 size={11} />
                <span>Evidence Chain</span>
              </button>
            )}
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success uppercase tracking-wide">Final</span>
          </div>
          <div className="px-5 py-4 max-h-[640px] overflow-y-auto [&_h1]:text-[19px] [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_a]:text-accent [&_a]:underline [&_code]:text-[12.5px] [&_code]:bg-bg-layer2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-bg-layer2 [&_pre]:p-3.5 [&_pre]:rounded-lg [&_pre]:my-2.5 [&_pre]:overflow-x-auto [&_table]:my-3 [&_table]:w-full [&_th]:border [&_th]:border-border-base [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:border-border-base [&_td]:px-2.5 [&_td]:py-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-accent/50 [&_blockquote]:pl-3 [&_blockquote]:text-text-muted [&_hr]:border-border-base [&_hr]:my-4 text-[13.5px] leading-relaxed text-text-strong">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
