import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Plus, Search, X } from 'lucide-react';

export default function Sidebar() {
  const navigate = useNavigate();
  const { projects, fetchProjects, createProject, deleteProject } = useStore();

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const currentProjectId = window.location.pathname.match(/\/research\/(.+)/)?.[1];

  return (
    <div className="w-[260px] min-w-[260px] flex flex-col bg-bg-layer1 border-r border-border-base/50 overflow-hidden">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-base/50">
        <span className="text-sm font-semibold text-text-strong tracking-wide">PF</span>
        <button
          onClick={() => navigate('/projects')}
          className="w-7 h-7 rounded-md border border-border-base/50 bg-bg-layer2 flex items-center justify-center text-text-base hover:bg-bg-layer3 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate(`/research/${p.id}`)}
            className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-bg-layer2 ${
              currentProjectId === p.id ? 'bg-bg-layer3' : ''
            }`}
          >
            <span
              className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
                p.status === 'ACTIVE' ? 'bg-accent' : p.status === 'COMPLETED' ? 'bg-success' : 'bg-text-muted'
              }`}
            />
            <span className="flex-1 text-[13px] text-text-base truncate">{p.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-opacity p-1"
            >
              <X size={12} />
            </button>
          </button>
        ))}
        {projects.length === 0 && (
          <div className="px-4 py-8 text-center text-[12px] text-text-faint">No sessions</div>
        )}
      </div>
    </div>
  );
}
