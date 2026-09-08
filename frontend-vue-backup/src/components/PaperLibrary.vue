<template>
  <div class="paper-library">
    <div class="library-header">
      <span>{{ t('common.papers') }}</span>
      <span class="paper-count" v-if="papers.length > 0">
        ({{ papers.length }})
      </span>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}...</div>

    <div v-else-if="papers.length === 0" class="empty-papers">
      No papers found yet.
    </div>

    <div v-else class="paper-list">
      <div
        v-for="paper in papers"
        :key="paper.citationId"
        class="paper-item"
      >
        <div class="paper-main" @click="togglePaper(paper.citationId)">
          <div class="paper-title">{{ paper.sourceTitle || 'Untitled' }}</div>
          <div class="paper-meta">
            {{ paper.sourceAuthors?.join(', ') || 'Unknown authors' }}
            <span v-if="paper.sourceYear"> ({{ paper.sourceYear }})</span>
          </div>
          <div class="paper-stats">
            <el-tag size="small" type="info" effect="plain">
              📊 {{ paper.citationCount }} citations
            </el-tag>
            <el-tag size="small" type="" effect="plain">
              🎯 {{ paper.relevanceScore?.toFixed(2) ?? '0.00' }}
            </el-tag>
            <el-tag
              v-if="paper.pdfDownloadStatus === 'downloaded'"
              size="small"
              type="success"
              effect="plain"
            >
              PDF
            </el-tag>
          </div>
        </div>

        <div v-if="expandedPapers.has(paper.citationId)" class="paper-expanded">
          <div class="paper-abstract">
            <strong>Abstract:</strong>
            <p>{{ paper.abstract || 'No abstract available' }}</p>
          </div>
          <div class="paper-url" v-if="paper.sourceUrl">
            <a :href="paper.sourceUrl" target="_blank" rel="noopener">
              Open source ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Paper } from '../api/types';
import client from '../api/client';

const { t } = useI18n();

const props = defineProps<{
  papers?: Paper[];
  projectId?: string;
}>();

const loading = ref(false);
const papers = ref<Paper[]>(props.papers ?? []);
const expandedPapers = ref<Set<string>>(new Set());

async function loadPapers() {
  if (!props.projectId) return;
  loading.value = true;
  try {
    const { data } = await client.get(`/projects/${props.projectId}/papers`);
    papers.value = Array.isArray(data) ? data : [];
  } catch {
    papers.value = [];
  } finally {
    loading.value = false;
  }
}

function togglePaper(id: string) {
  const set = new Set(expandedPapers.value);
  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }
  expandedPapers.value = set;
}

onMounted(() => {
  if (!props.papers && props.projectId) {
    loadPapers();
  }
});
</script>

<style scoped>
.paper-library {
  padding: 8px 0;
}

.library-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  padding: 8px 12px;
}

.paper-count {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}

.loading {
  text-align: center;
  padding: 20px;
  color: #909399;
  font-size: 13px;
}

.empty-papers {
  text-align: center;
  padding: 20px;
  color: #c0c4cc;
  font-size: 13px;
}

.paper-list {
  max-height: 500px;
  overflow-y: auto;
}

.paper-item {
  border-bottom: 1px solid #f0f0f0;
}

.paper-main {
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.paper-main:hover {
  background: #f5f7fa;
}

.paper-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 4px;
}

.paper-meta {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.paper-stats {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.paper-expanded {
  padding: 0 12px 10px 12px;
  background: #f9f9f9;
}

.paper-abstract {
  font-size: 12px;
  line-height: 1.6;
  color: #606266;
}

.paper-abstract strong {
  display: block;
  margin-bottom: 4px;
  color: #909399;
}

.paper-abstract p {
  margin: 0;
}

.paper-url {
  margin-top: 6px;
}

.paper-url a {
  font-size: 12px;
  color: #409eff;
  text-decoration: none;
}

.paper-url a:hover {
  text-decoration: underline;
}
</style>
