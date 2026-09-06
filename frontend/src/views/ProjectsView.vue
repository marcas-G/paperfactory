<template>
  <div class="projects-view">
    <div class="projects-header">
      <h2>{{ t('nav.projects') }}</h2>
      <el-button type="primary" @click="showNewDialog = true">{{
        t('common.new')
      }}</el-button>
    </div>
    <div class="projects-grid">
      <div v-for="project in projects" :key="project.id" class="project-card">
        <div class="card-title">{{ project.name }}</div>
        <div class="card-status" :class="project.status">
          {{ t(`status.${project.status}`) }}
        </div>
        <div class="card-date">{{ project.createdAt }}</div>
        <div class="card-actions">
          <el-button size="small" @click="$router.push(`/research/${project.id}`)">
            {{ t('nav.research') }}
          </el-button>
          <el-button size="small" type="danger" @click="onDelete(project.id)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjects } from '../composables/useProjects';

const { t } = useI18n();
const { projects, deleteProject } = useProjects();
const showNewDialog = ref(false);

function onDelete(id: string) {
  deleteProject(id);
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
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
}

.card-title {
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 8px;
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
}
</style>
