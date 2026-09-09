/**
 * AppShell —— 三栏布局骨架。
 *
 * ┌─────────┬──────────────────────┬──────────────┐
 * │ Sidebar │   Chat（中栏 Outlet） │ ArtifactPanel│
 * └─────────┴──────────────────────┴──────────────┘
 *
 * - 事件流全局唯一订阅挂在这里（projectId = 当前项目）
 * - 右栏仅在 chat 路由渲染（/papers /projects 为全页视图）
 * - 窄屏（<1024px）右栏由 uiStore.artifactPanelOpen 控制显隐
 * - 全局抽屉（证据链 / 阶段详情）以 fixed overlay 挂在最外层
 */
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '@/layout/Sidebar';
import ArtifactPanel from '@/layout/ArtifactPanel';
import PhaseDetailDrawer from '@/layout/PhaseDetailDrawer';
import EvidenceChainDrawer from '@/features/evidence/EvidenceChainDrawer';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { useEventStream } from '@/hooks/useEventStream';

export default function AppShell() {
  const projectId = useProjectStore((s) => s.currentProjectId);
  const location = useLocation();

  // 全局唯一事件流：事件 → store 单向流
  useEventStream(projectId);

  const isChatRoute =
    location.pathname === '/' || location.pathname.startsWith('/research');

  const chainTarget = useUIStore((s) => s.chainTarget);
  const closeChain = useUIStore((s) => s.closeChain);
  const detailPhase = useUIStore((s) => s.detailPhase);
  const closePhaseDetail = useUIStore((s) => s.closePhaseDetail);

  return (
    <div className="flex h-screen bg-bg-base text-text-base overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden min-w-0">
        <Outlet />
      </main>
      {isChatRoute && <ArtifactPanel />}

      {/* 全局抽屉 overlay（fixed，覆盖右栏） */}
      {chainTarget && projectId && (
        <EvidenceChainDrawer target={chainTarget} projectId={projectId} onClose={closeChain} />
      )}
      {detailPhase && projectId && (
        <PhaseDetailDrawer phase={detailPhase} projectId={projectId} onClose={closePhaseDetail} />
      )}
    </div>
  );
}
