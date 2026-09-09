/**
 * EvidenceTab —— 右栏证据列表：知识条目 + 来源链接，点击下钻证据链。
 * /evidence 返回 Record<string,unknown>[]，按候选字段兜底解析。
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Link2 } from 'lucide-react';
import { pf } from '@/api/pfClient';
import { useUIStore } from '@/stores/uiStore';

interface Props {
  projectId: string | null;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v ? v : undefined;

export default function EvidenceTab({ projectId }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Array<Record<string, unknown>>>();
  const [loading, setLoading] = useState(false);
  const openChain = useUIStore((s) => s.openChain);

  useEffect(() => {
    if (!projectId) {
      setItems(undefined);
      return;
    }
    setLoading(true);
    pf.getProjectEvidence(projectId)
      .then((data) => setItems(Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (!projectId) {
    return <div className="px-4 py-8 text-center text-[12px] text-text-faint">{t('evidence.noProject')}</div>;
  }
  if (loading) {
    return <div className="px-4 py-8 text-center text-[12px] text-text-faint">{t('common.loading')}</div>;
  }
  if (!items || items.length === 0) {
    return <div className="px-4 py-8 text-center text-[12px] text-text-faint">{t('evidence.empty')}</div>;
  }

  return (
    <div className="divide-y divide-border-base/40">
      {items.map((e, i) => {
        const id = str(e.evidenceId) ?? str(e.id) ?? str(e.evidence_id);
        const kind = str(e.evidenceType) ?? str(e.type) ?? 'Evidence';
        const statement =
          str(e.statement) ?? str(e.content) ?? str(e.description) ?? str(e.summary) ?? '';
        const source = str(e.sourceUrl) ?? str(e.url);
        return (
          <div key={id ?? i} className="group px-4 py-3 hover:bg-bg-layer2/60 transition-colors">
            <div className="flex items-center gap-1.5 mb-1">
              <ShieldCheck size={12} className="text-success flex-shrink-0" />
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-success/15 text-success">
                {kind}
              </span>
            </div>
            <div className="text-[12px] text-text-base leading-relaxed break-words line-clamp-3">
              {statement || (id ? <span className="font-mono text-[11px] text-text-faint">{id.slice(0, 18)}…</span> : '')}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              {id && (
                <button
                  onClick={() => openChain({ objectType: 'Evidence', objectId: id })}
                  className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent transition-colors cursor-pointer"
                >
                  <Link2 size={11} />
                  <span>{t('evidenceChain.chain')}</span>
                </button>
              )}
              {source && (
                <a
                  href={source}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-accent hover:text-accentHover truncate"
                >
                  {t('evidence.source')}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
