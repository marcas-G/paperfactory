import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';

export default function ProjectsView() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { projects, fetchProjects, createProject, deleteProject } = useStore();
  const [showNew, setShowNew] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleCreate = async () => {
    if (!newQuestion.trim()) return;
    const result = await createProject(newQuestion);
    setNewQuestion('');
    setShowNew(false);
    if (result?.id) navigate(`/research/${result.id}`);
  };

  const statusColor: Record<string, string> = {
    ACTIVE: 'bg-accent',
    COMPLETED: 'bg-success',
    ERROR: 'bg-danger',
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border-base/50 bg-bg-layer1 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-strong">{t('nav.projects')}</h1>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent text-white text-[13px] font-medium cursor-pointer hover:bg-accentHover transition-colors">
          <Plus size={14} />
          <span>New</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
        {projects.length === 0 ? (
          <div className="text-center py-16 text-text-faint text-sm">{t('common.noProjects')}</div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center gap-3 bg-bg-layer1 border border-border-base/50 rounded-lg px-4 py-3 hover:border-border-strong/50 transition-colors">
                <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${statusColor[p.status] || 'bg-text-muted'}`} />
                <button onClick={() => navigate(`/research/${p.id}`)} className="flex-1 text-left cursor-pointer">
                  <div className="text-[13px] font-medium text-text-strong truncate">{p.name}</div>
                  <div className="text-[11px] text-text-muted">{new Date(p.createdAt).toLocaleDateString()}</div>
                </button>
                <button onClick={() => deleteProject(p.id)} className="text-text-muted hover:text-danger transition-colors cursor-pointer p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New project modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
          <div className="bg-bg-layer2 border border-border-strong rounded-xl p-6 w-[440px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-text-strong mb-4">New Project</h2>
            <input
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder={t('common.enterQuestion') as string}
              autoFocus
              className="w-full px-3 py-2 bg-bg-base border border-border-base/50 rounded-lg text-[13px] text-text-strong outline-none placeholder:text-text-faint mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded-md text-[13px] text-text-base hover:bg-bg-layer3 cursor-pointer transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={!newQuestion.trim()} className="px-3 py-1.5 rounded-md bg-accent text-white text-[13px] font-medium disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
