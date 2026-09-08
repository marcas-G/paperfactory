import { Routes, Route } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import ResearchView from '@/views/ResearchView';
import WelcomeView from '@/views/WelcomeView';
import ProjectsView from '@/views/ProjectsView';
import PapersView from '@/views/PapersView';

export default function App() {
  return (
    <div className="flex h-screen bg-bg-base text-text-base overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden">
        <Routes>
          <Route path="/" element={<WelcomeView />} />
          <Route path="/research/:projectId" element={<ResearchView />} />
          <Route path="/projects" element={<ProjectsView />} />
          <Route path="/papers" element={<PapersView />} />
        </Routes>
      </main>
    </div>
  );
}
