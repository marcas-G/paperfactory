<template>
  <div class="approval-panel">
    <div class="approval-header">
      <el-icon><Bell /></el-icon>
      <span>{{ t('common.approval') }}: {{ getPhaseLabel(phaseName) }}</span>
    </div>

    <div class="approval-content">
      <el-collapse>
        <el-collapse-item name="summary">
          <template #title>
            <span class="collapse-title">{{ t('common.summary') }}</span>
          </template>
          <div class="summary-body">
            <pre class="summary-text">{{ summary || 'No summary available' }}</pre>
          </div>
        </el-collapse-item>

        <el-collapse-item
          v-if="selfReview && selfReview.issues && selfReview.issues.length > 0"
          name="review"
        >
          <template #title>
            <span class="collapse-title">
              {{ t('common.selfReview') }}
              <el-tag size="small" :type="selfReview.passed ? 'success' : 'danger'">
                {{ selfReview.passed ? 'Passed' : `${selfReview.issues.length} issues` }}
              </el-tag>
            </span>
          </template>
          <div class="review-body">
            <div class="review-meta">
              <span>Rounds: {{ selfReview.rounds }}</span>
            </div>
            <div
              v-for="(issue, idx) in selfReview.issues"
              :key="idx"
              class="issue-row"
            >
              <el-tag size="small" :type="issue.severity === 'critical' ? 'danger' : 'warning'">
                {{ issue.severity }}
              </el-tag>
              <span class="issue-cat">{{ issue.category }}</span>
              <span class="issue-msg">{{ issue.message }}</span>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <div class="structured-summary" v-if="structuredItems.length > 0">
        <h4>Structured Output</h4>
        <div v-for="(item, idx) in structuredItems" :key="idx" class="struct-item">
          <span class="struct-bullet">{{ idx + 1 }}.</span>
          <span class="struct-text">{{ item }}</span>
        </div>
      </div>
    </div>

    <div class="approval-actions">
      <el-button type="success" @click="onApprove">
        {{ t('btn.approve') }}
      </el-button>

      <el-popover
        placement="top"
        width="360"
        trigger="click"
        v-model:visible="modifyVisible"
      >
        <template #reference>
          <el-button type="warning">{{ t('btn.modify') }}</el-button>
        </template>
        <el-input
          v-model="modifyFeedback"
          type="textarea"
          :rows="4"
          placeholder="Describe what to modify..."
        />
        <div style="margin-top: 8px; display: flex; justify-content: flex-end; gap: 8px;">
          <el-button size="small" @click="modifyVisible = false">Cancel</el-button>
          <el-button size="small" type="primary" @click="submitModify">
            {{ t('btn.modify') }}
          </el-button>
        </div>
      </el-popover>

      <el-popover
        placement="top"
        width="360"
        trigger="click"
        v-model:visible="rejectVisible"
      >
        <template #reference>
          <el-button type="danger">{{ t('btn.reject') }}</el-button>
        </template>
        <el-input
          v-model="rejectReason"
          type="textarea"
          :rows="4"
          placeholder="Reason for rejection..."
        />
        <div style="margin-top: 8px; display: flex; justify-content: flex-end; gap: 8px;">
          <el-button size="small" @click="rejectVisible = false">Cancel</el-button>
          <el-button size="small" type="danger" @click="submitReject">
            {{ t('btn.reject') }}
          </el-button>
        </div>
      </el-popover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SelfReview } from '../api/types';

const { t } = useI18n();

const props = defineProps<{
  phaseName: string;
  summary?: string;
  selfReview?: SelfReview | null;
}>();

const emit = defineEmits<{
  approve: [];
  modify: [feedback: string];
  reject: [reason: string];
}>();

const modifyVisible = ref(false);
const modifyFeedback = ref('');
const rejectVisible = ref(false);
const rejectReason = ref('');

function getPhaseLabel(phaseName: string): string {
  const key = `phases.${phaseName}`;
  const translated = t(key);
  return translated !== key ? translated : phaseName;
}

const structuredItems = computed(() => {
  if (!props.summary) return [];
  const lines = props.summary
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        (l.startsWith('-') || l.startsWith('*') || /^\d+\./.test(l))
    )
    .map((l) => l.replace(/^[-*]\s*|\d+\.\s*/, ''));
  return lines.slice(0, 20);
});

function onApprove() {
  emit('approve');
}

function submitModify() {
  if (modifyFeedback.value.trim()) {
    emit('modify', modifyFeedback.value);
    modifyVisible.value = false;
    modifyFeedback.value = '';
  }
}

function submitReject() {
  if (rejectReason.value.trim()) {
    emit('reject', rejectReason.value);
    rejectVisible.value = false;
    rejectReason.value = '';
  }
}
</script>

<style scoped>
.approval-panel {
  padding: 12px;
  border-top: 2px solid #e6a23c;
  background: #fffdf5;
}

.approval-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 12px;
  color: #e6a23c;
}

.collapse-title {
  font-weight: 500;
  font-size: 13px;
}

.summary-body {
  padding: 8px 0;
}

.summary-text {
  background: #f5f7fa;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
}

.review-body {
  padding: 8px 0;
}

.review-meta {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.issue-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
}

.issue-cat {
  font-weight: 500;
  color: #606266;
  min-width: 80px;
}

.issue-msg {
  flex: 1;
  color: #909399;
}

.structured-summary {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e4e7ed;
}

.structured-summary h4 {
  font-size: 13px;
  margin-bottom: 8px;
  color: #606266;
}

.struct-item {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}

.struct-bullet {
  color: #909399;
  font-weight: 500;
}

.struct-text {
  flex: 1;
}

.approval-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e4e7ed;
}
</style>
