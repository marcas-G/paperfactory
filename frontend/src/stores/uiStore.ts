/**
 * uiStore —— 纯 UI 状态：右栏面板标签/开关、全局抽屉（证据链 / 阶段详情）。
 * 抽屉状态放全局是因为触发点分散在 ChatView / EvidenceTab / ReportsTab / PhasesTab。
 */
import { create } from 'zustand';
import type { PhaseRun } from '@/api/types';

/** 证据链下钻目标（EvidenceChainDrawer 消费） */
export interface ChainTarget {
  objectType: string;
  objectId: string;
}

export type ArtifactTab = 'evidence' | 'reports' | 'phases';

interface UIState {
  artifactTab: ArtifactTab;
  setArtifactTab: (tab: ArtifactTab) => void;

  /** 右栏开关（窄屏默认收起，由 AppShell 响应式控制初始值） */
  artifactPanelOpen: boolean;
  setArtifactPanelOpen: (v: boolean) => void;
  toggleArtifactPanel: () => void;

  chainTarget: ChainTarget | null;
  openChain: (target: ChainTarget) => void;
  closeChain: () => void;

  detailPhase: PhaseRun | null;
  openPhaseDetail: (phase: PhaseRun) => void;
  closePhaseDetail: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  artifactTab: 'evidence',
  setArtifactTab: (tab) => set({ artifactTab: tab }),

  artifactPanelOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  setArtifactPanelOpen: (v) => set({ artifactPanelOpen: v }),
  toggleArtifactPanel: () => set((s) => ({ artifactPanelOpen: !s.artifactPanelOpen })),

  chainTarget: null,
  openChain: (target) => set({ chainTarget: target }),
  closeChain: () => set({ chainTarget: null }),

  detailPhase: null,
  openPhaseDetail: (phase) => set({ detailPhase: phase }),
  closePhaseDetail: () => set({ detailPhase: null }),
}));
