/**
 * useResearch —— 命令通道封装（start / stop / resume / 审批决策）。
 *
 * 命令与事件分离：POST 发起秒回 runId，全部进度经 useEventStream 的
 * 统一事件流回流到 store，这里只负责发命令 + 本地乐观状态。
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { pf } from '@/api/pfClient';
import { useResearchStore } from '@/stores/researchStore';
import { useProjectStore } from '@/stores/projectStore';

export function useResearch() {
  const navigate = useNavigate();

  /**
   * 发起研究。无当前项目时先创建项目（合并原 WelcomeView 行为），
   * 创建成功即切换会话并跳转，再走统一 start 命令。
   */
  const start = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q) return;
      const research = useResearchStore.getState();
      const projects = useProjectStore.getState();

      let pid = projects.currentProjectId;
      if (!pid) {
        const created = await projects.createProject(q);
        if (!created?.id) {
          research.addMessage({
            role: 'assistant',
            content: '**Error**\n\nFailed to create project.',
          });
          return;
        }
        pid = created.id;
        projects.setCurrentProject(created.id);
        navigate(`/research/${created.id}`);
      }

      research.addMessage({ role: 'user', content: q });
      research.setRunning(true, 'running');
      research.setCurrentRunId(null);
      try {
        const res = (await pf.startResearch({ question: q, mode: 'auto' })) as unknown as {
          runId?: string;
        };
        research.setCurrentRunId(res?.runId ? String(res.runId) : null);
      } catch {
        research.setRunning(false, 'error');
        research.addMessage({
          role: 'assistant',
          content: '**Error**\n\nFailed to start research run.',
        });
      }
    },
    [navigate]
  );

  const stop = useCallback(async () => {
    const research = useResearchStore.getState();
    const runId = research.currentRunId;
    if (runId) {
      try {
        await pf.stopResearchRun(runId);
      } catch {
        /* 后端已结束的 run 停止失败按已停止处理 */
      }
    }
    research.setRunning(false, 'error');
    research.setCurrentRunId(null);
    research.addMessage({ role: 'assistant', content: 'Research stopped.' });
  }, []);

  /**
   * 恢复：对最近一次 run 查询状态——仍在跑则恢复 isRunning（事件流未断，
   * EventSource 自动重连补发过的事件），已完成则直接落报告。
   */
  const resume = useCallback(async () => {
    const research = useResearchStore.getState();
    const runId = research.currentRunId;
    if (!runId) return;
    try {
      const res = (await pf.getResearchRunStatus(runId)) as unknown as {
        status?: string;
        projectId?: string;
      };
      const st = String(res?.status ?? '').toUpperCase();
      if (st === 'RUNNING' || st === 'PENDING' || st === 'WAITING_APPROVAL') {
        research.setRunning(true, 'running');
      } else if (st === 'COMPLETED') {
        research.setRunning(false, 'done');
        research.addMessage({
          role: 'assistant',
          content: 'Research complete.',
        });
      } else {
        research.addMessage({
          role: 'assistant',
          content: `Run status: ${st || 'unknown'}`,
        });
      }
    } catch {
      research.addMessage({
        role: 'assistant',
        content: '**Error**\n\nFailed to query run status.',
      });
    }
  }, []);

  /** 审批决策（approve / modify / reject） */
  const submitDecision = useCallback(
    async (runId: string, decision: 'approve' | 'modify' | 'reject', feedback = '') => {
      const pid = useProjectStore.getState().currentProjectId;
      if (!pid) return;
      try {
        await pf.submitPhaseDecision(pid, runId, { decision, feedback });
      } catch {
        /* 决策失败由后端事件流反馈 */
      }
    },
    []
  );

  return { start, stop, resume, submitDecision };
}
