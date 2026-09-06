<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <span>{{ t('common.projects') }}</span>
      <el-button size="small" @click="$router.push('/projects')">{{
        t('common.new')
      }}</el-button>
    </div>
    <div class="project-list">
      <div
        v-for="project in projects"
        :key="project.id"
        class="project-item"
        :class="{ active: project.id === activeId }"
        @click="selectProject(project.id)"
      >
        <span class="project-name">{{ project.name }}</span>
        <el-button
          text
          size="small"
          class="delete-btn"
          @click.stop="onDelete(project.id)"
        >
          ×
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useProjects } from '../composables/useProjects';

const { t } = useI18n();
const { projects, deleteProject } = useProjects();

const activeId = '';

function selectProject(id: string) {
  window.location.hash = `/research/${id}`;
}

function onDelete(id: string) {
  deleteProject(id);
}
</script>

<style scoped>
.sidebar {
  width: 240px;
  min-width: 240px;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #e4e7ed;
}

.project-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.project-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 4px;
}

.project-item:hover {
  background: #ecf5ff;
}

.project-item.active {
  background: #d9ecff;
}

.project-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.delete-btn {
  color: #909399;
}

.delete-btn:hover {
  color: #f56c6c;
}
</style>
