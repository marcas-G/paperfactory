/**
 * ActivityTimeline —— 活动时间线（阶段 + 思考 + 工具行）。
 * 从 AIMessage 拆出：一条 assistant 消息内的结构化过程流。
 */
import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle,
  Brain, Wrench, CheckCheck,
} from 'lucide-react';
import type { ActivityItem } from '@/features/chat/types';

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

export function ActivityRow({ activity }: { activity: ActivityItem }) {
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

export default function ActivityTimeline({ activities }: { activities: ActivityItem[] }) {
  if (!activities.length) return null;
  return (
    <div className="relative pl-1 my-0.5 border-l border-border-base/70 ml-1 space-y-[1px]">
      {activities.map((a, i) => (
        <ActivityRow key={i} activity={a} />
      ))}
    </div>
  );
}
