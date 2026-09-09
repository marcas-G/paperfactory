/**
 * ArtifactPanel —— 右栏：证据 | 报告 | 阶段进度 三标签页。
 *
 * 数据来源：projectStore.currentProjectId（useEventStream 已在 AppShell
 * 全局订阅并回填 researchStore.phases / reports）；证据 tab 自行懒加载。
 * 窄屏由 uiStore.artifactPanelOpen 控制显隐（ChatView 顶部按钮 toggle）。
 */
import { useTranslation } from 'react-i18next';
import { Link2, FileText, GitBranch } from 'lucide-react';
import { useUIStore, type ArtifactTab } from '@/stores/uiStore';
import { useResearchStore } from '@/stores/researchStore';
import { useProjectStore } from '@/stores/projectStore';
import EvidenceTab from '@/features/evidence/EvidenceTab';
import ReportsTab from '@/features/reports/ReportsTab';
import { ActivityRow } from '@/features/chat/components/ActivityTimeline';
import type { PhaseRun } from '@/api/types';

const PHASE_ORDER = [
  'literature_search', 'gap_analysis', 'hypothesis',
  'experiment_design', 'experiment_execution',
  'evidence_evaluation', 'conclusion', 'report',
];

const phaseUiStatus = (
  name: string,
  phases: PhaseRun[]
): { status: 'pending' | 'running' | 'done' | 'error'; latest?: PhaseRun } => {
  const runs = phases.filter((r) => r.phaseName === name);
  if (runs.length === 0) return { status: 'pending' };
  const latest = runs.sort((a, b) => b.phaseVersion - a.phaseVersion)[0];
  if (latest.status === 'COMPLETED') return { status: 'done', latest };
  if (latest.status === 'RUNNING' || latest.status === 'WAITING_APPROVAL') return { status: 'running', latest };
  if (latest.status === 'ERROR') return { status: 'error', latest };
  return { status: 'pending', latest };
};

/** 阶段进度 tab：竖向阶段列表，点击打开阶段详情抽屉 */
function PhasesTab() {
  const { t } = useTranslation();
  const phases = useResearchStore((s) => s.phases);
  const openPhaseDetail = useUIStore((s) => s.openPhaseDetail);

  if (phases.length === 0) {
    return <div className="px-4 py-8 text-center text-[12px] text-text-faint">{t('phases.empty')}</div>;
  }

  return (
    <div className="px-3 py-2">
      {PHASE_ORDER.map((name) => {
        const { status, latest } = phaseUiStatus(name, phases);
        if (!latest) return null;
        return (
          <div key={name} onClick={() => latest && openPhaseDetail(latest)} className="cursor-pointer">
            <ActivityRow
              activity={{
                kind: 'phase',
                label: t(`phases.${name}`) as string,
                status:
                  status === 'running' ? 'active'
                  : status === 'done' ? 'done'
                  : status === 'error' ? 'error'
                  : 'done',
                resultSummary:
                  status === 'error' ? 'failed'
                  : status === 'running' ? t('common.running')
                  : undefined,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

const TABS: Array<{ key: ArtifactTab; icon: typeof Link2; labelKey: string }> = [
  { key: 'evidence', icon: Link2, labelKey: 'artifact.evidence' },
  { key: 'reports', icon: FileText, labelKey: 'artifact.reports' },
  { key: 'phases', icon: GitBranch, labelKey: 'artifact.phases' },
];

export default function ArtifactPanel() {
  const { t } = useTranslation();
  const tab = useUIStore((s) => s.artifactTab);
  const setTab = useUIStore((s) => s.setArtifactTab);
  const open = useUIStore((s) => s.artifactPanelOpen);
  const projectId = useProjectStore((s) => s.currentProjectId);

  if (!open) return null;

  return (
    <aside className="w-[320px] min-w-[320px] flex flex-col bg-bg-layer1 border-l border-border-base/50 overflow-hidden">
      {/* 标签头 */}
      <div className="flex items-center border-b border-border-base/50">
        {TABS.map(({ key, icon: Icon, labelKey }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[12px] font-medium transition-colors border-b-2 cursor-pointer ${
              tab === key
                ? 'text-text-strong border-accent'
                : 'text-text-muted border-transparent hover:text-text-base'
            }`}
          >
            <Icon size={13} />
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </div>

      {/* 标签内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === 'evidence' && <EvidenceTab projectId={projectId} />}
        {tab === 'reports' && <ReportsTab projectId={projectId} />}
        {tab === 'phases' && <PhasesTab />}
      </div>
    </aside>
  );
}
