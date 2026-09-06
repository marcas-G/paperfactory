<template>
  <div class="version-cards">
    <div v-for="ver in versions" :key="ver.runId" class="version-card">
      <div class="card-header">
        <span class="version-num">v{{ ver.version }}</span>
        <span class="version-status" :class="ver.status">{{ ver.status }}</span>
      </div>
      <div class="card-summary">{{ ver.summary }}</div>
      <div class="card-time">{{ ver.createdAt }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { VersionCompare } from '../api/types';

defineProps<{
  versions: VersionCompare['versions'];
}>();
</script>

<style scoped>
.version-cards {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-card {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
}

.version-card:hover {
  border-color: #409eff;
}

.card-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.version-num {
  font-weight: bold;
}

.version-status {
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 3px;
}

.version-status.COMPLETED { background: #e1f3d8; color: #67c23a; }
.version-status.ERROR { background: #fef0f0; color: #f56c6c; }

.card-summary {
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
}

.card-time {
  font-size: 11px;
  color: #909399;
}
</style>
