<template>
  <div class="topbar">
    <div class="logo">PaperFactory</div>
    <div class="nav-tabs">
      <router-link :to="researchLink" :class="{ active: currentRoute === 'research' }">
        {{ t('nav.research') }}
      </router-link>
      <router-link to="/projects" :class="{ active: currentRoute === 'projects' }">
        {{ t('nav.projects') }}
      </router-link>
      <router-link to="/papers" :class="{ active: currentRoute === 'papers' }">
        {{ t('nav.papers') }}
      </router-link>
    </div>
    <div class="right-section">
      <div class="status-indicator" :class="status">
        <span class="status-dot" />
        {{ statusLabel }}
      </div>
      <div class="lang-switch">
        <el-button size="small" text @click="switchLang">
          {{ locale === 'zh' ? 'EN' : '中' }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useResearchStatus } from '../composables/useResearchStatus';

const route = useRoute();
const { t, locale } = useI18n();
const { status } = useResearchStatus();

const currentRoute = computed(() => {
  if (route.path.startsWith('/research')) return 'research';
  if (route.path === '/papers') return 'papers';
  return 'projects';
});

const researchLink = computed(() => {
  const projectId = route.params.projectId;
  if (projectId) {
    return `/research/${projectId}`;
  }
  return '/projects';
});

const statusLabel = computed(() => t(`status.${status.value}`));

function switchLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh';
}

defineExpose({ researchLink });
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  background: #1da57a;
  color: #fff;
  gap: 24px;
  flex-shrink: 0;
}

.logo {
  font-weight: bold;
  font-size: 18px;
  letter-spacing: 1px;
}

.nav-tabs {
  display: flex;
  gap: 16px;
}

.nav-tabs a {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
}

.nav-tabs a.active,
.nav-tabs a:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.15);
}

.right-section {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-indicator.ready { background: rgba(103, 194, 58, 0.2); color: #67c23a; }
.status-indicator.running { background: rgba(230, 162, 60, 0.2); color: #e6a23c; }
.status-indicator.done { background: rgba(64, 158, 255, 0.2); color: #409eff; }
.status-indicator.error { background: rgba(245, 108, 108, 0.2); color: #f56c6c; }

.lang-switch :deep(.el-button) {
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
}
</style>
