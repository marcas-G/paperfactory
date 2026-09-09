/**
 * EvidenceChainDrawer —— REQ-G3 审计追溯下钻（C3：结论→证据→实验→文献）。
 *
 * 数据模型：chain 端点返回一跳 { upstream, downstream }：
 *   upstream  = 该对象为 source 的边（Evidence --derives-from--> Result / KnowledgeItem --cites--> Citation）
 *   downstream = 该对象为 target 的边（Evidence --supports--> Hypothesis）
 * 因此逐层下钻由前端懒加载完成：每个节点首次展开时再调一次 chain 端点，递归渲染。
 * 环路防护：visited 集合传递，已展示节点只渲染徽章、不再展开。
 *
 * 重构：由 components/layout/ 搬入 features/evidence/；改为右侧 fixed overlay。
 */

import { useCallback, useEffect, useState } from 'react';
import { X, Link2, ChevronDown, ChevronRight, Loader2, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { pf } from '@/api/pfClient';

/** 与 SDK EvidenceChainLink 同构（避免组件层深层相对路径 import） */
interface ChainData {
  upstream: Array<{ targetType: string; targetId: string; relation: string }>;
  downstream: Array<{ sourceType: string; sourceId: string; relation: string }>;
}

export interface ChainTarget {
  objectType: string;
  objectId: string;
}

interface Props {
  target: ChainTarget;
  projectId: string;
  onClose: () => void;
}

/** 类型徽章配色（沿用暗色 token 的 *-/15 底 + 亮色字风格） */
const typeBadgeClass = (type: string): string => {
  switch (type) {
    case 'Hypothesis': return 'bg-info/15 text-info';
    case 'Evidence': return 'bg-success/15 text-success';
    case 'Result':
    case 'Experiment': return 'bg-warning/15 text-warning';
    case 'Citation':
    case 'KnowledgeItem': return 'bg-accent/15 text-accent';
    case 'Report': return 'bg-danger/15 text-danger';
    default: return 'bg-bg-layer3 text-text-muted';
  }
};

/** 原始对象摘要：跨类型字段兜底（statement/title/content/...） */
const summarize = (obj: Record<string, unknown> | null): string => {
  if (!obj) return '';
  const s =
    obj.statement ?? obj.title ?? obj.content ?? obj.description ??
    obj.summary ?? obj.name ?? obj.text;
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim().slice(0, 160);
};

const timeOf = (obj: Record<string, unknown> | null): string => {
  const t = obj?.createdAt ?? obj?.created_at;
  if (typeof t !== 'string' || !t) return '';
  const d = new Date(t);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
};

interface NodeProps {
  projectId: string;
  objectType: string;
  objectId: string;
  /** 该节点相对父节点的关系（root 无） */
  relation?: string;
  depth: number;
  visited: Set<string>;
  defaultOpen?: boolean;
  onOpenOrigin?: (objectType: string, objectId: string) => void;
}

function ChainNode({ projectId, objectType, objectId, relation, depth, visited, defaultOpen }: NodeProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [chain, setChain] = useState<ChainData | null>(null);
  const [origin, setOrigin] = useState<Record<string, unknown> | null>(null);
  const [showOrigin, setShowOrigin] = useState(false);

  const key = `${objectType}:${objectId}`;
  const seen = visited.has(key);

  const load = useCallback(async () => {
    if (loading || chain) return;
    setLoading(true);
    setFailed(false);
    try {
      const [chainRes, originRes] = await Promise.all([
        pf.getEvidenceChain(projectId, objectType, objectId).catch(() => null),
        pf.getResearchObject(objectId).catch(() => null),
      ]);
      if (!chainRes) { setFailed(true); return; }
      setChain({
        upstream: (chainRes.upstream ?? []) as ChainData['upstream'],
        downstream: (chainRes.downstream ?? []) as ChainData['downstream'],
      });
      setOrigin(originRes as Record<string, unknown> | null);
    } finally {
      setLoading(false);
    }
  }, [projectId, objectType, objectId, loading, chain]);

  // root（defaultOpen）挂载即拉取
  useEffect(() => {
    if (defaultOpen) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    if (seen) return; // 环路：不再展开
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  const summary = summarize(origin);
  const time = timeOf(origin);
  const hasChildren =
    !!chain && (chain.downstream.length > 0 || chain.upstream.length > 0);

  return (
    <div className="group">
      {/* 节点行：类型徽章 + relation + 摘要 + 时间 */}
      <div
        className={`flex items-start gap-2 py-1.5 rounded-lg transition-colors ${!seen ? 'cursor-pointer hover:bg-bg-layer2' : ''}`}
        onClick={toggle}
      >
        <span className="flex-shrink-0 mt-[2px] text-text-faint group-hover:text-text-muted transition-colors">
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : !seen && (open || !chain) ? (
            open && chain && !hasChildren ? <ChevronRight size={12} className="opacity-40" /> : <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${typeBadgeClass(objectType)}`}>
              {objectType}
            </span>
            {relation && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-bg-layer3 text-text-muted">
                {relation}
              </span>
            )}
            {seen && (
              <span className="text-[10px] text-text-faint">（{t('evidenceChain.visited')}）</span>
            )}
            {time && <span className="ml-auto text-[10px] text-text-faint flex-shrink-0">{time}</span>}
          </div>
          <div className="text-[12px] text-text-base leading-relaxed mt-0.5 break-words">
            {summary || <span className="font-mono text-[11px] text-text-faint">{objectId.slice(0, 18)}…</span>}
          </div>
        </div>
      </div>

      {/* 展开区：链路分组 + 原始对象 */}
      {open && chain && (
        <div className="ml-[11px] pl-3 border-l border-border-base/70">
          {failed && (
            <div className="text-[12px] text-danger py-1">{t('evidenceChain.loadFailed')}</div>
          )}
          {!failed && !hasChildren && (
            <div className="flex items-center gap-2 py-2 text-[12px] text-text-faint">
              <Inbox size={12} />
              <span>{t('evidenceChain.empty')}</span>
            </div>
          )}

          {/* downstream：谁支撑该对象（结论→证据 下钻方向） */}
          {chain.downstream.length > 0 && (
            <div className="py-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">
                {t('evidenceChain.downstream')} ({chain.downstream.length})
              </div>
              {chain.downstream.map((l, i) => (
                <ChainNode
                  key={`${l.sourceType}:${l.sourceId}:${i}`}
                  projectId={projectId}
                  objectType={l.sourceType}
                  objectId={l.sourceId}
                  relation={l.relation}
                  depth={depth + 1}
                  visited={new Set([...visited, key])}
                />
              ))}
            </div>
          )}

          {/* upstream：该对象源自什么（证据→实验→文献 方向） */}
          {chain.upstream.length > 0 && (
            <div className="py-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">
                {t('evidenceChain.upstream')} ({chain.upstream.length})
              </div>
              {chain.upstream.map((l, i) => (
                <ChainNode
                  key={`${l.targetType}:${l.targetId}:${i}`}
                  projectId={projectId}
                  objectType={l.targetType}
                  objectId={l.targetId}
                  relation={l.relation}
                  depth={depth + 1}
                  visited={new Set([...visited, key])}
                />
              ))}
            </div>
          )}

          {/* 原始对象 JSON */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowOrigin(!showOrigin); }}
            className="mt-1 mb-2 px-2 py-1 rounded bg-bg-layer2 text-[11px] text-text-muted hover:text-text-strong transition-colors cursor-pointer"
          >
            {showOrigin ? t('evidenceChain.hideOrigin') : t('evidenceChain.viewOrigin')}
          </button>
          {showOrigin && (
            <pre className="mb-2 p-2 rounded-lg bg-bg-base border border-border-base/50 text-[10.5px] leading-relaxed text-text-base font-mono whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto scrollbar-thin">
              {origin ? JSON.stringify(origin, null, 2) : `{"id": "${objectId}", "type": "${objectType}", "detail": "not found"}`}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function EvidenceChainDrawer({ target, projectId, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[380px] z-40 flex flex-col bg-bg-layer1 border-l border-border-base/50 shadow-2xl shadow-black/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-base/50">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 size={14} className="text-accent flex-shrink-0" />
          <span className="text-[13px] font-semibold text-text-strong">{t('evidenceChain.title')}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${typeBadgeClass(target.objectType)}`}>
            {target.objectType}
          </span>
        </div>
        <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text-strong hover:bg-bg-layer2 transition-colors cursor-pointer">
          <X size={14} />
        </button>
      </div>

      {/* 竖向链 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
        <ChainNode
          projectId={projectId}
          objectType={target.objectType}
          objectId={target.objectId}
          depth={0}
          visited={new Set()}
          defaultOpen
        />
      </div>
    </div>
  );
}
