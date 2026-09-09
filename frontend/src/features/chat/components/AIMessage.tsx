/**
 * AIMessage —— 纯组装层（重构后）。
 * 各形态渲染已拆分至：ActivityTimeline / PapersCard / HypothesisCard /
 * ReportDocument / ApprovalCard，本文件只做分发组装。
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '@/features/chat/types';
import ActivityTimeline from './ActivityTimeline';
import PapersCard from './PapersCard';
import HypothesisCard from './HypothesisCard';
import ReportDocument from './ReportDocument';
import ApprovalCard from './ApprovalCard';

interface AIMessageProps {
  msg: ChatMessage;
  onApprove?: (runId: string) => void;
  onModify?: (runId: string, feedback: string) => void;
  onReject?: (runId: string, reason: string) => void;
  /** 证据链下钻入口（REQ-G3） */
  onOpenHypothesisChain?: (statement: string, hypothesisId?: string) => void;
  onOpenReportChain?: (reportId: string) => void;
}

export default function AIMessage({
  msg,
  onApprove,
  onModify,
  onReject,
  onOpenHypothesisChain,
  onOpenReportChain,
}: AIMessageProps) {
  const hasBody =
    Boolean(msg.content) || Boolean(msg.papers?.length) ||
    Boolean(msg.hypothesis) || Boolean(msg.activities?.length);

  if (!hasBody && !msg.isReport) return null;

  // ── 报告文档容器模式 ─────────────────────────────
  if (msg.isReport) {
    return (
      <ReportDocument
        title={msg.reportTitle}
        content={msg.content}
        reportId={msg.reportId}
        onOpenChain={onOpenReportChain}
      />
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
          <ActivityTimeline activities={msg.activities} />
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
          <HypothesisCard
            hypothesis={msg.hypothesis}
            hypothesisId={msg.hypothesisId}
            onOpenChain={onOpenHypothesisChain}
          />
        )}

        {/* 审批卡片 */}
        {msg.needsApproval && (
          <ApprovalCard
            summary={msg.approvalSummary ?? ''}
            runId={msg.approvalRunId}
            onApprove={onApprove}
            onModify={onModify}
            onReject={onReject}
          />
        )}
      </div>
    </div>
  );
}
