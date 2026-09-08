<template>
  <div data-component="research">
    <div data-component="phase-bar">
      <div
        v-for="p in phaseStates"
        :key="p.name"
        data-component="phase-step"
        :data-status="p.status"
        @click="selectPhase(p)"
      >
        <span data-slot="icon">
          <template v-if="p.status === 'running'"><span data-slot="spinner" /></template>
          <template v-else-if="p.status === 'done'">✓</template>
          <template v-else-if="p.status === 'error'">!</template>
          <template v-else>{{ p.index + 1 }}</template>
        </span>
        <span data-slot="label" :title="getPhaseLabel(p.name)">{{ getPhaseLabel(p.name) }}</span>
      </div>
    </div>

    <div data-component="body">
      <div data-component="chat-scroll" ref="chatScroll">
        <div v-if="displayMessages.length === 0" data-component="welcome">
          <span data-slot="title">Research Assistant</span>
          <span data-slot="desc">Enter a research question to begin</span>
        </div>

        <div
          v-for="(msg, i) in displayMessages"
          :key="msg.id"
          data-component="message"
          :data-role="msg.role"
        >
          <template v-if="msg.role === 'assistant'">
            <div data-slot="avatar">AI</div>
            <div data-slot="parts">
              <div data-slot="text" v-if="msg.content">{{ msg.content }}</div>

              <div v-if="msg.papers?.length" data-component="tool-card" data-tool="papers">
                <div data-slot="header">
                  <span data-slot="icon">📄</span>
                  <span data-slot="title">Papers ({{ msg.papers.length }})</span>
                </div>
                <div data-slot="output">
                  <div v-for="p in msg.papers.slice(0, 5)" :key="p.title" data-slot="paper">
                    <span data-slot="paper-title">{{ p.title }}</span>
                    <span data-slot="paper-meta" v-if="p.authors">{{ p.authors }} · {{ p.year }}</span>
                  </div>
                  <div v-if="msg.papers.length > 5" data-slot="more">+{{ msg.papers.length - 5 }} more</div>
                </div>
              </div>

              <div v-if="msg.hypothesis" data-component="tool-card" data-tool="hypothesis">
                <div data-slot="header">
                  <span data-slot="icon">💡</span>
                  <span data-slot="title">Hypothesis</span>
                </div>
                <div data-slot="output">{{ msg.hypothesis }}</div>
              </div>

              <div v-if="msg.needsApproval" data-component="tool-card" data-tool="approval">
                <div data-slot="header">
                  <span data-slot="icon">⚡</span>
                  <span data-slot="title">Review Required</span>
                </div>
                <div data-slot="output">{{ msg.approvalSummary }}</div>
                <div data-slot="actions">
                  <button @click="submitApproval('approve')">{{ t('btn.approve') }}</button>
                  <button class="secondary" @click="showModify = !showModify">{{ t('btn.modify') }}</button>
                  <button class="secondary" @click="showReject = !showReject">{{ t('btn.reject') }}</button>
                </div>
                <div v-if="showModify" data-slot="modify">
                  <textarea v-model="modifyText" placeholder="Enter feedback..." />
                  <button @click="submitApproval('modify', modifyText)">Submit</button>
                </div>
                <div v-if="showReject" data-slot="reject">
                  <textarea v-model="rejectText" placeholder="Enter reason..." />
                  <button @click="submitApproval('reject', rejectText)">Submit</button>
                </div>
              </div>

              <div v-if="msg.isThinking" data-component="thinking">
                <span data-slot="dots">
                  <span data-slot="dot" /><span data-slot="dot" /><span data-slot="dot" />
                </span>
                <span data-slot="text">{{ msg.thinkingText }}</span>
              </div>
            </div>
          </template>

          <template v-else>
            <div data-slot="parts" style="display:flex;justify-content:flex-end;">
              <div data-slot="user-bubble">{{ msg.content }}</div>
            </div>
          </template>
        </div>
      </div>

      <div v-if="selectedPhaseState" data-component="detail-panel">
        <div data-slot="panel-header">
          <span data-slot="title">{{ getPhaseLabel(selectedPhaseState.name) }}</span>
          <button data-slot="close" @click="selectedPhaseState = null">×</button>
        </div>
        <div data-slot="panel-body">
          <div data-slot="status-badge" :class="selectedPhaseState.status">
            {{ selectedPhaseState.status }}
          </div>

          <div v-if="selectedPhaseState.status === 'running'" data-slot="running-info">
            <span data-slot="spinner" />
            <span>Agent is working on this phase...</span>
          </div>

          <div v-if="phaseDetail.agentOutput" data-slot="output-section">
            <div data-slot="section-title">Output</div>
            <pre data-slot="output">{{ phaseDetail.agentOutput }}</pre>
          </div>

          <div v-if="phaseDetail.toolCalls?.length" data-slot="tools-section">
            <div data-slot="section-title">Tool Calls ({{ phaseDetail.toolCalls.length }})</div>
            <div v-for="(tc, i) in phaseDetail.toolCalls" :key="i" data-slot="tool-call">
              <div data-slot="tool-name">{{ tc.toolName }}</div>
              <pre data-slot="tool-output" v-if="tc.output">{{ tc.output }}</pre>
            </div>
          </div>

          <div v-if="phaseDetail.selfReview" data-slot="review-section">
            <div data-slot="section-title">Self Review</div>
            <div data-slot="review-result" :class="phaseDetail.selfReview.passed ? 'passed' : 'failed'">
              {{ phaseDetail.selfReview.passed ? 'PASSED' : 'ISSUES FOUND' }} ({{ phaseDetail.selfReview.rounds }} rounds)
            </div>
            <div v-if="phaseDetail.selfReview.issues?.length" data-slot="issues">
              <div v-for="(issue, i) in phaseDetail.selfReview.issues" :key="i" data-slot="issue">
                <span data-slot="severity" :class="issue.severity">{{ issue.severity }}</span>
                <span data-slot="category">{{ issue.category }}</span>
                <span data-slot="message">{{ issue.message }}</span>
              </div>
            </div>
          </div>

          <div v-if="phasePapers.length" data-slot="papers-section">
            <div data-slot="section-title">Related Papers ({{ phasePapers.length }})</div>
            <div v-for="paper in phasePapers" :key="paper.citationId" data-slot="paper">
              <span data-slot="paper-title">{{ paper.sourceTitle }}</span>
              <span data-slot="paper-meta">{{ paper.sourceAuthors?.join(', ') }} · {{ paper.sourceYear }}</span>
              <span data-slot="paper-abstract" v-if="paper.abstract">{{ paper.abstract.slice(0, 120) }}...</span>
            </div>
          </div>

          <div v-if="selectedPhaseState.status === 'done' && phaseVersions.length > 1" data-slot="versions-section">
            <div data-slot="section-title">Versions ({{ phaseVersions.length }})</div>
            <div v-for="v in phaseVersions" :key="v.runId" data-slot="version">
              <span data-slot="version-num">v{{ v.version }}</span>
              <span data-slot="version-status" :class="v.status">{{ v.status }}</span>
              <span data-slot="version-date">{{ new Date(v.createdAt).toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div data-component="input-area">
      <div v-if="isRunning" data-component="status-bar">
        <span data-slot="dot" />
        <span data-slot="text">Research in progress</span>
      </div>
      <div data-component="prompt-input">
        <div
          data-slot="editor"
          contenteditable
          @keydown.enter.prevent="onSend"
          @input="hasInput = !!($event.target as HTMLElement).textContent?.trim()"
          ref="editorRef"
          :class="{ disabled: isRunning }"
          :placeholder="isRunning ? 'Researching...' : t('common.enterQuestion')"
        />
        <div data-slot="actions">
          <button data-slot="attach" title="Attach file">+</button>
          <button data-slot="send" :disabled="!hasInput || isRunning" @click="onSend">
            <span v-if="isRunning" data-slot="stop" @click.stop="onStop" />
            <span v-else data-slot="arrow" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSSE } from '../composables/useSSE';
import { useResearchStatus } from '../composables/useResearchStatus';
import client from '../api/client';
import type { PhaseRun, Paper } from '../api/types';

const { t } = useI18n();
const route = useRoute();
const projectId = computed(() => route.params.projectId as string);

const phaseOrder = [
  'literature_search', 'gap_analysis', 'hypothesis',
  'experiment_design', 'experiment_execution',
  'evidence_evaluation', 'conclusion', 'report',
];

interface PhaseState {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  index: number;
  activeRun?: PhaseRun;
}

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  content?: string;
  papers?: Array<{ title: string; authors: string; year: string }>;
  hypothesis?: string;
  needsApproval?: boolean;
  approvalSummary?: string;
  approvalRunId?: string;
  isThinking?: boolean;
  thinkingText?: string;
}

