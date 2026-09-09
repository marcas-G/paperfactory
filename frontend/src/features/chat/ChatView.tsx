/**
 * ChatView —— 主对话区（中栏）。
 * / 与 /research/:projectId 共用：路由参数同步进 projectStore，
 * 消息与运行状态全部来自 researchStore，命令走 useResearch。
 */
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useProjectStore } from '@/stores/projectStore';
import { useResearchStore } from '@/stores/researchStore';
import { useUIStore } from '@/stores/uiStore';
import { useResearch } from '@/hooks/useResearch';
import { useEvidenceChain } from '@/hooks/useEvidenceChain';
import MessageList from './MessageList';
import InputBar from './InputBar';
import { PanelRight } from 'lucide-react';

export default function ChatView() {
  const { projectId } = useParams<{ projectId: string }>();
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);
  const setProject = useResearchStore((s) => s.setProject);
  const toggleArtifactPanel = useUIStore((s) => s.toggleArtifactPanel);

  // 路由 → store 同步（/research/:id 直达时选中该项目）
  useEffect(() => {
    if (projectId) {
      setCurrentProject(projectId);
      setProject(projectId);
    }
  }, [projectId, setCurrentProject, setProject]);

  const { start, stop, resume, submitDecision } = useResearch();
  const { openHypothesisChain, openReportChain } = useEvidenceChain();

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* 顶栏：右栏开关（窄屏时右栏收起，此按钮唤出） */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-border-base/50 bg-bg-base">
        <button
          onClick={toggleArtifactPanel}
          className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-strong hover:bg-bg-layer2 transition-colors cursor-pointer"
          title="Toggle artifact panel"
        >
          <PanelRight size={14} />
        </button>
      </div>

      <MessageList
        onApprove={(rid) => submitDecision(rid, 'approve')}
        onModify={(rid, fb) => submitDecision(rid, 'modify', fb)}
        onReject={(rid, reason) => submitDecision(rid, 'reject', reason)}
        onOpenHypothesisChain={openHypothesisChain}
        onOpenReportChain={openReportChain}
        onPickExample={(q) => start(q)}
      />

      <InputBar onSend={start} onStop={stop} onResume={resume} />
    </div>
  );
}
