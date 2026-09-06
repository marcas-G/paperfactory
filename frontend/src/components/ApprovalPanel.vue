<template>
  <div class="approval-panel">
    <div class="approval-header">{{ t('common.approval') }}</div>
    <div class="approval-content">
      <div class="summary">{{ t('common.summary') }}</div>
    </div>
    <div class="approval-actions">
      <el-button type="success" @click="onApprove">{{
        t('btn.approve')
      }}</el-button>
      <el-button type="warning" @click="onModify">{{ t('btn.modify') }}</el-button>
      <el-button type="danger" @click="onReject">{{ t('btn.reject') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const emit = defineEmits<{
  approve: [];
  modify: [feedback: string];
  reject: [reason: string];
}>();

function onApprove() {
  emit('approve');
}

function onModify() {
  emit('modify', '');
}

function onReject() {
  emit('reject', '');
}
</script>

<style scoped>
.approval-panel {
  padding: 12px;
  border-top: 1px solid #e4e7ed;
}

.approval-header {
  font-weight: bold;
  margin-bottom: 8px;
}

.approval-content {
  margin-bottom: 12px;
}

.approval-actions {
  display: flex;
  gap: 8px;
}
</style>
