import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Send, Square, X } from 'lucide-react';
import PhaseBar from '@/components/layout/PhaseBar';
import ChatArea from '@/components/chat/ChatArea';
import PhaseDetailDrawer from '@/components/layout/PhaseDetailDrawer';
import { useStore } from '@/store/useStore';
import client from '@/api/client';
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
      const phaseLabel = (name: string) => t(`phases.${name}`) as string;

      if (event === 'run:start') {
        const rid = String(data.runId ?? '');
        if (rid) setCurrentRunId(rid);
        next.push({ id: msgId++, role: 'assistant', content: 'Research started.' });
      } else if (event === 'phase:start') {
        loadPhases();
        const phase = String(data.phaseName ?? '');
        next.push({ id: msgId++, role: 'assistant', content: `${phaseLabel(phase)}...` });
      } else if (event === 'phase:progress') {
        const phase = String(data.phaseName ?? '');
        const last = [...next].reverse().find((m) => m.content === `${phaseLabel(phase)}...`);
        if (last) last.content = `${phaseLabel(phase)}: ${String(data.progress ?? 'in progress')}`;
      } else if (event === 'phase:complete') {
        loadPhases();
        const phase = String(data.phaseName ?? '');
        const last = [...next].reverse().find((m) => m.content?.startsWith(phaseLabel(phase)));
        if (last) last.content = `${phaseLabel(phase)} ✓`;
      } else if (event === 'phase:error') {
        loadPhases();
        const phase = String(data.phaseName ?? '');
        next.push({ id: msgId++, role: 'assistant', content: `${phaseLabel(phase)} ✗ ${String(data.error ?? '')}` });
      } else if (event === 'phase:approved') {
        const phase = String(data.phaseName ?? '');
        next.push({ id: msgId++, role: 'assistant', content: `${phaseLabel(phase)} approved ✓` });
      } else if (event === 'phase:rejected') {
        const phase = String(data.phaseName ?? '');
        next.push({ id: msgId++, role: 'assistant', content: `${phaseLabel(phase)} rejected ✗` });
      } else if (event === 'phase:modified') {
        const phase = String(data.phaseName ?? '');
        next.push({ id: msgId++, role: 'assistant', content: `${phaseLabel(phase)} modified` });
      } else if (event === 'phase:awaiting_approval') {
        next.push({ id: msgId++, role: 'assistant', needsApproval: true, approvalSummary: String(data.summary ?? ''), approvalRunId: String(data.runId ?? '') });
      } else if (event === 'thinking' || event === 'message') {
        const text = String(data.content ?? String(data));
        const last = next[next.length - 1];
        if (last?.isThinking) { last.thinkingText = text; }
        else { next.push({ id: msgId++, role: 'assistant', isThinking: true, thinkingText: text }); }
      } else if (event === 'tool:calling') {
        const last = next[next.length - 1];
        if (last?.isThinking) { last.thinkingText = `${String(data.toolName ?? 'tool')}...`; }
      } else if (event === 'tool:result') {
        // Silent — tool result is internal
      } else if (event === 'self:review') {
        const passed = (data as Record<string, unknown>).passed as boolean;
        next.push({ id: msgId++, role: 'assistant', content: `Self-review: ${passed ? 'passed ✓' : 'issues found !'}` });
      } else if (event === 'search:result' || event === 'paper:found') {
        const last = next[next.length - 1];
        if (last?.papers) {
          last.papers.push({ title: String(data.sourceTitle ?? data.title ?? ''), authors: String(data.authors ?? data.sourceAuthors ?? ''), year: String(data.year ?? data.sourceYear ?? '') });
        } else {
          next.push({ id: msgId++, role: 'assistant', papers: [{ title: String(data.sourceTitle ?? data.title ?? ''), authors: String(data.authors ?? data.sourceAuthors ?? ''), year: String(data.year ?? data.sourceYear ?? '') }] });
        }
      } else if (event === 'hypothesis:proposed') {
        next.push({ id: msgId++, role: 'assistant', hypothesis: String(data.statement ?? '') });
      } else if (event === 'run:complete') {
        setIsRunning(false);
        setStatus('done');
        loadPhases();
        eventSourceRef.current?.close();
        next.push({ id: msgId++, role: 'assistant', content: t('common.complete') as string });
      } else if (event === 'run:error') {
        setIsRunning(false);
        setStatus('error');
        loadPhases();
        eventSourceRef.current?.close();
        next.push({ id: msgId++, role: 'assistant', content: `Error: ${String(data.error ?? '')}` });
      }
      return next;
    });
  }, [t, setStatus]);

  const startResearch = (question: string) => {
    setMessages((prev) => [...prev, { id: msgId++, role: 'user', content: question }]);
    setInput('');
    setIsRunning(true);
    setStatus('running');
    setCurrentRunId(null);

    const es = new EventSource(`/api/research/stream?q=${encodeURIComponent(question)}`);
    eventSourceRef.current = es;
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        handleSSE(parsed.type ?? parsed.event ?? e.type, parsed);
      } catch {
        handleSSE('message', { content: e.data });
      }
    };
    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };
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
