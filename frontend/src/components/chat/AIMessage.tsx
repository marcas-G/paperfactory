import { useState } from 'react';
import {
  ChevronDown, ChevronRight, FileText, Lightbulb, ExternalLink,
  Loader2, CheckCircle2, XCircle, Brain, Wrench, CheckCheck, Sparkles, Link2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, ActivityItem } from '@/components/chat/types';

interface AIMessageProps {
  msg: ChatMessage;
  onApprove?: (runId: string) => void;
  onModify?: (runId: string, feedback: string) => void;
  onReject?: (runId: string, reason: string) => void;
  /** 证据链下钻入口（REQ-G3） */
  onOpenHypothesisChain?: (statement: string, hypothesisId?: string) => void;
  onOpenReportChain?: (reportId: string) => void;
}

const activityIcon = (a: ActivityItem) => {
  if (a.kind === 'phase') return <TargetIcon />;
  if (a.kind === 'thinking') return <Brain size={13} />;
  if (a.kind === 'tool') return <Wrench size={13} />;
  return <CheckCheck size={13} />;
};

function TargetIcon() {
  return (
    <span className="flex items-center justify-center w-[13px] h-[13px]">
      <span className="block w-[7px] h-[7px] rounded-full border-[1.5px] border-current" />
    </span>
  );
}

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(activity.detail);
  const isPhase = activity.kind === 'phase';

  return (
    <div className={`group relative flex flex-col ${isPhase ? 'mt-1' : ''}`}>
      <div
        className={`flex items-center gap-2.5 py-[5px] rounded-lg transition-colors ${
          expandable ? 'cursor-pointer hover:bg-bg-layer1' : ''
        } ${isPhase ? 'px-2 -mx-2' : ''}`}
        onClick={() => expandable && setOpen(!open)}
      >
        {/* 图标 + 状态 */}
        <span
          className={`flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 ${
            isPhase ? 'bg-accent/15 text-accent' : activity.status === 'error' ? 'text-danger' : 'text-text-muted'
          }`}
        >
          {activity.status === 'active' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : activity.status === 'error' ? (
            <XCircle size={13} />
          ) : activity.kind === 'phase' ? (
            <CheckCircle2 size={13} />
          ) : (
            activityIcon(activity)
          )}
        </span>

        {/* 主文案 */}
        <span className={`text-[13px] truncate ${isPhase ? 'font-medium text-text-strong' : 'text-text-base'}`}>
          {activity.label}
        </span>

        {/* 工具名徽章 */}
        {activity.toolName && (
          <span className="flex-shrink-0 text-[11px] font-mono px-1.5 py-0.5 rounded bg-bg-layer2 text-text-muted">
            {activity.toolName}
          </span>
        )}

        {/* 结果摘要徽章 */}
        {activity.resultSummary && (
          <span
            className={`flex-shrink-0 text-[11px] px-1.5 py-0.5 rounded ${
              activity.status === 'error' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
            }`}
          >
            {activity.resultSummary}
          </span>
        )}

        {/* 展开指示 */}
        {expandable && (
          <span className="ml-auto flex-shrink-0 text-text-faint group-hover:text-text-muted transition-colors">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </div>

      {/* 可展开详情 */}
      {open && activity.detail && (
        <pre className="mx-7 mb-1.5 p-3 rounded-lg bg-bg-layer2 border border-border-base text-[11.5px] leading-relaxed text-text-base whitespace-pre-wrap break-words max-h-[280px] overflow-y-auto">
          {activity.detail}
        </pre>
      )}
    </div>
  );
}

function PapersCard({ papers }: { papers: NonNullable<ChatMessage['papers']> }) {
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

export default function AIMessage({ msg, onApprove, onModify, onReject, onOpenHypothesisChain, onOpenReportChain }: AIMessageProps) {
  const hasBody = Boolean(msg.content) || Boolean(msg.papers?.length) || Boolean(msg.hypothesis) || Boolean(msg.activities?.length);

  if (!hasBody) return null;

  // ── 报告文档容器模式 ─────────────────────────────
  if (msg.isReport) {
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
                {msg.reportTitle || 'Research Report'}
              </span>
              {msg.reportId && onOpenReportChain && (
                <button
                  onClick={() => msg.reportId && onOpenReportChain(msg.reportId)}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-bg-layer3 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer flex-shrink-0"
                >
                  <Link2 size={11} />
                  <span>Evidence Chain</span>
                </button>
              )}
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success uppercase tracking-wide">Final</span>
            </div>
            <div className="px-5 py-4 max-h-[640px] overflow-y-auto [&_h1]:text-[19px] [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_a]:text-accent [&_a]:underline [&_code]:text-[12.5px] [&_code]:bg-bg-layer2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-bg-layer2 [&_pre]:p-3.5 [&_pre]:rounded-lg [&_pre]:my-2.5 [&_pre]:overflow-x-auto [&_table]:my-3 [&_table]:w-full [&_th]:border [&_th]:border-border-base [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:border-border-base [&_td]:px-2.5 [&_td]:py-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-accent/50 [&_blockquote]:pl-3 [&_blockquote]:text-text-muted [&_hr]:border-border-base [&_hr]:my-4 text-[13.5px] leading-relaxed text-text-strong">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || ''}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 普通消息 / 活动时间线模式 ─────────────────────
  return (
    <div className="flex gap-3 px-4 py-2">
      <div className="w-7 h-7 rounded-lg bg-bg-layer3 flex items-center justify-center text-[10px] font-semibold text-text-muted flex-shrink-0 mt-0.5">
        AI
      </div>
      <div className="flex-1 min-w-0">
        {/* 活动时间线 */}
        {msg.activities && msg.activities.length > 0 && (
          <div className="relative pl-1 my-0.5 border-l border-border-base/70 ml-1 space-y-[1px]">
            {msg.activities.map((a, i) => (
              <ActivityRow key={i} activity={a} />
            ))}
          </div>
        )}

        {/* 正文（Markdown） */}
        {msg.content && (
          <div className="text-[13.5px] leading-relaxed text-text-strong mt-1.5 [&_h1]:text-[17px] [&_h1]:font-semibold [&_h2]:text-[15px] [&_h2]:font-semibold [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:text-[12.5px] [&_code]:bg-bg-layer2 [&_code]:px-1 [&_code]:rounded [&_a]:text-accent [&_a]:underline">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}

        {/* 文献卡片 */}
        {msg.papers && msg.papers.length > 0 && <PapersCard papers={msg.papers} />}

        {/* 假设卡片 */}
        {msg.hypothesis && (
          <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-info/25 bg-info/5 px-3.5 py-3">
            <Lightbulb size={14} className="text-info flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-info">Hypothesis</div>
                {onOpenHypothesisChain && (
                  <button
                    onClick={() => onOpenHypothesisChain(msg.hypothesis!, msg.hypothesisId)}
                    className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-bg-layer3 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                  >
                    <Link2 size={11} />
                    <span>Evidence Chain</span>
                  </button>
                )}
              </div>
              <div className="text-[13px] text-text-strong leading-relaxed">{msg.hypothesis}</div>
            </div>
          </div>
        )}

        {/* 审批 */}
        {msg.needsApproval && (
          <div className="mt-2 rounded-xl border border-warning/30 bg-warning/5 p-3.5">
            <div className="text-[12.5px] text-text-strong leading-relaxed mb-3">{msg.approvalSummary}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => msg.approvalRunId && onApprove?.(msg.approvalRunId)}
                className="px-3.5 py-1.5 rounded-lg bg-success/15 text-success text-[12px] font-medium hover:bg-success/25 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => msg.approvalRunId && onModify?.(msg.approvalRunId, '')}
                className="px-3.5 py-1.5 rounded-lg bg-bg-layer2 text-text-base text-[12px] hover:bg-bg-layer3 transition-colors"
              >
                Modify
              </button>
              <button
                onClick={() => msg.approvalRunId && onReject?.(msg.approvalRunId, '')}
                className="px-3.5 py-1.5 rounded-lg bg-danger/10 text-danger text-[12px] hover:bg-danger/20 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
