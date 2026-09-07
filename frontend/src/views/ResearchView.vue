<template>
  <div class="research-view">
    <div class="main-content">
      <div class="center-panel">
        <PhaseTimeline
          :phases="phases"
          @select-phase="onSelectPhase"
        />
        <AgentLog :messages="logMessages" />
      </div>
      <InputBar
        v-if="!isRunning"
        :question="inputQuestion"
        @update:question="inputQuestion = $event"
        @send="onStartResearch"
        @stop="onStopResearch"
      />
    </div>
    <DetailPanel
      :selected-phase="selectedPhase"
      :show-approval="showApproval"
      :show-versions="showVersions"
      :show-papers="showPapers"
      :papers="papers"
      :approval-phase="approvalPhase"
      :approval-run-id="approvalRunId"
      :project-id="projectId"
      @close="closeDetailPanel"
      @approve="onApprove"
      @modify="onModify"
      @reject="onReject"
      @show-papers="showPapers = true; showVersions = false"
      @show-versions="showVersions = true; showPapers = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import PhaseTimeline from '../components/PhaseTimeline.vue';
import AgentLog from '../components/AgentLog.vue';
import DetailPanel from '../components/DetailPanel.vue';
import InputBar from '../components/InputBar.vue';
import { useSSE, type SSEMessage } from '../composables/useSSE';
import { useResearchStatus } from '../composables/useResearchStatus';
import client from '../api/client';
import type { PhaseRun, Paper } from '../api/types';

const route = useRoute();
const projectId = computed(() => route.params.projectId as string);

const phases = ref<PhaseRun[]>([]);
const logMessages = ref<Array<{ type: string; label: string; content: string; data?: unknown }>>([]);
const selectedPhase = ref<PhaseRun | null>(null);
const showApproval = ref(false);
const showVersions = ref(false);
const showPapers = ref(false);
const papers = ref<Paper[]>([]);
const isRunning = ref(false);
const inputQuestion = ref('');
const approvalPhase = ref('');
const approvalRunId = ref('');

const { connected, connect, disconnect, setHandlers } = useSSE();
const { setStatus } = useResearchStatus();

watch(connected, (val) => {
  if (!val && isRunning.value) {
    logMessages.value.push({
      type: 'error',
      label: 'Connection',
      content: 'SSE connection lost. Attempting reconnect...',
    });
  }
});