let msgId = 0;
const messages = ref<Msg[]>([]);
const isRunning = ref(false);
const chatScroll = ref<HTMLElement | null>(null);
const editorRef = ref<HTMLElement | null>(null);
const hasInput = ref(false);
const showModify = ref(false);
const showReject = ref(false);
const modifyText = ref('');
const rejectText = ref('');
const lastApprovalId = ref<string | null>(null);

const allPhaseRuns = ref<PhaseRun[]>([]);
const phasePapers = ref<Paper[]>([]);
const selectedPhaseState = ref<PhaseState | null>(null);
const phaseDetail = ref<PhaseRun | null>(null);
const phaseVersions = ref<Array<{ runId: string; version: number; status: string; createdAt: string }>>([]);

const { connect, disconnect, setHandlers } = useSSE();
const { setStatus } = useResearchStatus();

const displayMessages = computed(() => messages.value);

const phaseStates = computed<PhaseState[]>(() => {
  return phaseOrder.map((name, index) => {
    const runs = allPhaseRuns.value.filter((r) => r.phaseName === name);
    const latest = runs.sort((a, b) => b.phaseVersion - a.phaseVersion)[0];
    let status: PhaseState['status'] = 'pending';
    if (latest) {
      status = latest.status === 'COMPLETED' ? 'done'
        : latest.status === 'RUNNING' ? 'running'
        : latest.status === 'ERROR' ? 'error'
        : latest.status === 'WAITING_APPROVAL' ? 'running'
        : 'pending';
    }
    return { name, status, index, activeRun: latest };
  });
});

