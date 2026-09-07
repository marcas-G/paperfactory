<template>
  <div class="phase-timeline">
    <div class="timeline-header">Research Pipeline</div>
    <div class="timeline-body">
      <div
        v-for="phase in orderedPhases"
        :key="phase.phaseName"
        class="phase-node"
        :class="phase.status.toLowerCase()"
        @click="onSelectPhase(phase)"
      >
        <span class="phase-icon" :class="phase.status.toLowerCase()" />
        <div class="phase-info">
          <span class="phase-label">{{ getPhaseLabel(phase.phaseName) }}</span>
          <span class="phase-version">v{{ phase.phaseVersion }}</span>
        </div>
        <el-tag
          v-if="phase.status === 'WAITING_APPROVAL'"
          size="small"
          type="warning"
          effect="plain"
        >
          Review
        </el-tag>
        <el-tag
          v-else-if="phase.status === 'RUNNING'"
          size="small"
          type=""
          effect="plain"
        >
          <span class="pulse-dot" /> Active
        </el-tag>
        <span class="phase-status-dot" :class="phase.status.toLowerCase()" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PhaseRun } from '../api/types';

const { t } = useI18n();

const props = defineProps<{
  phases: PhaseRun[];
}>();

const emit = defineEmits<{
  'select-phase': [phase: PhaseRun];
}>();

const phaseOrder = [
  'literature_search',
  'gap_analysis',
  'hypothesis',
  'experiment_design',
  'experiment_execution',
  'evidence_evaluation',
  'conclusion',
  'report',
];

const orderedPhases = computed(() => {
  return [...props.phases].sort((a, b) => {
    const ia = phaseOrder.indexOf(a.phaseName);
    const ib = phaseOrder.indexOf(b.phaseName);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
});

function getPhaseLabel(phaseName: string): string {
  const key = `phases.${phaseName}`;
  const translated = t(key);
  return translated !== key ? translated : phaseName;
}

function onSelectPhase(phase: PhaseRun) {
  emit('select-phase', phase);
}
</script>

<style scoped>
.phase-timeline {
  width: 220px;
  min-width: 220px;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  background: #fefefe;
  overflow: hidden;
}

.timeline-header {
  padding: 12px 16px;
  font-weight: 600;
  font-size: 13px;
  color: #606266;
  border-bottom: 1px solid #e4e7ed;
}

.timeline-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.phase-node {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-left: 3px solid #dcdfe6;
  position: relative;
  cursor: pointer;
  transition: background 0.15s;
}

.phase-node:hover {
  background: #f5f7fa;
}

.phase-node::after {
  content: '';
  position: absolute;
  left: -3px;
  top: 100%;
  width: 3px;
  height: 12px;
  background: #dcdfe6;
}

.phase-node:last-child::after {
  display: none;
}

.phase-node.running { border-left-color: #9b59b6; background: #faf5ff; }
.phase-node.completed { border-left-color: #67c23a; }
.phase-node.waiting_approval { border-left-color: #e6a23c; background: #fdf6ec; }
.phase-node.error { border-left-color: #f56c6c; background: #fef0f0; }
.phase-node.pending { border-left-color: #dcdfe6; }

.phase-node.running::after { background: #9b59b6; }
.phase-node.completed::after { background: #67c23a; }
.phase-node.waiting_approval::after { background: #e6a23c; }
.phase-node.error::after { background: #f56c6c; }

.phase-icon {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #dcdfe6;
  flex-shrink: 0;
}

.phase-icon.running { background: #9b59b6; }
.phase-icon.completed { background: #67c23a; }
.phase-icon.waiting_approval { background: #e6a23c; }
.phase-icon.error { background: #f56c6c; }

.phase-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.phase-label {
  font-size: 13px;
  line-height: 1.3;
}

.phase-version {
  font-size: 11px;
  color: #909399;
}

.phase-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.phase-status-dot.running { background: #9b59b6; }
.phase-status-dot.completed { background: #67c23a; }
.phase-status-dot.error { background: #f56c6c; }
.phase-status-dot.waiting_approval { background: #e6a23c; }
.phase-status-dot.pending { background: #dcdfe6; }

.pulse-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #9b59b6;
  margin-right: 4px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
