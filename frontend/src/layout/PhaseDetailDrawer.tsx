/**
 * PhaseDetailDrawer —— 阶段详情抽屉（output / tools / review / artifacts / versions / metadata）。
 * 重构：由占位列改为右侧 fixed overlay，入口在 ArtifactPanel「阶段」tab。
 */
import { useEffect, useState } from 'react';
import { X, Clock, CheckCircle2, AlertCircle, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { pf } from '@/api/pfClient';
import type { PhaseRun } from '@/api/types';

/** getPhaseVersions 返回 PhaseRunDTO 的历史版本子集 */
interface PhaseVersion {
  phaseRunId: string;
  phaseVersion: number;
  status: string;
  active: boolean;
  createdAt: string;
}

interface Props {
  phase: PhaseRun;
  projectId: string;
  onClose: () => void;
}

export default function PhaseDetailDrawer({ phase, projectId, onClose }: Props) {
  const [versions, setVersions] = useState<PhaseVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>('output');

  useEffect(() => {
    setLoading(true);
    pf.getPhaseVersions(projectId, phase.phaseName)
      .then((data) => setVersions(Array.isArray(data) ? (data as PhaseVersion[]) : []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [projectId, phase.phaseName]);

  const statusIcon = () => {
    switch (phase.status) {
      case 'RUNNING': return <Play size={14} className="text-accent" />;
      case 'COMPLETED': return <CheckCircle2 size={14} className="text-success" />;
      case 'ERROR': return <AlertCircle size={14} className="text-danger" />;
      case 'WAITING_APPROVAL': return <Clock size={14} className="text-warning" />;
      default: return <Clock size={14} className="text-text-muted" />;
    }
  };

  const toggleSection = (name: string) => {
    setExpandedSection(expandedSection === name ? null : name);
  };

  const Section = ({ name, title, children, empty }: { name: string; title: string; children: React.ReactNode; empty?: string }) => {
    const open = expandedSection === name;
    if (empty && (!children || String(children).length < 2)) return null;
    return (
      <div className="border-t border-border-base/50">
        <button onClick={() => toggleSection(name)} className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider hover:bg-bg-layer2 transition-colors cursor-pointer">
          <span className="flex items-center gap-2">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {title}
          </span>
        </button>
        {open && <div className="px-4 pb-3">{children}</div>}
      </div>
    );
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[380px] z-40 flex flex-col bg-bg-layer1 border-l border-border-base/50 shadow-2xl shadow-black/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-base/50">
        <div className="flex items-center gap-2">
          {statusIcon()}
          <span className="text-[13px] font-semibold text-text-strong">{phase.phaseName}</span>
          <span className="text-[11px] text-text-muted">v{phase.phaseVersion}</span>
        </div>
        <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text-strong hover:bg-bg-layer2 transition-colors cursor-pointer">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-text-faint text-xs">Loading...</div>
        ) : (
          <>
            {/* Agent Output */}
            <Section name="output" title="Agent Output">
              <pre className="text-[12px] text-text-base leading-relaxed whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto scrollbar-thin bg-bg-base border border-border-base/50 rounded p-2">
                {phase.agentOutput || 'No output'}
              </pre>
            </Section>

            {/* Tool Calls */}
            <Section name="tools" title={`Tool Calls (${phase.toolCalls?.length || 0})`} empty="true">
              <div className="space-y-2">
                {phase.toolCalls?.map((tc, i) => (
                  <div key={i} className="bg-bg-base border border-border-base/50 rounded p-2">
                    <div className="text-[12px] font-medium text-text-strong mb-1">{tc.toolName}</div>
                    {tc.output && (
                      <pre className="text-[11px] text-text-muted font-mono whitespace-pre-wrap max-h-[100px] overflow-y-auto scrollbar-thin">
                        {tc.output.substring(0, 300)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            {/* Self Review */}
            <Section name="review" title="Self Review" empty="true">
              {phase.selfReview ? (
                <div>
                  <div className={`text-[12px] font-semibold px-2 py-1 rounded inline-block mb-2 ${phase.selfReview.passed ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                    {phase.selfReview.passed ? 'PASSED' : 'ISSUES FOUND'} ({phase.selfReview.rounds} rounds)
                  </div>
                  {phase.selfReview.issues?.length > 0 && (
                    <div className="space-y-1">
                      {phase.selfReview.issues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-[12px]">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${issue.severity === 'high' ? 'bg-danger/15 text-danger' : issue.severity === 'medium' ? 'bg-warning/15 text-warning' : 'bg-accent/15 text-accent'}`}>
                            {issue.severity}
                          </span>
                          <span className="text-text-muted">{issue.category}:</span>
                          <span className="text-text-base flex-1">{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[12px] text-text-faint">No review data</div>
              )}
            </Section>

            {/* Artifacts */}
            <Section name="artifacts" title="Artifacts" empty="true">
              <div className="text-[12px] text-text-base">
                {Object.entries(phase.artifacts || {}).map(([key, ids]) => (
                  <div key={key} className="py-1">
                    <span className="text-text-muted">{key}:</span> {Array.isArray(ids) ? ids.length : 0} items
                  </div>
                ))}
              </div>
            </Section>

            {/* Versions */}
            <Section name="versions" title={`Versions (${versions.length})`} empty="true">
              <div className="space-y-2">
                {versions.map((v) => (
                  <div key={v.phaseRunId} className="flex items-center gap-2 text-[12px] py-1">
                    <span className="font-medium text-text-strong">v{v.phaseVersion}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${v.status === 'COMPLETED' ? 'bg-success/15 text-success' : v.status === 'ERROR' ? 'bg-danger/15 text-danger' : 'bg-bg-layer3 text-text-muted'}`}>
                      {v.status}
                    </span>
                    {v.active && <span className="text-accent text-[10px]">● active</span>}
                    <span className="text-text-faint text-[10px] ml-auto">{new Date(v.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Metadata */}
            <Section name="meta" title="Metadata">
              <div className="text-[12px] space-y-1">
                <div><span className="text-text-muted">ID:</span> <span className="text-text-base font-mono text-[11px]">{phase.phaseRunId}</span></div>
                <div><span className="text-text-muted">Created:</span> <span className="text-text-base">{new Date(phase.createdAt).toLocaleString()}</span></div>
                <div><span className="text-text-muted">Updated:</span> <span className="text-text-base">{new Date(phase.updatedAt).toLocaleString()}</span></div>
                {phase.humanFeedback && (
                  <div><span className="text-text-muted">Feedback:</span> <span className="text-text-base">{phase.humanFeedback}</span></div>
                )}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
