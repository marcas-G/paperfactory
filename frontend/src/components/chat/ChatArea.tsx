import { useMemo } from 'react';
import UserMessage from '@/components/chat/UserMessage';
import AIMessage from '@/components/chat/AIMessage';
import type { ChatMessage } from '@/components/chat/types';

interface ChatAreaProps {
  messages: ChatMessage[];
  onApprove?: (runId: string) => void;
  onModify?: (runId: string, feedback: string) => void;
  onReject?: (runId: string, reason: string) => void;
}

export default function ChatArea({ messages, onApprove, onModify, onReject }: ChatAreaProps) {
  const containerRef = useMemo(() => {
    const el = document.createElement('div');
    return el;
  }, []);

  // Auto-scroll to bottom on new messages
  useMemo(() => {
    const el = document.querySelector('[data-chat-scroll]');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-faint">
        <div className="text-5xl mb-4">🔬</div>
        <div className="text-xl font-semibold text-text-muted mb-2">Research Assistant</div>
        <div className="text-sm text-text-faint">Enter a research question to begin</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin py-4" data-chat-scroll>
      <div className="max-w-3xl mx-auto">
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
            />
          )
        )}
      </div>
    </div>
  );
}
