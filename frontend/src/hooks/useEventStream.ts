/**
 * useEventStream —— 事件 → 状态的单向流（重构核心）。
 *
 * 挂载时按 projectId 订阅 /api/events（SSE），每条事件按 type 路由到
 * researchStore 的对应 action；卸载退订。断线重连由 EventSource 自带
 * Last-Event-ID 机制处理，服务端按 seq 补发。
 *
 * 全局只挂一次（AppShell），所有视图从 store 读派生状态。
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribeEvents } from '@/api/events';
import { pf } from '@/api/pfClient';
import { useResearchStore, type ReportInfo } from '@/stores/researchStore';
import type { PhaseRun } from '@/api/types';
import type { PaperInfo } from '@/features/chat/types';

/** /reports 返回 Record<string,unknown>[]，按候选字段兜底解析 */
export const parseReports = (raw: unknown[]): ReportInfo[] =>
  raw
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        reportId: (o.reportId ?? o.id ?? o.report_id) as string | undefined,
        title: String(o.title ?? o.name ?? 'Research Report'),
        content: String(o.content ?? o.body ?? ''),
        createdAt: typeof o.createdAt === 'string' ? o.createdAt : undefined,
      };
    })
    .filter((r) => r.content);

export function useEventStream(projectId: string | null) {
  const { t } = useTranslation();
  const store = useResearchStore;

  useEffect(() => {
    if (!projectId) return;

    const phaseLabel = (name: string) =>
      (t(`phases.${name}`, { defaultValue: name }) as string) || name;

    /** 拉阶段列表 +（消息为空时）从阶段重建状态摘要 */
    const loadPhases = async () => {
      try {
        const data = (await pf.getProjectPhases(projectId)) as unknown as PhaseRun[];
        const runs = Array.isArray(data) ? data : [];
        store.getState().setPhases(runs);
        if (runs.length > 0 && store.getState().messages.length === 0) {
          const order = [
            'literature_search', 'gap_analysis', 'hypothesis',
            'experiment_design', 'experiment_execution',
            'evidence_evaluation', 'conclusion', 'report',
          ];
          for (const name of order) {
            const latest = runs
              .filter((r) => r.phaseName === name)
              .sort((a, b) => b.phaseVersion - a.phaseVersion)[0];
            if (latest) {
              const suffix =
                latest.status === 'COMPLETED' ? ' ✓'
                : latest.status === 'RUNNING' ? ' ...'
                : latest.status === 'ERROR' ? ' ✗' : '';
              store.getState().addMessage({
                role: 'assistant',
                content: `${phaseLabel(name)}${suffix}`,
              });
            }
          }
        }
      } catch {
        /* 阶段拉取失败不阻塞会话 */
      }
    };

    /** 拉报告列表（右栏 ReportsTab + run:complete 落消息共用） */
    const loadReports = async (): Promise<ReportInfo[]> => {
      try {
        const res = (await pf.getProjectReports(projectId)) as unknown;
        const raw = ((res as { data?: unknown[] }).data ?? (res as unknown[])) as unknown[];
        const reports = parseReports(Array.isArray(raw) ? raw : []);
        store.getState().setReports(reports);
        return reports;
      } catch {
        return [];
      }
    };

    loadPhases();
    loadReports();

    const handleEvent = (type: string, data: Record<string, unknown>) => {
      const s = store.getState();
      switch (type) {
        case 'run:start':
          s.setCurrentRunId(String(data.runId ?? ''));
          break;

        case 'phase:start':
          s.addMessage({
            role: 'assistant',
            activities: [{
              kind: 'phase',
              label: phaseLabel(String(data.phase ?? '')),
              status: 'active',
              timestamp: String(data.timestamp ?? ''),
            }],
          });
          break;

        case 'thinking':
        case 'message':
          if (data.content) {
            s.appendActivity({ kind: 'thinking', label: String(data.content), status: 'done' });
          }
          break;

        case 'tool:calling':
          s.appendActivity({
            kind: 'tool',
            label: t('common.callingTool', { defaultValue: '调用工具' }) as string,
            status: 'active',
            toolName: String(data.toolName ?? 'tool'),
            toolArgs: (data.toolArgs ?? {}) as Record<string, unknown>,
          });
          break;

        case 'tool:result': {
          const toolName = String(data.toolName ?? '');
          const raw = (data.toolResult ?? {}) as { papers?: unknown[]; content?: string };
          s.updateLastToolActivity({
            resultSummary:
              toolName === 'literature_search' || toolName === 'search'
                ? `${raw.papers?.length ?? 0} papers`
                : toolName === 'code' ? 'executed' : undefined,
            detail: (raw.content ?? JSON.stringify(raw)).slice(0, 2000),
          });
          if (toolName === 'literature_search' || toolName === 'search') {
            const papers = (raw.papers ?? []) as Array<{
              title?: string; authors?: string[] | string; summary?: string;
              url?: string; published?: string;
            }>;
            if (papers.length > 0) {
              const mapped: PaperInfo[] = papers.slice(0, 5).map((p) => ({
                title: p.title ?? '',
                url: p.url,
                summary: p.summary?.slice(0, 240),
                authors: Array.isArray(p.authors)
                  ? p.authors.slice(0, 3).join(', ')
                  : String(p.authors ?? ''),
                year: String(p.published ?? '').slice(0, 4),
              }));
              s.addPapers(mapped);
            }
          }
          break;
        }

        case 'phase:complete':
          s.setPhaseActivityStatus('done');
          break;

        case 'phase:error':
          s.setPhaseActivityStatus('error', 'failed');
          break;

        case 'phase:awaiting_approval':
          s.addMessage({
            role: 'assistant',
            needsApproval: true,
            approvalSummary: String(data.summary ?? ''),
            approvalRunId: String(data.runId ?? ''),
          });
          break;

        case 'hypothesis:proposed':
          s.addMessage({
            role: 'assistant',
            hypothesis: String(data.statement ?? ''),
            hypothesisId: data.hypothesisId ? String(data.hypothesisId) : undefined,
          });
          break;

        case 'self:review':
          s.appendActivity({
            kind: 'review',
            label: `Self-review ${data.passed ? 'passed' : 'found issues'}`,
            status: data.passed ? 'done' : 'error',
          });
          break;

        case 'run:complete': {
          s.setRunning(false, 'done');
          s.addMessage({
            role: 'assistant',
            content: t('common.complete', { defaultValue: 'Research complete' }) as string,
          });
          loadPhases();
          loadReports().then((reports) => {
            const latest = reports[reports.length - 1];
            if (latest?.content) {
              store.getState().addMessage({
                role: 'assistant',
                isReport: true,
                reportTitle: latest.title,
                reportId: latest.reportId,
                content: latest.content,
              });
            }
          });
          break;
        }

        case 'run:error':
          s.setRunning(false, 'error');
          s.addMessage({
            role: 'assistant',
            content: `**Error**\n\n${String(data.error ?? data.content ?? 'unknown')}`,
          });
          loadPhases();
          break;

        default:
          break;
      }
    };

    const unsubscribe = subscribeEvents(
      (e) => {
        if (e.type === 'stream:ready') return;
        if (e.projectId && e.projectId !== projectId) return;
        handleEvent(e.type, { ...(e.data ?? {}), phase: e.phase, runId: e.runId });
      },
      { projectId }
    );

    return unsubscribe;
  }, [projectId, t, store]);
}