const currentPhaseName = computed(() => {
  const running = phaseStates.value.find((p) => p.status === 'running');
  return running ? running.name : null;
});

watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    if (chatScroll.value) {
      chatScroll.value.scrollTop = chatScroll.value.scrollHeight;
    }
  }
);

watch(currentPhaseName, (name) => {
  if (name && !selectedPhaseState.value?.name) {
    const ps = phaseStates.value.find((p) => p.name === name);
    if (ps) selectPhase(ps);
  }
});

function getPhaseLabel(name: string): string {
  const key = `phases.${name}`;
  const translated = t(key);
  return translated !== key ? translated : name;
}

function selectPhase(ps: PhaseState) {
  selectedPhaseState.value = ps;
  phaseDetail.value = ps.activeRun ?? null;
  loadPhaseVersions(ps.name);
}

function getTextInput(): string {
  return editorRef.value?.textContent?.trim() ?? '';
}

function clearInput() {
  if (editorRef.value) editorRef.value.textContent = '';
  hasInput.value = false;
}

async function loadPhases() {
  if (!projectId.value) return;
  try {
    const { data } = await client.get(`/api/projects/${projectId.value}/phases`);
    allPhaseRuns.value = Array.isArray(data) ? data : [];
  } catch {}
}

async function loadPhaseVersions(phaseName: string) {
  if (!projectId.value) return;
  try {
    const { data } = await client.get(`/api/projects/${projectId.value}/phases/${phaseName}/versions`);
    phaseVersions.value = Array.isArray(data) ? data : [];
  } catch {
    phaseVersions.value = [];
  }
}

async function loadPapers() {
  if (!projectId.value) return;
  try {
    const { data } = await client.get(`/api/projects/${projectId.value}/papers`);
    phasePapers.value = Array.isArray(data) ? data : [];
  } catch {
    phasePapers.value = [];
  }
}

