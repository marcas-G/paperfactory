/**
 * MessageList —— 消息列表（原 ChatArea 演化）。
 * 数据从 researchStore 读，回调由 ChatView 注入；空态保留示例问题。
 */
import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useResearchStore } from '@/stores/researchStore';
import UserMessage from './components/UserMessage';
import AIMessage from './components/AIMessage';

interface MessageListProps {
  onApprove?: (runId: string) => void;
  onModify?: (runId: string, feedback: string) => void;
  onReject?: (runId: string, reason: string) => void;
  onOpenHypothesisChain?: (statement: string, hypothesisId?: string) => void;
  onOpenReportChain?: (reportId: string) => void;
  onPickExample?: (question: string) => void;
}

const EXAMPLES = [
  'Does retrieval augmented generation reduce hallucination in LLMs?',
  'What are the scaling laws for mixture-of-experts models?',
  'How effective is chain-of-thought prompting on small models?',
];

export default function MessageList({
  onApprove,
  onModify,
  onReject,
  onOpenHypothesisChain,
  onOpenReportChain,
  onPickExample,
}: MessageListProps) {
  const messages = useResearchStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息/活动更新时自动滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accentHover flex items-center justify-center mb-5 shadow-lg shadow-accent/20">
          <Sparkles size={24} className="text-white" />
        </div>
        <div className="text-[22px] font-semibold text-text-strong mb-2">What should we research?</div>
        <div className="text-[13.5px] text-text-muted mb-8 text-center max-w-md leading-relaxed">
          PaperFactory will search real literature, design experiments, run them,
          and produce an evidence-based report.
        </div>
        <div className="flex flex-col gap-2 w-full max-w-lg">
          {EXAMPLES.map((q) => (
            <button
              key={q}
              onClick={() => onPickExample?.(q)}
              className="px-4 py-2.5 rounded-xl border border-border-base bg-bg-layer1 text-[13px] text-text-base hover:border-border-strong hover:text-text-strong transition-colors text-left truncate cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin py-4" data-chat-scroll>
      <div className="max-w-3xl mx-auto pb-2">
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <UserMessage key={msg.id} content={msg.content} />
          ) : (
            <AIMessage
              key={msg.id}
              msg={msg}
              onApprove={onApprove}
              onModify={onModify}
              onReject={onReject}
              onOpenHypothesisChain={onOpenHypothesisChain}
              onOpenReportChain={onOpenReportChain}
            />
          )
        )}
      </div>
    </div>
  );
}
