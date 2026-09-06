<template>
  <div class="agent-log">
    <div class="log-header">{{ t('common.agentLog') }}</div>
    <div class="log-messages" ref="logContainer">
      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="log-message"
        :class="msg.type"
      >
        <span class="msg-label">{{ msg.label }}</span>
        <div class="msg-content">{{ msg.content }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const logContainer = ref<HTMLElement | null>(null);

interface LogMessage {
  type: string;
  label: string;
  content: string;
}

defineProps<{
  messages: LogMessage[];
}>();
</script>

<style scoped>
.agent-log {
  display: flex;
  flex-direction: column;
  flex: 1;
  border-right: 1px solid #e4e7ed;
  overflow: hidden;
}

.log-header {
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
  font-weight: bold;
  font-size: 14px;
}

.log-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.log-message {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #f5f7fa;
}

.msg-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
  display: block;
}

.msg-content {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
