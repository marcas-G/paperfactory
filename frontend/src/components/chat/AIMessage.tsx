import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, FileText, Lightbulb, Zap } from 'lucide-react';
import type { ChatMessage } from '@/components/chat/types';

interface AIMessageProps {
  msg: ChatMessage;
  onApprove?: (runId: string) => void;
  onModify?: (runId: string, feedback: string) => void;
  onReject?: (runId: string, reason: string) => void;
}

export default function AIMessage({ msg, onApprove, onModify, onReject }: AIMessageProps) {
  return (
    <div className="flex gap-3 px-6 py-3">
      <div className="w-7 h-7 rounded-md bg-bg-layer3 flex items-center justify-center text-[10px] font-semibold text-text-muted flex-shrink-0 mt-0.5">
        AI
      </div>
      <div className="flex-1 min-w-0">
        {/* Text content */}
        {msg.content && !msg.isThinking && (
          <div className="text-[14px] leading-relaxed text-text-strong mt-1">{msg.content}</div>
        )}

        {/* Thinking indicator */}
        {msg.isThinking && (
          <div className="flex items-center gap-2 py-1.5 text-[13px] text-text-muted">
            <span className="flex gap-1">
              <span className="w-[4px] h-[4px] rounded-full bg-text-muted animate-pulse" style={{ animationDelay: '0s' }} />
              <span className="w-[4px] h-[4px] rounded-full bg-text-muted animate-pulse" style={{ animationDelay: '0.2s' }} />
              <span className="w-[4px] h-[4px] rounded-full bg-text-muted animate-pulse" style={{ animationDelay: '0.4s' }} />
            </span>
            <span className="italic">{msg.thinkingText}</span>
          </div>
        )}

        {/* Papers card */}
        {msg.papers && msg.papers.length > 0 && <ToolCard icon={<FileText size={14} />} title={`Papers (${msg.papers.length})`}>
          {msg.papers.slice(0, 5).map((p, i) => (
            <div key={i} className="py-1 border-b border-border-base/50 last:border-0">
              <div className="text-[13px] text-text-strong">{p.title}</div>
              {p.authors && <div className="text-[11px] text-text-muted">{p.authors} · {p.year}</div>}
            </div>
          ))}
          {msg.papers.length > 5 && <div className="text-[12px] text-accent py-1">+{msg.papers.length - 5} more</div>}
        </ToolCard>}

        {/* Hypothesis card */}
        {msg.hypothesis && (
          <ToolCard icon={<Lightbulb size={14} />} title="Hypothesis">
            <div className="text-[13px] text-text-strong leading-relaxed">{msg.hypothesis}</div>
          </ToolCard>
        )}

        {/* Approval card */}
        {msg.needsApproval && <ApprovalCard msg={msg} onApprove={onApprove} onModify={onModify} onReject={onReject} />}
      </div>
    </div>
  );
}

// Collapsible tool card
function ToolCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-2 border border-border-base/50 rounded-md overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 bg-bg-layer1 border-b border-border-base/50 text-[13px] font-medium text-text-base">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {icon}
        <span>{title}</span>
      </button>
      {open && <div className="px-3 py-2 text-[13px]">{children}</div>}
    </div>
  );
}

// Inline approval card
function ApprovalCard({ msg, onApprove, onModify, onReject }: { msg: ChatMessage; onApprove?: (runId: string) => void; onModify?: (runId: string, fb: string) => void; onReject?: (runId: string, reason: string) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'idle' | 'modify' | 'reject'>('idle');
  const [text, setText] = useState('');

  return (
    <div className="mt-2 border border-border-base/50 rounded-md overflow-hidden bg-bg-layer1">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-base/50 text-[13px] font-medium text-text-base">
        <Zap size={14} className="text-warning" />
        <span>{t('common.approvalNeeded')}</span>
      </div>
      <div className="px-3 py-2 text-[13px] text-text-strong leading-relaxed">{msg.approvalSummary}</div>
      <div className="flex gap-2 px-3 py-2 border-t border-border-base/50">
        <button onClick={() => msg.approvalRunId && onApprove?.(msg.approvalRunId)} className="px-3 py-1.5 rounded text-[12px] font-medium bg-accent text-white cursor-pointer">
          {t('btn.approve')}
        </button>
        <button onClick={() => setMode('modify')} className="px-3 py-1.5 rounded text-[12px] font-medium bg-bg-layer3 text-text-base cursor-pointer">
          {t('btn.modify')}
        </button>
        <button onClick={() => setMode('reject')} className="px-3 py-1.5 rounded text-[12px] font-medium bg-bg-layer3 text-text-base cursor-pointer">
          {t('btn.reject')}
        </button>
      </div>
      {mode === 'modify' && (
        <div className="flex gap-2 px-3 pb-2 border-t border-border-base/50 pt-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('common.modifyFeedback')} className="flex-1 px-2 py-1 bg-bg-base border border-border-base/50 rounded text-[12px] text-text-strong resize-none min-h-[40px] outline-none font-sans" />
          <button onClick={() => { msg.approvalRunId && onModify?.(msg.approvalRunId, text); setMode('idle'); }} className="px-3 py-1.5 rounded text-[12px] bg-accent text-white cursor-pointer">Submit</button>
        </div>
      )}
      {mode === 'reject' && (
        <div className="flex gap-2 px-3 pb-2 border-t border-border-base/50 pt-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('common.rejectReason')} className="flex-1 px-2 py-1 bg-bg-base border border-border-base/50 rounded text-[12px] text-text-strong resize-none min-h-[40px] outline-none font-sans" />
          <button onClick={() => { msg.approvalRunId && onReject?.(msg.approvalRunId, text); setMode('idle'); }} className="px-3 py-1.5 rounded text-[12px] bg-accent text-white cursor-pointer">Submit</button>
        </div>
      )}
    </div>
  );
}
