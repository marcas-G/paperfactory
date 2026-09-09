/**
 * useEvidenceChain —— 证据链下钻入口封装。
 *
 * 事件流不带 hypothesisId 时按 statement 反查项目假设列表，
 * 仍取不到则不开抽屉（REQ-G3 行为保持）。
 */
import { useCallback } from 'react';
import { pf } from '@/api/pfClient';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore, type ChainTarget } from '@/stores/uiStore';

export function useEvidenceChain() {
  const openChain = useUIStore((s) => s.openChain);

  /** 假设卡片 → 证据链（缺 id 时按 statement 反查） */
  const openHypothesisChain = useCallback(
    async (statement: string, hypothesisId?: string) => {
      const pid = useProjectStore.getState().currentProjectId;
      if (!pid) return;
      let id = hypothesisId;
      if (!id) {
        try {
          const res = (await pf.getProjectHypotheses(pid)) as unknown;
          const arr = Array.isArray(res) ? res : ((res as { data?: unknown[] }).data ?? []);
          const hyps = arr as Array<{ hypothesisId?: string; statement?: string }>;
          const match = hyps.find((h) => h.statement === statement) ?? hyps[hyps.length - 1];
          id = match?.hypothesisId;
        } catch {
          /* 拉取失败视为无链可下钻 */
        }
      }
      if (id) openChain({ objectType: 'Hypothesis', objectId: id });
    },
    [openChain]
  );

  const openReportChain = useCallback(
    (reportId: string) => openChain({ objectType: 'Report', objectId: reportId }),
    [openChain]
  );

  const openCitationChain = useCallback(
    (citationId: string) => openChain({ objectType: 'Citation', objectId: citationId }),
    [openChain]
  );

  const openEvidenceChain = useCallback(
    (evidenceId: string) => openChain({ objectType: 'Evidence', objectId: evidenceId }),
    [openChain]
  );

  return { openHypothesisChain, openReportChain, openCitationChain, openEvidenceChain, openChain };
}

export type { ChainTarget };
