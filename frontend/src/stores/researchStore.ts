/**
 * researchStore —— 当前研究会话的唯一状态源。
 *
 * 职责：消息流（用户/AI/报告/审批卡）、运行状态、阶段列表、报告列表。
 * 事件 → store 的写入全部由 useEventStream 完成；组件只读。
 * 每个项目的消息按 localStorage key 持久化（刷新不丢，切项目自动换档）。
 */
import { create } from 'zustand';
import type { ChatMessage, ActivityItem, PaperInfo } from '@/features/chat/types';
import type { PhaseRun } from '@/api/types';

export type RunStatus = 'ready' | 'running' | 'done' | 'error';

/** 右栏报告条目（/reports 端点返回 Record<string,unknown>，此处为兜底解析后的形态） */
export interface ReportInfo {
  reportId?: string;
  title: string;
  content: string;
  createdAt?: string;
}

const storageKey = (pid: string) => `pf_chat_${pid}`;

const loadSaved = (pid: string | null): ChatMessage[] => {
  if (!pid) return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey(pid)) || '[]') as ChatMessage[];
  } catch {
    return [];
  }
};

const saveMessages = (pid: string | null, msgs: ChatMessage[]) => {
  if (!pid) return;
  try {
    localStorage.setItem(storageKey(pid), JSON.stringify(msgs));
  } catch {
    /* quota / serialize 失败静默 */
  }
};

/** 消息 id 发号器：从已恢复的最大 id 续排，避免刷新后撞 id */
let nextId = 1;
const bumpId = (msgs: ChatMessage[]) => {
  const max = msgs.reduce((m, x) => Math.max(m, x.id), 0);
  nextId = Math.max(nextId, max + 1);
};

interface ResearchState {
  projectId: string | null;
  messages: ChatMessage[];
  isRunning: boolean;
  status: RunStatus;
  currentRunId: string | null;
  phases: PhaseRun[];
  reports: ReportInfo[];

  /** 切换项目：自动 load/save localStorage 档案 */
  setProject: (pid: string | null) => void;
  addMessage: (msg: Omit<ChatMessage, 'id'>) => void;
  appendActivity: (item: ActivityItem) => void;
  updateLastToolActivity: (patch: { resultSummary?: string; detail?: string }) => void;
  setPhaseActivityStatus: (status: 'active' | 'done' | 'error', resultSummary?: string) => void;
  addPapers: (papers: PaperInfo[]) => void;
  setRunning: (v: boolean, status?: RunStatus) => void;
  setStatus: (s: RunStatus) => void;
  setCurrentRunId: (id: string | null) => void;
  setPhases: (phases: PhaseRun[]) => void;
  setReports: (reports: ReportInfo[]) => void;
  clear: () => void;
}

/** 找最后一条含 activities 的 assistant 消息（= 当前阶段消息）并返回其下标 */
const lastStageIndex = (msgs: ChatMessage[]): number => {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'assistant' && m.activities && m.activities.length > 0) return i;
  }
  return -1;
};

export const useResearchStore = create<ResearchState>((set, get) => ({
  projectId: null,
  messages: [],
  isRunning: false,
  status: 'ready',
  currentRunId: null,
  phases: [],
  reports: [],

  setProject: (pid) => {
    const prev = get().projectId;
    if (prev === pid) return;
    saveMessages(prev, get().messages);
    const msgs = loadSaved(pid);
    bumpId(msgs);
    set({
      projectId: pid,
      messages: msgs,
      isRunning: false,
      status: 'ready',
      currentRunId: null,
      phases: [],
      reports: [],
    });
  },

  addMessage: (msg) => {
    const { projectId, messages } = get();
    const next = [...messages, { ...msg, id: nextId++ }];
    bumpId(next);
    saveMessages(projectId, next);
    set({ messages: next });
  },

  appendActivity: (item) => {
    const { projectId, messages } = get();
    const next = messages.map((m) => ({ ...m, activities: m.activities ? [...m.activities] : m.activities }));
    const idx = lastStageIndex(next);
    if (idx === -1) return;
    next[idx].activities = [...(next[idx].activities ?? []), item];
    saveMessages(projectId, next);
    set({ messages: next });
  },

  updateLastToolActivity: (patch) => {
    const { projectId, messages } = get();
    const next = messages.map((m) => ({ ...m, activities: m.activities ? [...m.activities] : m.activities }));
    const idx = lastStageIndex(next);
    if (idx === -1) return;
    const acts = next[idx].activities ?? [];
    for (let i = acts.length - 1; i >= 0; i--) {
      if (acts[i].kind === 'tool' && acts[i].status === 'active') {
        acts[i] = { ...acts[i], status: 'done', ...patch };
        break;
      }
    }
    saveMessages(projectId, next);
    set({ messages: next });
  },

  setPhaseActivityStatus: (status, resultSummary) => {
    const { projectId, messages } = get();
    const next = messages.map((m) => ({ ...m, activities: m.activities ? [...m.activities] : m.activities }));
    const idx = lastStageIndex(next);
    if (idx === -1) return;
    const acts = next[idx].activities ?? [];
    for (let i = acts.length - 1; i >= 0; i--) {
      if (acts[i].kind === 'phase') {
        acts[i] = { ...acts[i], status, ...(resultSummary !== undefined ? { resultSummary } : {}) };
        break;
      }
    }
    saveMessages(projectId, next);
    set({ messages: next });
  },

  addPapers: (papers) => {
    if (papers.length === 0) return;
    get().addMessage({ role: 'assistant', papers });
  },

  setRunning: (v, status) =>
    set({ isRunning: v, status: status ?? (v ? 'running' : 'ready') }),

  setStatus: (s) => set({ status: s }),

  setCurrentRunId: (id) => set({ currentRunId: id }),

  setPhases: (phases) => set({ phases }),

  setReports: (reports) => set({ reports }),

  clear: () => {
    const { projectId } = get();
    saveMessages(projectId, []);
    set({ messages: [], isRunning: false, status: 'ready', currentRunId: null });
  },
}));
