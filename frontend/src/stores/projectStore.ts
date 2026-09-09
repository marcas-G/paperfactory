/**
 * projectStore —— 项目列表与当前选中项目。
 * 三栏布局的中枢：Sidebar 写 currentProjectId，ChatView / ArtifactPanel / 各全页视图读它。
 */
import { create } from 'zustand';
import { pf } from '@/api/pfClient';
import type { ProjectSummary } from '@/api/types';

interface ProjectState {
  projects: ProjectSummary[];
  currentProjectId: string | null;
  fetchProjects: () => Promise<void>;
  createProject: (question: string) => Promise<ProjectSummary | null>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,

  fetchProjects: async () => {
    try {
      const res = (await pf.getProjects()) as unknown;
      const data = (res as { data?: ProjectSummary[] }).data ?? (res as ProjectSummary[]);
      set({ projects: Array.isArray(data) ? data : [] });
    } catch {
      set({ projects: [] });
    }
  },

  createProject: async (question) => {
    try {
      const res = (await pf.createProject({ name: question })) as unknown;
      const data = (res as { data?: ProjectSummary }).data ?? (res as ProjectSummary);
      if (!data?.id) return null;
      set((s) => ({ projects: [data, ...s.projects] }));
      return data;
    } catch {
      return null;
    }
  },

  deleteProject: async (id) => {
    try {
      await pf.deleteProject(id);
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        // 删的是当前项目时回到欢迎态
        currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
      }));
    } catch {
      /* 删除失败保持列表不变 */
    }
  },

  setCurrentProject: (id) => {
    if (get().currentProjectId === id) return;
    set({ currentProjectId: id });
  },
}));
