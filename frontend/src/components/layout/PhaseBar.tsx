import { useTranslation } from 'react-i18next';
import { PhaseRun } from '@/api/types';

const PHASE_ORDER = [
  'literature_search', 'gap_analysis', 'hypothesis',
  'experiment_design', 'experiment_execution',
  'evidence_evaluation', 'conclusion', 'report',
];

interface PhaseBarProps {
  phases: PhaseRun[];
  onSelectPhase?: (phase: PhaseRun) => void;
}

export default function PhaseBar({ phases, onSelectPhase }: PhaseBarProps) {
  const { t } = useTranslation();

  const getPhaseStatus = (name: string): 'pending' | 'running' | 'done' | 'error' => {
    const runs = phases.filter((r) => r.phaseName === name);
    if (runs.length === 0) return 'pending';
    const latest = runs.sort((a, b) => b.phaseVersion - a.phaseVersion)[0];
    if (latest.status === 'COMPLETED') return 'done';
    if (latest.status === 'RUNNING' || latest.status === 'WAITING_APPROVAL') return 'running';
    if (latest.status === 'ERROR') return 'error';
    return 'pending';
  };

  const getLatestRun = (name: string): PhaseRun | undefined => {
    const runs = phases.filter((r) => r.phaseName === name);
    return runs.sort((a, b) => b.phaseVersion - a.phaseVersion)[0];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="w-[10px] h-[10px] border-2 border-white border-t-transparent rounded-full animate-spin" />;
      case 'done':
        return <span className="text-success text-xs font-bold">✓</span>;
      case 'error':
        return <span className="text-danger text-xs font-bold">!</span>;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-accent';
      case 'done': return 'bg-success';
      case 'error': return 'bg-danger';
      default: return 'bg-bg-layer2 text-text-muted';
    }
  };

  return (
    <div className="flex items-center px-4 py-2 border-b border-border-base/50 bg-bg-layer1 overflow-x-auto gap-0 min-h-[44px]">
      {PHASE_ORDER.map((name, i) => {
        const status = getPhaseStatus(name);
        const latest = getLatestRun(name);
        return (
          <button
            key={name}
            onClick={() => latest && onSelectPhase?.(latest)}
            className="flex items-center gap-2 px-3 py-1 relative group transition-colors hover:bg-bg-layer2 flex-shrink-0 cursor-pointer"
          >
            <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 ${getStatusColor(status)}`}>
              {getStatusIcon(status) || <span className="text-[10px] font-semibold">{i + 1}</span>}
            </span>
            <span className="text-[12px] text-text-muted group-hover:text-text-strong truncate max-w-[80px]">
              {t(`phases.${name}`) as string}
            </span>
            {i < PHASE_ORDER.length - 1 && (
              <span className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-5 bg-border-base/50" />
            )}
          </button>
        );
      })}
    </div>
  );
}
