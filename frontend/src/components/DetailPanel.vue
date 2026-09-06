<template>
  <div class="detail-panel">
    <div v-if="selectedPhase" class="phase-detail">
      <div class="detail-header">
        <h3>{{ t(`phases.${selectedPhase.phaseName}`) }}</h3>
        <span class="status-badge" :class="selectedPhase.status">
          {{ selectedPhase.status }}
        </span>
      </div>
      <div class="detail-body">
        <div class="output-section">
          <h4>{{ t('common.rawOutput') }}</h4>
          <pre>{{ selectedPhase.agentOutput }}</pre>
        </div>
        <div v-if="selectedPhase.selfReview" class="review-section">
          <h4>{{ t('common.selfReview') }}</h4>
          <div class="review-result">
            <span>{{ t('common.rounds') }}: {{ selectedPhase.selfReview.rounds }}</span>
          </div>
        </div>
      </div>
    </div>
    <ApprovalPanel v-if="showApproval" />
    <VersionCards v-if="showVersions" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PhaseRun } from '../api/types';
import ApprovalPanel from './ApprovalPanel.vue';
import VersionCards from './VersionCards.vue';

const { t } = useI18n();

defineProps<{
  selectedPhase: PhaseRun | null;
  showApproval: boolean;
  showVersions: boolean;
}>();
</script>

<style scoped>
.detail-panel {
  width: 360px;
  min-width: 360px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: #fff;
}

.phase-detail {
  padding: 12px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}

.status-badge.COMPLETED { background: #e1f3d8; color: #67c23a; }
.status-badge.RUNNING { background: #fdf6ec; color: #e6a23c; }
.status-badge.ERROR { background: #fef0f0; color: #f56c6c; }

.detail-body pre {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}

.review-section {
  margin-top: 12px;
}
</style>
