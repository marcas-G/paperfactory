<template>
  <div class="paper-library">
    <div class="library-header">{{ t('common.papers') }}</div>
    <div class="paper-list">
      <div v-for="paper in papers" :key="paper.citationId" class="paper-item">
        <div class="paper-title">{{ paper.sourceTitle }}</div>
        <div class="paper-meta">
          {{ paper.sourceAuthors.join(', ') }} ({{ paper.sourceYear }})
        </div>
        <div class="paper-stats">
          <span>📊 {{ paper.citationCount }}</span>
          <span>🎯 {{ paper.relevanceScore.toFixed(2) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { Paper } from '../api/types';

const { t } = useI18n();

defineProps<{
  papers: Paper[];
}>();
</script>

<style scoped>
.paper-library {
  padding: 12px;
}

.library-header {
  font-weight: bold;
  margin-bottom: 8px;
}

.paper-item {
  padding: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.paper-title {
  font-size: 14px;
  font-weight: 500;
}

.paper-meta {
  font-size: 12px;
  color: #909399;
}

.paper-stats {
  font-size: 12px;
  color: #606266;
  margin-top: 4px;
}
</style>
