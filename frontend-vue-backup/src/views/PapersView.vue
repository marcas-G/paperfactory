<template>
  <div class="papers-view">
    <div class="papers-header">
      <h2>{{ t('nav.papers') }}</h2>
      <el-input
        v-model="searchQuery"
        :placeholder="t('common.search')"
        clearable
        style="width: 300px"
      />
    </div>

    <div v-if="loading" class="loading">
      {{ t('common.loading') }}...
    </div>

    <PaperLibrary
      v-else
      :papers="filteredPapers"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import PaperLibrary from '../components/PaperLibrary.vue';
import type { Paper } from '../api/types';
import client from '../api/client';

const { t } = useI18n();

const loading = ref(false);
const papers = ref<Paper[]>([]);
const searchQuery = ref('');

const filteredPapers = computed(() => {
  if (!searchQuery.value.trim()) return papers.value;
  const q = searchQuery.value.toLowerCase();
  return papers.value.filter(
    p => p.sourceTitle.toLowerCase().includes(q)
  );
});

async function loadAllPapers() {
  loading.value = true;
  try {
    const { data: projects } = await client.get('/projects');
    const projectList = Array.isArray(projects) ? projects : [];
    const seen = new Set<string>();
    const allPapers: Paper[] = [];

    await Promise.all(
      projectList.map(async (project: { id: string }) => {
        try {
          const { data } = await client.get(`/projects/${project.id}/papers`);
          const projectPapers = Array.isArray(data) ? data : [];
          for (const paper of projectPapers) {
            if (!seen.has(paper.citationId)) {
              seen.add(paper.citationId);
              allPapers.push(paper);
            }
          }
        } catch {
          /* skip projects with no papers or errors */
        }
      })
    );

    papers.value = allPapers;
  } catch {
    papers.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadAllPapers();
});
</script>

<style scoped>
.papers-view {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.papers-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
</style>
