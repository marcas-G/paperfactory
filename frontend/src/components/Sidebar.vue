<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <span>{{ t('common.projects') }}</span>
      <el-button size="small" text @click="$router.push('/projects')">
        {{ t('common.new') }}
      </el-button>
    </div>
    <div class="project-list">
      <div
        v-for="project in projects"
        :key="project.id"
        class="project-item"
        :class="{ active: project.id === activeId }"
        @click="selectProject(project.id)"
      >
        <span class="project-name" :title="project.name">{{ project.name }}</span>
        <el-button
          text
          size="small"
          class="delete-btn"
          @click.stop="onDelete(project.id)"
        >
          ×
        </el-button>
      </div>
      <div v-if="projects.length === 0" class="empty-sidebar">
        <span>{{ t('common.noProjects') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useProjects } from '../composables/useProjects';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { projects, fetchProjects, deleteProject } = useProjects();

const activeId = computed(() => {
  const match = route.path.match(/\/research\/(.+)/);
  return match ? match[1] : '';
});

watch(
  () => route.path,
  () => {
    fetchProjects();
  }
);

function selectProject(id: string) {
  router.push(`/research/${id}`);
}

async function onDelete(id: string) {
  await deleteProject(id);
  if (activeId.value === id) {
    router.push('/projects');
  }
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
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #e4e7ed;
  font-weight: 500;
  font-size: 14px;
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
  transition: background 0.15s;
}

.project-item:hover {
  background: #ecf5ff;
}

.project-item.active {
  background: #d9ecff;
  font-weight: 500;
}

.project-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  flex: 1;
}

.delete-btn {
  color: #c0c4cc;
  font-size: 16px;
  padding: 0 4px;
  line-height: 1;
}

.delete-btn:hover {
  color: #f56c6c;
}

.empty-sidebar {
  padding: 16px;
  text-align: center;
  color: #c0c4cc;
  font-size: 13px;
}
</style>
