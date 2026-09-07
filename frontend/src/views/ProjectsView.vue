<template>
  <div class="projects-view">
    <div class="projects-header">
      <h2>{{ t('nav.projects') }}</h2>
      <el-button type="primary" @click="showNewDialog = true">{{
        t('common.new')
      }}</el-button>
    </div>

    <el-dialog
      v-model="showNewDialog"
      :title="t('common.new')"
      width="400px"
    >
      <el-input
        v-model="newQuestion"
        :placeholder="t('common.enterQuestion')"
        @keyup.enter="handleCreate"
      />
      <template #footer>
        <el-button @click="showNewDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate">{{ t('common.new') }}</el-button>
      </template>
    </el-dialog>

    <div v-if="loading" class="loading">
      {{ t('common.loading') }}...
    </div>

    <div v-else class="projects-grid">
      <el-card
        v-for="project in projects"
        :key="project.id"
        class="project-card"
        shadow="hover"
      >
        <div class="card-body" @click="$router.push(`/research/${project.id}`)">
          <div class="card-title">{{ project.name }}</div>
          <div class="card-status" :class="getStatusClass(project.status)">
            {{ getStatusLabel(project.status) }}
          </div>
          <div class="card-date">{{ formatDate(project.createdAt) }}</div>
        </div>
        <div class="card-actions">
          <el-button size="small" @click="$router.push(`/research/${project.id}`)">
            {{ t('nav.research') }}
          </el-button>
          <el-button
            size="small"
            type="danger"
            @click="onDelete(project.id)"
          >
            {{ t('common.delete') }}
          </el-button>
        </div>
      </el-card>
    </div>

    <div v-if="!loading && projects.length === 0" class="empty-state">
      <p>{{ t('common.noProjects') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjects } from '../composables/useProjects';

const { t } = useI18n();
const { projects, loading, fetchProjects, createProject, deleteProject } = useProjects();
const showNewDialog = ref(false);
const newQuestion = ref('');

function getStatusClass(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'running',
    COMPLETED: 'done',
    ERROR: 'error',
    PENDING: 'ready',
  };
  return map[status] || 'ready';
}

function getStatusLabel(status: string): string {
  const cls = getStatusClass(status);
  return t(`status.${cls}`);
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

async function handleCreate() {
  if (!newQuestion.value.trim()) return;
  await createProject(newQuestion.value);
  newQuestion.value = '';
  showNewDialog.value = false;
}

async function onDelete(id: string) {
  await deleteProject(id);
}
</script>

<style scoped>
.projects-view {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.projects-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.project-card {
  cursor: default;
}

.card-body {
  cursor: pointer;
  padding: 4px 0;
}

.card-title {
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
  margin-bottom: 8px;
}

.card-status.ready { background: #e1f3d8; color: #67c23a; }
.card-status.running { background: #fdf6ec; color: #e6a23c; }
.card-status.done { background: #ecf5ff; color: #409eff; }
.card-status.error { background: #fef0f0; color: #f56c6c; }

.card-date {
  font-size: 12px;
  color: #909399;
  margin-bottom: 12px;
}

.card-actions {
  display: flex;
  gap: 8px;
  border-top: 1px solid #f0f0f0;
  padding-top: 8px;
  margin-top: 8px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #909399;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: #909399;
}
</style>
