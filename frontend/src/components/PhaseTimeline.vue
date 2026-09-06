<template>
  <div class="phase-timeline">
    <div
      v-for="phase in phases"
      :key="phase.phaseName"
      class="phase-node"
      :class="phase.status"
    >
      <span class="phase-icon" />
      <span class="phase-label">{{ t(`phases.${phase.phaseName}`) }}</span>
      <span class="phase-version">v{{ phase.phaseVersion }}</span>
      <span class="phase-status-dot" :class="phase.status" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PhaseRun } from '../api/types';

const { t } = useI18n();

defineProps<{
  phases: PhaseRun[];
}>();
</script>

<style scoped>
.phase-timeline {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.phase-node {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-left: 3px solid #dcdfe6;
  position: relative;
}

.phase-node::after {
  content: '';
  position: absolute;
  left: -3px;
  top: 100%;
  width: 3px;
  height: 16px;
  background: #dcdfe6;
}

.phase-node:last-child::after {
  display: none;
}

.phase-node.RUNNING { border-left-color: #e6a23c; }
.phase-node.COMPLETED { border-left-color: #67c23a; }
.phase-node.WAITING_APPROVAL { border-left-color: #409eff; }
.phase-node.ERROR { border-left-color: #f56c6c; }

.phase-icon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #dcdfe6;
}

.phase-label {
  flex: 1;
  font-size: 14px;
}

.phase-version {
  font-size: 12px;
  color: #909399;
}

.phase-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.phase-status-dot.RUNNING { background: #e6a23c; }
.phase-status-dot.COMPLETED { background: #67c23a; }
.phase-status-dot.ERROR { background: #f56c6c; }
.phase-status-dot.WAITING_APPROVAL { background: #409eff; }
</style>
