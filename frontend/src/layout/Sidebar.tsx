/**
 * Sidebar —— 左栏：项目列表 + 底部导航。
 * 点击项目 → /research/:id（ChatView 同步 currentProjectId 到全局）。
 */
import { useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { Plus, X, FlaskConical, BookOpen, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/stores/projectStore';

export default function Sidebar() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const projects = useProjectStore((s) => s.projects);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const deleteProject = useProjectStore((s) => s.deleteProject);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const navItems = [
    { to: '/', label: t('nav.research'), icon: FlaskConical, end: true },
    { to: '/papers', label: t('nav.papers'), icon: BookOpen, end: false },
    { to: '/projects', label: t('nav.projects'), icon: FolderOpen, end: false },
  ];

  return (
    <div className="w-[240px] min-w-[240px] flex flex-col bg-bg-layer1 border-r border-border-base/50 overflow-hidden">
      {/* Logo + 新建 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-base/50">
        <span className="text-sm font-semibold text-text-strong tracking-wide">PF</span>
        <button
          onClick={() => navigate('/projects')}
          title={t('common.new')}
          className="w-7 h-7 rounded-md border border-border-base/50 bg-bg-layer2 flex items-center justify-center text-text-base hover:bg-bg-layer3 transition-colors cursor-pointer"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* 项目列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
        {projects.map((p) => (
          <div key={p.id} className="group relative">
            <button
              onClick={() => navigate(`/research/${p.id}`)}
              className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-bg-layer2 ${
                currentProjectId === p.id ? 'bg-bg-layer3' : ''
              }`}
            >
              <span
                className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
                  p.status === 'ACTIVE'
                    ? 'bg-accent'
                    : p.status === 'COMPLETED'
                      ? 'bg-success'
                      : 'bg-text-muted'
                }`}
              />
              <span className="flex-1 text-[13px] text-text-base truncate">{p.name}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void deleteProject(p.id);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-opacity p-1 cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="px-4 py-8 text-center text-[12px] text-text-faint">
            {t('common.noProjects')}
          </div>
        )}
      </div>

      {/* 底部导航 */}
      <div className="border-t border-border-base/50 py-2">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2 text-[13px] transition-colors ${
                isActive ? 'text-text-strong bg-bg-layer2' : 'text-text-muted hover:text-text-base hover:bg-bg-layer2'
              }`
            }
          >
            <Icon size={14} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