function loadPhases() {
  if (!projectId.value) return;
  client.get(`/projects/${projectId.value}/phases`)
    .then(({ data }) => {
      const phaseOrder = [
        'literature_search', 'gap_analysis', 'hypothesis',
        'experiment_design', 'experiment_execution',
        'evidence_evaluation', 'conclusion', 'report',
      ];
      phases.value = (Array.isArray(data) ? data : []).sort((a: PhaseRun, b: PhaseRun) => {
        const ia = phaseOrder.indexOf(a.phaseName);
        const ib = phaseOrder.indexOf(b.phaseName);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      const activePhase = phases.value.find((p) => p.status === 'WAITING_APPROVAL');
      if (activePhase) {
        selectPhase(activePhase);
        showApproval.value = true;
        showVersions.value = false;
        showPapers.value = false;
      }
    })
    .catch(() => { phases.value = []; });
}

function loadPapers() {
  if (!projectId.value) return;
  client.get(`/projects/${projectId.value}/papers`)
    .then(({ data }) => { papers.value = Array.isArray(data) ? data : []; })
    .catch(() => { papers.value = []; });
}

function selectPhase(phase: PhaseRun) {
  selectedPhase.value = phase;
  showVersions.value = false;
  showPapers.value = false;
  if (phase.status === 'WAITING_APPROVAL') {
    showApproval.value = true;
    approvalPhase.value = phase.phaseName;
    approvalRunId.value = phase.phaseRunId;
  } else {
    showApproval.value = false;
  }
}

function onSelectPhase(phase: PhaseRun) {
  selectPhase(phase);
}

function closeDetailPanel() {
  selectedPhase.value = null;
  showApproval.value = false;
  showVersions.value = false;
  showPapers.value = false;
}

function handleSSEMessage(msg: SSEMessage) {
  const data = msg.data as Record<string, unknown>;
  const evt = msg.event;

  if (evt === 'run:start') {
    setStatus('running');
    logMessages.value.push({
      type: 'phase:start',
      label: 'Research',
      content: `研究开始: ${String(data.question ?? 'Unknown')}`,
    });
  } else if (evt === 'phase:start') {
    logMessages.value.push({
      type: 'phase:start',
      label: `Phase: ${String(data.phaseName ?? 'Unknown')}`,
      content: `开始阶段: ${String(data.phaseName ?? 'Unknown')}`,
    });
    loadPhases();
  } else if (evt === 'phase:complete') {
    logMessages.value.push({
      type: 'phase:complete',
      label: `Phase: ${String(data.phaseName ?? 'Unknown')}`,
      content: `阶段完成: ${String(data.phaseName ?? 'Unknown')}`,
    });
    loadPhases();
    loadPapers();
  } else if (evt === 'phase:error') {
    logMessages.value.push({
      type: 'error',
      label: `Phase: ${String(data.phaseName ?? 'Unknown')}`,
      content: `阶段错误: ${String(data.phaseName ?? 'Unknown')} - ${String(data.error ?? 'Unknown error')}`,
    });
    loadPhases();
  } else if (evt === 'thinking' || evt === 'message') {
    logMessages.value.push({
      type: 'thinking',
      label: 'Agent',
      content: String(data.content ?? String(data)),
    });
  } else if (evt === 'tool:calling') {
    logMessages.value.push({
      type: 'tool:calling',
      label: `Tool: ${String(data.toolName ?? 'Unknown')}`,
      content: JSON.stringify(data.input ?? {}, null, 2),
      data,
    });
  } else if (evt === 'tool:result') {
    logMessages.value.push({
      type: 'tool:result',
      label: `Tool: ${String(data.toolName ?? 'Unknown')}`,
      content: String(data.output ?? 'No output'),
      data,
    });
  } else if (evt === 'self:review') {
    logMessages.value.push({
      type: 'self:review',
      label: 'Self-Review',
      content: String(data.issues ? `Issues: ${data.issues}` : 'Review complete'),
      data,
    });
  } else if (evt === 'phase:awaiting_approval') {
    logMessages.value.push({
      type: 'phase:start',
      label: 'Approval',
      content: `等待审批: ${String(data.phaseName ?? 'Unknown')}`,
    });
    loadPhases();
    approvalPhase.value = String(data.phaseName ?? '');
    approvalRunId.value = String(data.runId ?? '');
    showApproval.value = true;
  } else if (evt === 'phase:approved') {
    logMessages.value.push({
      type: 'phase:complete',
      label: 'Approval',
      content: `已批准: ${String(data.phaseName ?? 'Unknown')}`,
    });
    showApproval.value = false;
    loadPhases();
  } else if (evt === 'phase:modified') {
    logMessages.value.push({
      type: 'message',
      label: 'Approval',
      content: `已提交修改: ${String(data.phaseName ?? 'Unknown')}`,
    });
    showApproval.value = false;
    loadPhases();
  } else if (evt === 'phase:rejected') {
    logMessages.value.push({
      type: 'error',
      label: 'Approval',
      content: `已拒绝: ${String(data.phaseName ?? 'Unknown')}`,
    });
    showApproval.value = false;
    loadPhases();
  } else if (evt === 'run:complete') {
    setStatus('done');
    logMessages.value.push({
      type: 'phase:complete',
      label: 'Research',
      content: '研究完成!',
    });
    isRunning.value = false;
    disconnect();
    loadPhases();
    loadPapers();
  } else if (evt === 'run:error') {
    setStatus('error');
    logMessages.value.push({
      type: 'error',
      label: 'Research',
      content: `研究错误: ${String(data.error ?? 'Unknown error')}`,
    });
    isRunning.value = false;
    disconnect();
  } else if (evt === 'search:result' || evt === 'paper:found') {
    logMessages.value.push({
      type: 'message',
      label: 'Paper',
      content: String(data.sourceTitle ?? data.title ?? 'Paper found'),
      data,
    });
  } else {
    logMessages.value.push({
      type: 'message',
      label: evt,
      content: typeof data === 'string' ? data : JSON.stringify(data, null, 2).substring(0, 500),
    });
  }
}

function onStartResearch(question: string) {
  if (!question.trim()) return;
  isRunning.value = true;
  setStatus('running');
  logMessages.value = [];
  disconnect();

  setHandlers({
    onMessage: handleSSEMessage,
    onConnect: () => {
      logMessages.value.push({
        type: 'message',
        label: 'Connection',
        content: 'SSE connected',
      });
    },
    onDisconnect: () => {
      logMessages.value.push({
        type: 'error',
        label: 'Connection',
        content: 'SSE disconnected',
      });
    },
  });

  client.post('/research/stream', { question, mode: 'manual' })
    .then(() => {
      logMessages.value.push({
        type: 'message',
        label: 'Research',
        content: `POST /research/stream initiated with question: ${question}`,
      });
    })
    .catch((err) => {
      logMessages.value.push({
        type: 'error',
        label: 'Research',
        content: `Failed to start: ${String(err)}`,
      });
      isRunning.value = false;
    });

  const sseUrl = `/api/research/stream?q=${encodeURIComponent(question)}`;
  connect(sseUrl);
}

function onStopResearch() {
  isRunning.value = false;
  disconnect();
  logMessages.value.push({
    type: 'message',
    label: 'Research',
    content: 'Research stopped by user',
  });
}

function onApprove() {
  submitDecision('approve', '');
}

function onModify(feedback: string) {
  submitDecision('modify', feedback);
}

function onReject(reason: string) {
  submitDecision('reject', reason);
}

function submitDecision(decision: string, feedback: string) {
  if (!projectId.value || !approvalRunId.value) return;
  client.post(`/projects/${projectId.value}/phases/${approvalRunId.value}/decision`, {
    decision,
    feedback,
  })
    .then(() => {
      showApproval.value = false;
      loadPhases();
    })
    .catch((err) => {
      logMessages.value.push({
        type: 'error',
        label: 'Approval',
        content: `Decision failed: ${String(err)}`,
      });
    });
}

onMounted(() => {
  loadPhases();
  loadPapers();
});
</script>

<style scoped>
.research-view {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.center-panel {
  display: flex;
  flex: 1;
  overflow: hidden;
}
</style>
