/**
 * ApprovalCard —— 人工审批卡片（从 AIMessage 拆出）。
 */
interface Props {
  summary: string;
  runId?: string;
  onApprove?: (runId: string) => void;
  onModify?: (runId: string, feedback: string) => void;
  onReject?: (runId: string, reason: string) => void;
}

export default function ApprovalCard({ summary, runId, onApprove, onModify, onReject }: Props) {
  return (
    <div className="mt-2 rounded-xl border border-warning/30 bg-warning/5 p-3.5">
      <div className="text-[12.5px] text-text-strong leading-relaxed mb-3">{summary}</div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => runId && onApprove?.(runId)}
          className="px-3.5 py-1.5 rounded-lg bg-success/15 text-success text-[12px] font-medium hover:bg-success/25 transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => runId && onModify?.(runId, '')}
          className="px-3.5 py-1.5 rounded-lg bg-bg-layer2 text-text-base text-[12px] hover:bg-bg-layer3 transition-colors"
        >
          Modify
        </button>
        <button
          onClick={() => runId && onReject?.(runId, '')}
          className="px-3.5 py-1.5 rounded-lg bg-danger/10 text-danger text-[12px] hover:bg-danger/20 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