function handleSSEMessage(event: string, data: Record<string, unknown>) {
  if (event === 'phase:start') {
    loadPhases();
  } else if (event === 'phase:complete') {
    loadPhases();
    loadPapers();
  } else if (event === 'phase:error') {
    loadPhases();
  } else if (event === 'thinking' || event === 'message') {
    const text = String(data.content ?? String(data));
    const last = messages.value[messages.value.length - 1];
    if (last?.isThinking) {
      last.thinkingText = text;
    } else {
      messages.value.push({
        id: msgId++,
        role: 'assistant',
        isThinking: true,
        thinkingText: text,
      });
    }
  } else if (event === 'search:result' || event === 'paper:found') {
    const last = messages.value[messages.value.length - 1];
    if (last?.papers) {
      last.papers.push({
        title: String(data.sourceTitle ?? data.title ?? ''),
        authors: String(data.authors ?? data.sourceAuthors ?? ''),
        year: String(data.year ?? data.sourceYear ?? ''),
      });
    } else {
      messages.value.push({
        id: msgId++,
        role: 'assistant',
        papers: [{
          title: String(data.sourceTitle ?? data.title ?? ''),
          authors: String(data.authors ?? data.sourceAuthors ?? ''),
          year: String(data.year ?? data.sourceYear ?? ''),
        }],
      });
    }
  } else if (event === 'hypothesis:proposed') {
    messages.value.push({
      id: msgId++,
      role: 'assistant',
      hypothesis: String(data.statement ?? ''),
    });
  } else if (event === 'phase:awaiting_approval') {
    lastApprovalId.value = String(data.runId ?? '');
    messages.value.push({
      id: msgId++,
      role: 'assistant',
      needsApproval: true,
      approvalSummary: String(data.summary ?? ''),
      approvalRunId: lastApprovalId.value,
    });
  } else if (event === 'run:complete') {
    messages.value.push({ id: msgId++, role: 'assistant', content: 'Research complete.' });
    isRunning.value = false;
    disconnect();
    setStatus('done');
    loadPhases();
    loadPapers();
  } else if (event === 'run:error') {
    messages.value.push({ id: msgId++, role: 'assistant', content: `Error: ${String(data.error ?? 'Unknown')}` });
    isRunning.value = false;
    disconnect();
    setStatus('error');
    loadPhases();
  }
}

function onSend() {
  const q = getTextInput();
  if (!q || isRunning.value) return;
  messages.value.push({ id: msgId++, role: 'user', content: q });
  clearInput();
  isRunning.value = true;
  setStatus('running');
  disconnect();
  setHandlers({ onMessage: (msg) => handleSSEMessage(msg.event, msg.data as Record<string, unknown>) });
  connect(`/api/research/stream?q=${encodeURIComponent(q)}`);
}

function onStop() {
  isRunning.value = false;
  disconnect();
  setStatus('error');
}

function submitApproval(decision: string, feedback: string = '') {
  if (!lastApprovalId.value || !projectId.value) return;
  client.post(`/api/projects/${projectId.value}/phases/${lastApprovalId.value}/decision`, { decision, feedback })
    .then(() => {
      showModify.value = false;
      showReject.value = false;
      modifyText.value = '';
      rejectText.value = '';
      loadPhases();
    }).catch(() => {});
}

onMounted(async () => {
  await Promise.all([loadPhases(), loadPapers()]);
  nextTick(() => editorRef.value?.focus());
});
</script>

<style scoped>
[data-component="research"] {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

[data-component="phase-bar"] {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 44px;
  min-height: 44px;
  background: var(--bg-layer-01);
  border-bottom: 0.5px solid var(--border-base);
  gap: 0;
  overflow-x: auto;
}

[data-component="phase-step"] {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  cursor: pointer;
  white-space: nowrap;
  position: relative;
  transition: background 0.15s;
  flex-shrink: 0;
}

[data-component="phase-step"]:hover {
  background: var(--bg-layer-02);
}

[data-component="phase-step"]:not(:last-child)::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 0.5px;
  height: 20px;
  background: var(--border-base);
}

[data-component="phase-step"] [data-slot="icon"] {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
  background: var(--bg-layer-02);
  color: var(--text-muted);
}

[data-component="phase-step"][data-status="running"] [data-slot="icon"] {
  background: var(--accent);
  color: #fff;
}

[data-component="phase-step"][data-status="done"] [data-slot="icon"] {
  background: var(--success);
  color: #fff;
}

