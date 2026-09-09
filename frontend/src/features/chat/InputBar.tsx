/**
 * InputBar —— 输入区（发送 / 停止 / 恢复）。
 * 运行中显示进度指示 + Stop；停止后保留恢复入口（查 run 状态续看结果）。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Square, Play } from 'lucide-react';
import { useResearchStore } from '@/stores/researchStore';

interface InputBarProps {
  onSend: (question: string) => void;
  onStop: () => void;
  onResume: () => void;
}

export default function InputBar({ onSend, onStop, onResume }: InputBarProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const isRunning = useResearchStore((s) => s.isRunning);
  const currentRunId = useResearchStore((s) => s.currentRunId);
  const status = useResearchStore((s) => s.status);

  const canResume = !isRunning && Boolean(currentRunId) && status !== 'done';

  const send = () => {
    if (input.trim() && !isRunning) {
      onSend(input);
      setInput('');
    }
  };

  return (
    <div className="px-6 pb-4 pt-2 bg-bg-base">
      <div className="flex items-center justify-between px-1 mb-2 min-h-[18px]">
        {isRunning ? (
          <span className="flex items-center gap-2 text-[12px] text-text-muted">
            <span className="w-[6px] h-[6px] rounded-full bg-warning animate-pulse" />
            {t('common.running')}
          </span>
        ) : canResume ? (
          <button
            onClick={onResume}
            className="flex items-center gap-1 text-[12px] text-accent hover:text-accentHover cursor-pointer transition-colors"
          >
            <Play size={10} />
            <span>{t('common.resume')}</span>
          </button>
        ) : (
          <span />
        )}
        {isRunning && (
          <button
            onClick={onStop}
            className="flex items-center gap-1 text-[12px] text-danger hover:text-text-strong cursor-pointer transition-colors"
          >
            <Square size={10} />
            <span>Stop</span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 bg-bg-layer1 border border-border-base/50 rounded-xl min-h-[48px] transition-colors focus-within:border-border-strong">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            isRunning
              ? (t('common.waiting') as string)
              : (t('common.enterQuestion') as string)
          }
          disabled={isRunning}
          className="flex-1 px-4 py-2.5 bg-transparent text-[13px] text-text-strong outline-none placeholder:text-text-faint resize-none disabled:opacity-50 max-h-[150px] min-h-[36px]"
          rows={1}
        />
        {isRunning ? (
          <button
            onClick={onStop}
            className="w-[30px] h-[30px] rounded-md flex items-center justify-center bg-danger text-white mr-1 mb-1 cursor-pointer flex-shrink-0"
          >
            <Square size={10} />
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!input.trim()}
            className="w-[30px] h-[30px] rounded-md flex items-center justify-center bg-accent text-white disabled:opacity-30 disabled:cursor-not-allowed mr-1 mb-1 cursor-pointer flex-shrink-0"
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
