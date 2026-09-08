<template>
  <div class="evidence-chain">
    <div v-if="chains.length === 0" class="empty">
      {{ t('common.noEvidence') }}
    </div>
    <div v-for="(chain, index) in chains" :key="index" class="chain-item">
      <div class="chain-header">
        <span class="chain-title">{{ chain.title || `证据 #${index + 1}` }}</span>
        <span class="chain-relation">{{ chain.relation }}</span>
      </div>
      <div class="chain-links">
        <div v-for="up in chain.upstream" :key="up.targetId" class="link upstream">
          ← {{ up.targetType }}: {{ up.targetId }}
        </div>
        <div class="chain-content">{{ chain.content }}</div>
        <div v-for="down in chain.downstream" :key="down.sourceId" class="link downstream">
          → {{ down.sourceType }}: {{ down.sourceId }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  chains: Array<{
    title?: string;
    content: string;
    relation: string;
    upstream: Array<{ targetType: string; targetId: string; relation: string }>;
    downstream: Array<{ sourceType: string; sourceId: string; relation: string }>;
  }>;
}>();
</script>

<style scoped>
.evidence-chain {
  padding: 8px;
}
.empty {
  color: #909399;
  font-size: 14px;
  text-align: center;
  padding: 20px;
}
.chain-item {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  margin-bottom: 8px;
  padding: 8px;
}
.chain-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.chain-title {
  font-weight: 600;
  font-size: 14px;
}
.chain-relation {
  color: #909399;
  font-size: 12px;
}
.chain-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.chain-content {
  font-size: 13px;
  color: #606266;
  padding: 4px 0;
}
.link {
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 2px;
}
.link.upstream {
  background: #ecf5ff;
  color: #409eff;
}
.link.downstream {
  background: #f0f9eb;
  color: #67c23a;
}
</style>
