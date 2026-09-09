/**
 * HypothesisCard —— 假设卡片（从 AIMessage 拆出），带证据链下钻入口。
 */
import { Lightbulb, Link2 } from 'lucide-react';

interface Props {
  hypothesis: string;
  hypothesisId?: string;
  onOpenChain?: (statement: string, hypothesisId?: string) => void;
}

export default function HypothesisCard({ hypothesis, hypothesisId, onOpenChain }: Props) {
  return (
    <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-info/25 bg-info/5 px-3.5 py-3">
      <Lightbulb size={14} className="text-info flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-info">Hypothesis</div>
          {onOpenChain && (
            <button
              onClick={() => onOpenChain(hypothesis, hypothesisId)}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-bg-layer3 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
            >
              <Link2 size={11} />
              <span>Evidence Chain</span>
            </button>
          )}
        </div>
        <div className="text-[13px] text-text-strong leading-relaxed">{hypothesis}</div>
      </div>
    </div>
  );
}
