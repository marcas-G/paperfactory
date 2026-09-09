import { Routes, Route } from 'react-router-dom';
import AppShell from '@/layout/AppShell';
import ChatView from '@/features/chat/ChatView';
import PapersView from '@/features/papers/PapersView';
import ProjectsView from '@/features/projects/ProjectsView';

/**
 * 路由结构：
 *   AppShell（三栏骨架 + 全局事件流 + 全局抽屉）
 *     /                  → ChatView（欢迎态或当前项目会话）
 *     /research/:projectId → ChatView（路由参数同步 currentProjectId）
 *     /papers            → PapersView（全页文献库，跟随当前项目）
 *     /projects          → ProjectsView（全页项目管理）
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<ChatView />} />
        <Route path="/research/:projectId" element={<ChatView />} />
        <Route path="/papers" element={<PapersView />} />
        <Route path="/projects" element={<ProjectsView />} />
      </Route>
    </Routes>
  );
}
