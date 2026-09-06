<template>
  <div class="topbar">
    <div class="logo">PaperFactory</div>
    <div class="nav-tabs">
      <router-link to="/research/current" :class="{ active: currentRoute === 'research' }">
        {{ t('nav.research') }}
      </router-link>
      <router-link to="/projects" :class="{ active: currentRoute === 'projects' }">
        {{ t('nav.projects') }}
      </router-link>
    </div>
    <div class="right-section">
      <div class="status-indicator" :class="status">
        {{ statusLabel }}
      </div>
      <div class="lang-switch">
        <button @click="switchLang">{{ locale === 'zh' ? 'EN' : '中' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const route = useRoute();
const { t, locale } = useI18n();

const currentRoute = computed(() =>
  route.path.includes('research') ? 'research' : 'projects'
);

const status = 'ready';
const statusLabel = computed(() => t(`status.${status}`));

function switchLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh';
}
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
}

.logo {
  font-weight: bold;
  font-size: 18px;
}

.nav-tabs {
  display: flex;
  gap: 16px;
}

.nav-tabs a {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 4px;
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
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
}

.status-indicator.ready { background: #67c23a; }
.status-indicator.running { background: #e6a23c; }
.status-indicator.done { background: #409eff; }
.status-indicator.error { background: #f56c6c; }
</style>
