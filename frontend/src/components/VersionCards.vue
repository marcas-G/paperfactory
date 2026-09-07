<template>
  <div class="version-cards">
    <div v-if="loading" class="loading">{{ t('common.loading') }}...</div>

    <div v-else-if="versions.length === 0" class="empty-versions">
      No versions available.
    </div>

    <div v-else>
      <div
        v-for="ver in versions"
        :key="ver.runId"
        class="version-card"
        :class="{ active: ver.active }"
        @click="$emit('select', ver)"
      >
        <div class="card-header">
          <span class="version-num">v{{ ver.version }}</span>
          <div class="header-right">
            <el-tag
              v-if="ver.active"
              size="small"
              type="success"
              effect="plain"
            >
              Active
            </el-tag>
            <span class="version-status" :class="ver.status.toLowerCase()">
              {{ ver.status }}
            </span>
          </div>
        </div>

        <div class="card-summary" v-if="ver.summary">
          {{ ver.summary.substring(0, 120) }}{{ ver.summary.length > 120 ? '...' : '' }}
        </div>

        <div class="card-time">{{ formatDate(ver.createdAt) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import client from '../api/client';

const { t } = useI18n();

const props = defineProps<{
  versions?: Array<{
    runId: string;
    version: number;
    summary: string;
    status: string;
    active: boolean;
    output?: string;
    toolCalls?: Array<{ toolName: string; input: object; output: string }>;
    selfReview?: { passed: boolean; rounds: number; issues: Array<{ severity: string; category: string; message: string }> } | null;
    createdAt: string;
  }>;
  projectId?: string;
  phaseName?: string;
}>();

defineEmits<{
  select: [version: unknown];
}>();

const loading = ref(false);
const versions = ref<typeof props.versions>(props.versions ?? []);

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(dateStr);
  }
}

async function loadVersions() {
  if (!props.projectId || !props.phaseName) return;
  loading.value = true;
  try {
    const { data } = await client.get(
      `/projects/${props.projectId}/phases/${props.phaseName}/compare`
    );
    if (data && data.versions) {
      versions.value = data.versions;
    }
  } catch {
    versions.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (!props.versions && props.projectId && props.phaseName) {
    loadVersions();
  }
});
</script>

<style scoped>
.version-cards {
  padding: 8px 0;
}

.loading {
  text-align: center;
  padding: 20px;
  color: #909399;
  font-size: 13px;
}

.empty-versions {
  text-align: center;
  padding: 20px;
  color: #c0c4cc;
  font-size: 13px;
}

.version-card {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 8px;
}

.version-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.version-card.active {
  border-color: #67c23a;
  background: #f0f9eb;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.version-num {
  font-weight: 700;
  font-size: 14px;
  color: #303133;
}

.version-status {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
}

.version-status.completed { background: #e1f3d8; color: #67c23a; }
.version-status.running { background: #fdf6ec; color: #e6a23c; }
.version-status.error { background: #fef0f0; color: #f56c6c; }
.version-status.waiting_approval { background: #fdf6ec; color: #e6a23c; }
.version-status.rejected { background: #fef0f0; color: #f56c6c; }

.card-summary {
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
  line-height: 1.4;
}

.card-time {
  font-size: 11px;
  color: #909399;
}
</style>
