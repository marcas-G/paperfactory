<template>
  <div class="agent-log">
    <div class="log-header">
      <span>{{ t('common.agentLog') }}</span>
      <el-input
        v-if="messages.length > 5"
        v-model="searchQuery"
        size="small"
        :placeholder="t('common.filter')"
        style="width: 160px; margin-left: auto"
        clearable
      />
    </div>
    <div class="log-messages" ref="logContainer">
      <div
        v-for="(msg, i) in filteredMessages"
        :key="i"
        class="log-message"
        :class="msg.type"
      >
        <div class="msg-header">
          <span class="msg-label">{{ msg.label }}</span>
          <span v-if="msg.type === 'error'" class="msg-error-icon">⚠</span>
        </div>

        <template v-if="msg.type === 'tool:calling' || msg.type === 'tool:result'">
          <el-collapse class="tool-collapse">
            <el-collapse-item :name="'tool-' + i">
              <template #title>
                <span class="tool-title">
                  {{ msg.type === 'tool:calling' ? '→' : '←' }} {{ msg.label }}
                </span>
              </template>
              <pre class="tool-content">{{ msg.content }}</pre>
            </el-collapse-item>
          </el-collapse>
        </template>
        <template v-else-if="msg.type === 'phase:start'">
          <div class="msg-content phase-start">{{ msg.content }}</div>
        </template>
        <template v-else-if="msg.type === 'phase:complete'">
          <div class="msg-content phase-complete">{{ msg.content }}</div>
        </template>
        <template v-else-if="msg.type === 'self:review'">
          <div class="msg-content self-review">
            <strong>Self-Review:</strong> {{ msg.content }}
          </div>
        </template>
        <template v-else-if="msg.type === 'thinking'">
          <div class="msg-content thinking">{{ msg.content }}</div>
        </template>
        <template v-else-if="msg.type === 'error'">
          <div class="msg-content error">{{ msg.content }}</div>
        </template>
        <template v-else>
          <div class="msg-content">{{ msg.content }}</div>
        </template>
      </div>

      <div v-if="filteredMessages.length === 0" class="empty-log">
        {{ t('common.noMessages') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const logContainer = ref<HTMLElement | null>(null);
const searchQuery = ref('');

interface LogMessage {
  type: string;
  label: string;
  content: string;
  data?: unknown;
}

const props = defineProps<{
  messages: LogMessage[];
}>();

const filteredMessages = computed(() => {
  if (!searchQuery.value.trim()) return props.messages;
  const q = searchQuery.value.toLowerCase();
  return props.messages.filter(
    (m) =>
      m.content.toLowerCase().includes(q) ||
      m.label.toLowerCase().includes(q) ||
      m.type.toLowerCase().includes(q)
  );
});

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  }
);
</script>

<style scoped>
.agent-log {
  display: flex;
  flex-direction: column;
  flex: 1;
  border-right: 1px solid #e4e7ed;
  overflow: hidden;
  background: #fff;
}

.log-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
  font-weight: 600;
  font-size: 14px;
  background: #fafafa;
}

.log-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  scroll-behavior: smooth;
}

.log-message {
  margin-bottom: 8px;
  border-radius: 6px;
  overflow: hidden;
}

.log-message.thinking {
  background: #f0f5ff;
  border-left: 3px solid #409eff;
}

.log-message.tool\\:calling {
  background: #f6ffed;
  border-left: 3px solid #67c23a;
}

.log-message.tool\\:result {
  background: #fff7e6;
  border-left: 3px solid #faad14;
}

.log-message.phase\\:start {
  background: #f9f0ff;
  border-left: 3px solid #9b59b6;
}

.log-message.phase\\:complete {
  background: #e1f3d8;
  border-left: 3px solid #67c23a;
}

.log-message.self\\:review {
  background: #e6f7ff;
  border-left: 3px solid #1890ff;
}

.log-message.error {
  background: #fef0f0;
  border-left: 3px solid #f56c6c;
}

.log-message.message {
  background: #f5f7fa;
  border-left: 3px solid #909399;
}

.msg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 0;
}

.msg-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #909399;
  letter-spacing: 0.5px;
}

.msg-error-icon {
  font-size: 14px;
}

.msg-content {
  padding: 4px 10px 8px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.phase-start .msg-content {
  color: #9b59b6;
  font-weight: 500;
}

.phase-complete .msg-content {
  color: #67c23a;
  font-weight: 500;
}

.self-review .msg-content {
  color: #1890ff;
}

.thinking .msg-content {
  color: #409eff;
  font-style: italic;
}

.error .msg-content {
  color: #f56c6c;
}

.tool-collapse {
  --el-collapse-border-color: transparent;
}

.tool-collapse :deep(.el-collapse-item__header) {
  padding: 0;
  height: 28px;
  line-height: 28px;
  font-size: 12px;
  border: none;
}

.tool-title {
  font-size: 12px;
  font-weight: 500;
}

.tool-content {
  background: #fafafa;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Courier New', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}

.empty-log {
  text-align: center;
  padding: 40px 20px;
  color: #c0c4cc;
  font-size: 13px;
}
</style>
