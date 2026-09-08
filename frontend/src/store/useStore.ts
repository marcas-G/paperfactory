import { create } from 'zustand';
import client from '@/api/client';
import type { ProjectSummary, PhaseRun } from '@/api/types';

type Status = 'ready' | 'running' | 'done' | 'error';

interface SSEMessage {
  event: string;
  data: unknown;
}

interface AppState {
  // Projects
  projects: ProjectSummary[];
  fetchProjects: () => Promise<void>;
  createProject: (question: string) => Promise<ProjectSummary | null>;
  deleteProject: (id: string) => Promise<void>;

  // Research
  status: Status;
  setStatus: (s: Status) => void;

  // SSE
  sseConnected: boolean;
  sseMessages: SSEMessage[];
  addSseMessage: (msg: SSEMessage) => void;
  clearSseMessages: () => void;

  // UI
  language: 'zh' | 'en';
  setLanguage: (l: 'zh' | 'en') => void;
}

export const useStore = create<AppState>((set) => ({
  projects: [],
  status: 'ready',
  sseConnected: false,
  sseMessages: [],
  language: 'zh',

  fetchProjects: async () => {
    try {
      const { data } = await client.get<ProjectSummary[]>('/projects');
      set({ projects: Array.isArray(data) ? data : [] });
    } catch {
      set({ projects: [] });
    }
  },

  createProject: async (question: string) => {
    try {
      const payload = { name: question, question: question };
      const { data } = await client.post<ProjectSummary>('/projects', payload);
      set((s) => ({ projects: [data, ...s.projects] }));
      return data;
    } catch {
      return null;
    }
  },

  deleteProject: async (id: string) => {
    try {
      await client.delete(`/projects/${id}`);
      set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
    } catch {}
  },

  setStatus: (s: Status) => set({ status: s }),

  addSseMessage: (msg: SSEMessage) =>
    set((s) => ({ sseMessages: [...s.sseMessages, msg] })),

  clearSseMessages: () => set({ sseMessages: [] }),

  setLanguage: (l: 'zh' | 'en') => set({ language: l }),
}));