[data-component="phase-step"][data-status="error"] [data-slot="icon"] {
  background: var(--danger);
  color: #fff;
}

[data-slot="spinner"] {
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

[data-component="phase-step"] [data-slot="label"] {
  font-size: 12px;
  color: var(--text-muted);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-component="phase-step"][data-status="running"] [data-slot="label"],
[data-component="phase-step"][data-status="done"] [data-slot="label"] {
  color: var(--text-strong);
}

[data-component="body"] {
  flex: 1;
  display: flex;
  overflow: hidden;
}

[data-component="chat-scroll"] {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  scroll-behavior: smooth;
  min-width: 0;
}

[data-component="welcome"] {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
}

[data-component="welcome"] [data-slot="title"] {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-muted);
}

[data-component="welcome"] [data-slot="desc"] {
  font-size: 13px;
  color: var(--text-faint);
}

[data-component="message"] {
  padding: 12px 48px;
  display: flex;
  gap: 12px;
  width: 100%;
}

[data-component="message"][data-role="user"] {
  justify-content: flex-end;
}

[data-slot="avatar"] {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  background: var(--bg-layer-03);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-top: 4px;
}

[data-slot="user-bubble"] {
  background: var(--bg-layer-02);
  border: 0.5px solid var(--border-base);
  border-radius: var(--radius-xl);
  padding: 8px 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-strong);
  max-width: min(82%, 64ch);
}

[data-slot="text"] {
  margin-top: 4px;
  line-height: 1.5;
  color: var(--text-strong);
  font-size: 14px;
}

[data-component="tool-card"] {
  margin-top: 8px;
  border: 0.5px solid var(--border-base);
  border-radius: var(--radius-md);
  overflow: hidden;
}

[data-component="tool-card"] [data-slot="header"] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-layer-01);
  border-bottom: 0.5px solid var(--border-base);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-base);
}

[data-component="tool-card"] [data-slot="output"] {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-strong);
  line-height: 1.5;
}

[data-slot="paper"] {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
}

[data-slot="paper"]:not(:last-child) { border-bottom: 0.5px solid var(--border-base); }
[data-slot="paper-title"] { font-size: 13px; color: var(--text-strong); }
[data-slot="paper-meta"] { font-size: 11px; color: var(--text-muted); }
[data-slot="paper-abstract"] { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
[data-slot="more"] { font-size: 12px; color: var(--accent); padding: 4px 0; }

[data-component="tool-card"] [data-slot="actions"] {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-top: 0.5px solid var(--border-base);
}

[data-slot="actions"] button {
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  font-weight: 500;
}

[data-slot="actions"] button.secondary {
  background: var(--bg-layer-03);
  color: var(--text-base);
}

[data-slot="modify"], [data-slot="reject"] {
  padding: 8px 12px;
  display: flex;
  gap: 6px;
  border-top: 0.5px solid var(--border-base);
}

[data-slot="modify"] textarea, [data-slot="reject"] textarea {
  flex: 1;
  padding: 6px 10px;
  background: var(--bg-base);
  border: 0.5px solid var(--border-base);
  border-radius: var(--radius-sm);
  color: var(--text-strong);
  font-size: 12px;
  resize: none;
  min-height: 40px;
  outline: none;
  font-family: inherit;
}

[data-slot="modify"] button, [data-slot="reject"] button {
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  align-self: flex-start;
}

[data-component="thinking"] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: var(--text-muted);
}

[data-component="thinking"] [data-slot="dots"] { display: flex; gap: 3px; }
[data-component="thinking"] [data-slot="dot"] {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: dotPulse 1.4s infinite;
}
[data-component="thinking"] [data-slot="dot"]:nth-child(2) { animation-delay: 0.2s; }
[data-component="thinking"] [data-slot="dot"]:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotPulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

[data-component="detail-panel"] {
  width: 360px;
  min-width: 360px;
  border-left: 0.5px solid var(--border-base);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-layer-01);
}

[data-slot="panel-header"] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 0.5px solid var(--border-base);
}

[data-slot="panel-header"] [data-slot="title"] {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}

