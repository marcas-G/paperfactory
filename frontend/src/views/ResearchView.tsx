import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Send, Square, X } from 'lucide-react';
import PhaseBar from '@/components/layout/PhaseBar';
import ChatArea from '@/components/chat/ChatArea';
import PhaseDetailDrawer from '@/components/layout/PhaseDetailDrawer';
import { useStore } from '@/store/useStore';
import client from '@/api/client';
import { subscribeEvents, type BusEvent } from '@/api/events';
import type { ChatMessage } from '@/components/chat/types';
import type { PhaseRun } from '@/api/types';

const storageKey = (pid: string) => `pf_chat_${pid}`;

export default function ResearchView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { setStatus } = useStore();

  const loadSaved = (): ChatMessage[] => {
    if (!projectId) return [];
    try { return JSON.parse(localStorage.getItem(storageKey(projectId)) || '[]') as ChatMessage[]; }
    catch { return []; }
  };
  const saveToStorage = (msgs: ChatMessage[]) => {
    if (!projectId) return;
    try { localStorage.setItem(storageKey(projectId), JSON.stringify(msgs)); } catch {}
  };

  const [messages, setMessages] = useState<ChatMessage[]>(loadSaved);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [phases, setPhases] = useState<PhaseRun[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<PhaseRun | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  let msgId = 0;

  // Sync messages to localStorage whenever they change
  useEffect(() => { saveToStorage(messages); }, [messages, projectId]);

  // Update msgId when messages change so new messages don't get duplicate IDs
  useEffect(() => {
    const maxId = messages.reduce((max, m) => Math.max(max, m.id), -1);
    msgId = maxId + 1;
  }, [messages]);

  useEffect(() => {
    if (!projectId) return;
    loadPhases();
  }, [projectId]);


  const loadPhases = async () => {
    if (!projectId) return;
    try {
      const { data } = await client.get<PhaseRun[]>(`/projects/${projectId}/phases`);
      const runs = Array.isArray(data) ? data : [];
      setPhases(runs);
      // If no saved messages, rebuild from phases
      if (runs.length > 0 && messages.length === 0) {
        const phaseOrder = ['literature_search', 'gap_analysis', 'hypothesis', 'experiment_design', 'experiment_execution', 'evidence_evaluation', 'conclusion', 'report'];
        const statusMsgs: ChatMessage[] = [];
        for (const name of phaseOrder) {
          const phaseRuns = runs.filter((r) => r.phaseName === name);
          if (phaseRuns.length > 0) {
            const latest = phaseRuns.sort((a, b) => b.phaseVersion - a.phaseVersion)[0];
            const status = latest.status === 'COMPLETED' ? ' ✓' : latest.status === 'RUNNING' ? ' ...' : latest.status === 'ERROR' ? ' ✗' : '';
            statusMsgs.push({ id: msgId++, role: 'assistant', content: `${t(`phases.${name}`) as string}${status}` });
          }
        }
        if (statusMsgs.length > 0) setMessages(statusMsgs);
      }
    } catch {}
  };

  const handleSSE = useCallback((event: string, data: Record<string, unknown>) => {
    setMessages((prev) => {
      const next = [...prev];
      const phaseLabel = (name: string) => (t(`phases.${name}`, { defaultValue: name }) as string) || name;
      // 当前阶段消息 = 最后一条含 activities 的 assistant 消息
      const lastStage = [...next].reverse().find((m) => m.role === 'assistant' && m.activities?.length);
      const touch = () => { if (lastStage) lastStage.activities = [...(lastStage.activities ?? [])]; };

      if (event === 'run:start') {
        setCurrentRunId(String(data.runId ?? ''));
      } else if (event === 'phase:start') {
        const phase = String(data.phase ?? '');
        next.push({ id: msgId++, role: 'assistant', activities: [{ kind: 'phase', label: phaseLabel(phase), status: 'active', timestamp: String(data.timestamp ?? '') }] });
      } else if (event === 'thinking' || event === 'message') {
        if (lastStage) { touch(); lastStage.activities!.push({ kind: 'thinking', label: String(data.content ?? ''), status: 'done' }); }
      } else if (event === 'tool:calling') {
        if (lastStage) {
          touch();
          lastStage.activities!.push({
            kind: 'tool', label: '调用工具', status: 'active',
            toolName: String(data.toolName ?? 'tool'),
            toolArgs: (data.toolArgs ?? {}) as Record<string, unknown>,
          });
        }
      } else if (event === 'tool:result') {
        const toolName = String(data.toolName ?? '');
        const raw = (data.toolResult ?? {}) as { papers?: unknown[]; content?: string };
        if (lastStage) {
          touch();
          const active = [...(lastStage.activities ?? [])].reverse().find((a) => a.kind === 'tool' && a.status === 'active');
          if (active) {
            active.status = 'done';
            if (toolName === 'literature_search' || toolName === 'search') {
              active.resultSummary = `${raw.papers?.length ?? 0} papers`;
            } else if (toolName === 'code') {
              active.resultSummary = 'executed';
            }
            active.detail = (raw.content ?? JSON.stringify(raw)).slice(0, 2000);
          }
        }
        // 文献独立卡片
        const papers = (raw.papers ?? []) as Array<{ title?: string; authors?: string[]; summary?: string; url?: string; published?: string }>;
        if ((toolName === 'literature_search' || toolName === 'search') && papers.length > 0) {
          next.push({
            id: msgId++, role: 'assistant',
            papers: papers.slice(0, 5).map((p) => ({
              title: p.title ?? '', url: p.url, summary: p.summary?.slice(0, 240),
              authors: Array.isArray(p.authors) ? p.authors.slice(0, 3).join(', ') : String(p.authors ?? ''),
              year: String(p.published ?? '').slice(0, 4),
            })),
          });
        }
      } else if (event === 'phase:complete') {
        if (lastStage) { touch(); const ph = lastStage.activities!.find((a) => a.kind === 'phase'); if (ph) ph.status = 'done'; }
      } else if (event === 'phase:error') {
        if (lastStage) { touch(); const ph = lastStage.activities!.find((a) => a.kind === 'phase'); if (ph) { ph.status = 'error'; ph.resultSummary = 'failed'; } }
      } else if (event === 'phase:awaiting_approval') {
        next.push({ id: msgId++, role: 'assistant', needsApproval: true, approvalSummary: String(data.summary ?? ''), approvalRunId: String(data.runId ?? '') });
      } else if (event === 'hypothesis:proposed') {
        next.push({ id: msgId++, role: 'assistant', hypothesis: String(data.statement ?? '') });
      } else if (event === 'self:review') {
        if (lastStage) { touch(); lastStage.activities!.push({ kind: 'review', label: `Self-review ${data.passed ? 'passed' : 'found issues'}`, status: data.passed ? 'done' : 'error' }); }
      } else if (event === 'run:complete') {
        setIsRunning(false); setStatus('done'); loadPhases();
        eventSourceRef.current?.close();
        next.push({ id: msgId++, role: 'assistant', content: t('common.complete', { defaultValue: 'Research complete' }) as string });
        const pid = String(data.projectId ?? '');
        if (pid) {
          client.get<unknown[]>(`/projects/${pid}/reports`).then(({ data: reports }) => {
            const arr = Array.isArray(reports) ? reports : [];
            const latest = arr[arr.length - 1] as { content?: string; title?: string } | undefined;
            if (latest?.content) {
              setMessages((p2) => [...p2, { id: (p2.length ? Math.max(...p2.map((m) => m.id)) : 0) + 1, role: 'assistant' as const, isReport: true, reportTitle: latest.title ?? 'Research Report', content: latest.content }]);
            }
          }).catch(() => {});
        }
      } else if (event === 'run:error') {
        setIsRunning(false); setStatus('error'); loadPhases();
        eventSourceRef.current?.close();
        next.push({ id: msgId++, role: 'assistant', content: `**Error**\n\n${String(data.error ?? data.content ?? 'unknown')}` });
      }
      return next;
    });
  }, [t, setStatus]);

// 统一事件流订阅（OpenCode 式：命令与事件分离，一条流驱动所有 UI 更新）
  useEffect(() => {
    if (!projectId) return;
    const unsubscribe = subscribeEvents((e: BusEvent) => {
      if (e.type === 'stream:ready') return;
      if (e.projectId && projectId && e.projectId !== projectId) return;
      handleSSE(e.type, { ...(e.data ?? {}), phase: e.phase, runId: e.runId });
    }, { projectId });
    return unsubscribe;
  }, [projectId, handleSSE]);

  const startResearch = async (question: string) => {
    setMessages((prev) => [...prev, { id: msgId++, role: 'user', content: question }]);
    setInput('');
    setIsRunning(true);
    setStatus('running');
    setCurrentRunId(null);
    // 命令通道：POST 发起，秒回 runId；全部进度经 /api/events 统一事件流到达
    try {
      const { data } = await client.post<{ runId: string; projectId: string }>('/research/run', { question, mode: 'auto' });
      setCurrentRunId(data.runId);
    } catch {
      setIsRunning(false);
      setStatus('error');
      setMessages((prev) => [...prev, { id: msgId++, role: 'assistant', content: '**Error**\n\nFailed to start research run.' }]);
    }
  };

  const stopResearch = async () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (currentRunId) {
      try { await client.post(`/api/research/${currentRunId}/stop`); } catch {}
    }
    setIsRunning(false);
    setStatus('error');
    setCurrentRunId(null);
    setMessages((prev) => [...prev, { id: msgId++, role: 'assistant', content: 'Research stopped.' }]);
  };

  const submitDecision = async (runId: string, decision: string, feedback: string = '') => {
    if (!projectId) return;
    try {
      await client.post(`/api/projects/${projectId}/phases/${runId}/decision`, { decision, feedback });
    } catch {}
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <PhaseBar phases={phases} onSelectPhase={setSelectedPhase} />
          <ChatArea messages={messages} onApprove={(rid) => submitDecision(rid, 'approve')} onModify={(rid, fb) => submitDecision(rid, 'modify', fb)} onReject={(rid, reason) => submitDecision(rid, 'reject', reason)} />
          <div className="px-6 pb-4 pt-2 bg-bg-base">
            {isRunning && (
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="flex items-center gap-2 text-[12px] text-text-muted">
                  <span className="w-[6px] h-[6px] rounded-full bg-warning animate-pulse" />
                  {t('common.running')}
                </span>
                <button onClick={stopResearch} className="flex items-center gap-1 text-[12px] text-danger hover:text-text-strong cursor-pointer transition-colors">
                  <Square size={10} />
                  <span>Stop</span>
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 bg-bg-layer1 border border-border-base/50 rounded-xl min-h-[48px] transition-colors focus-within:border-border-strong">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim() && !isRunning) startResearch(input); } }}
                placeholder={isRunning ? (t('common.waiting') as string) : (t('common.enterQuestion') as string)}
                disabled={isRunning}
                className="flex-1 px-4 py-2.5 bg-transparent text-[13px] text-text-strong outline-none placeholder:text-text-faint resize-none disabled:opacity-50 max-h-[150px] min-h-[36px]"
                rows={1}
              />
              {isRunning ? (
                <button onClick={stopResearch} className="w-[30px] h-[30px] rounded-md flex items-center justify-center bg-danger text-white mr-1 mb-1 cursor-pointer flex-shrink-0">
                  <Square size={10} />
                </button>
              ) : (
                <button onClick={() => input.trim() && startResearch(input)} disabled={!input.trim()} className="w-[30px] h-[30px] rounded-md flex items-center justify-center bg-accent text-white disabled:opacity-30 disabled:cursor-not-allowed mr-1 mb-1 cursor-pointer flex-shrink-0">
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
        {selectedPhase && (
          <PhaseDetailDrawer phase={selectedPhase} projectId={projectId!} onClose={() => setSelectedPhase(null)} />
        )}
      </div>
    </div>
  );
}