[data-slot="panel-header"] [data-slot="close"] {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

[data-slot="panel-header"] [data-slot="close"]:hover {
  background: var(--bg-layer-02);
  color: var(--text-strong);
}

[data-slot="panel-body"] {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
}

[data-slot="status-badge"] {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

[data-slot="status-badge"].running { background: rgba(3,76,255,0.15); color: var(--accent); }
[data-slot="status-badge"].done, [data-slot="status-badge"].completed { background: rgba(18,201,5,0.15); color: var(--success); }
[data-slot="status-badge"].error { background: rgba(252,83,58,0.15); color: var(--danger); }
[data-slot="status-badge"].pending { background: var(--bg-layer-02); color: var(--text-muted); }

[data-slot="running-info"] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

[data-slot="running-info"] [data-slot="spinner"] {
  width: 12px;
  height: 12px;
  border: 2px solid var(--accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

[data-slot="section-title"] {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  margin-top: 16px;
}

[data-slot="section-title"]:first-child { margin-top: 0; }

[data-slot="output"] {
  background: var(--bg-base);
  border: 0.5px solid var(--border-base);
  border-radius: var(--radius-md);
  padding: 10px;
  font-size: 12px;
  font-family: var(--font-mono);
  line-height: 1.5;
  color: var(--text-base);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

[data-slot="tool-call"] {
  padding: 6px 0;
  border-bottom: 0.5px solid var(--border-base);
}

[data-slot="tool-call"]:last-child { border-bottom: none; }

[data-slot="tool-name"] {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-strong);
  margin-bottom: 4px;
}

[data-slot="tool-output"] {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

[data-slot="review-result"] {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
}

[data-slot="review-result"].passed { background: rgba(18,201,5,0.1); color: var(--success); }
[data-slot="review-result"].failed { background: rgba(252,83,58,0.1); color: var(--danger); }

[data-slot="issue"] {
  display: flex;
  gap: 6px;
  padding: 4px 0;
  font-size: 12px;
  align-items: baseline;
}

[data-slot="severity"] {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
}

[data-slot="severity"].high { background: rgba(252,83,58,0.15); color: var(--danger); }
[data-slot="severity"].medium { background: rgba(252,213,58,0.15); color: var(--warning); }
[data-slot="severity"].low { background: rgba(3,76,255,0.15); color: var(--accent); }

[data-slot="category"] { color: var(--text-muted); }
[data-slot="message"] { color: var(--text-base); flex: 1; }

[data-slot="version"] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

[data-slot="version-num"] {
  font-weight: 600;
  color: var(--text-strong);
}

[data-slot="version-status"] {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--bg-layer-02);
  color: var(--text-muted);
}

[data-slot="version-date"] {
  color: var(--text-faint);
  font-size: 11px;
}

[data-component="input-area"] {
  padding: 12px 24px 16px;
  background: var(--bg-base);
}

[data-component="status-bar"] {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

[data-component="status-bar"] [data-slot="dot"] {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

[data-component="prompt-input"] {
  display: flex;
  flex-direction: column;
  background: var(--bg-layer-01);
  border: 0.5px solid var(--border-base);
  border-radius: var(--radius-xl);
  min-height: 48px;
  transition: border-color 0.15s;
}

[data-component="prompt-input"]:focus-within {
  border-color: var(--border-strong);
}

[data-slot="editor"] {
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-strong);
  outline: none;
  min-height: 36px;
  max-height: 150px;
  overflow-y: auto;
  line-height: 1.5;
  word-break: break-word;
}

[data-slot="editor"]:empty::before {
  content: attr(placeholder);
  color: var(--text-faint);
  pointer-events: none;
}

[data-slot="editor"].disabled {
  color: var(--text-muted);
  pointer-events: none;
}

[data-component="prompt-input"] [data-slot="actions"] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 6px;
}

[data-slot="attach"] {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

[data-slot="attach"]:hover { color: var(--text-base); }

[data-slot="send"] {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

[data-slot="send"]:disabled { opacity: 0.3; cursor: not-allowed; }
[data-slot="send"]:not(:disabled):hover { background: var(--accent-hover); }

[data-slot="arrow"] {
  display: inline-block;
  width: 0;
  height: 0;
  border-left: 5px solid #fff;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
}

[data-slot="stop"] {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #fff;
  border-radius: 2px;
  cursor: pointer;
}
</style>
