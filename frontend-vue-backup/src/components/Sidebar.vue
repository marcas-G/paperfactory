<template>
  <div data-component="sidebar">
    <div data-slot="header">
      <span data-slot="logo">PF</span>
      <button data-slot="new-btn" @click="showNew = true">+</button>
    </div>
    <div data-slot="list">
      <div
        v-for="project in projects"
        :key="project.id"
        data-slot="session"
        :class="{ active: isActive(project.id) }"
        @click="navigate(project.id)"
      >
        <span data-slot="title">{{ project.name }}</span>
        <span data-slot="status" :class="project.status.toLowerCase()" />
      </div>
    </div>
    <div data-slot="footer" v-if="projects.length === 0">
      <span>No sessions</span>
    </div>
  </div>

  <div v-if="showNew" data-component="modal-overlay" @click.self="showNew = false">
    <div data-component="new-session">
      <input
        v-model="newQuestion"
        :placeholder="t('common.enterQuestion')"
        @keyup.enter="handleCreate"
        data-slot="input"
        autofocus
        ref="inputRef"
      />
      <div data-slot="actions">
        <button @click="showNew = false">{{ t('common.cancel', 'Cancel') }}</button>
        <button data-slot="primary" @click="handleCreate">{{ t('common.new') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useProjects } from '../composables/useProjects';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { projects, createProject } = useProjects();

const showNew = ref(false);
const newQuestion = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const showNewPrev = showNew.value;
import { watch } from 'vue';
watch(showNew, (v) => {
  if (v) {
    nextTick(() => inputRef.value?.focus());
    newQuestion.value = '';
  }
});

function isActive(id: string): boolean {
  return route.params.projectId === id;
}

function navigate(id: string) {
  router.push(`/research/${id}`);
}

async function handleCreate() {
  if (!newQuestion.value.trim()) return;
  const result = await createProject(newQuestion.value);
  newQuestion.value = '';
  showNew.value = false;
  if (result?.id) {
    router.push(`/research/${result.id}`);
  }
}
</script>

<style scoped>
[data-component="sidebar"] {
  width: 240px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  background: var(--bg-layer-01);
  border-right: 0.5px solid var(--border-base);
  overflow: hidden;
}

[data-slot="header"] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 0.5px solid var(--border-base);
}

[data-slot="logo"] {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
  letter-spacing: 0.5px;
}

[data-slot="new-btn"] {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  border: 0.5px solid var(--border-base);
  background: var(--bg-layer-02);
  color: var(--text-base);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background 0.15s ease;
}

[data-slot="new-btn"]:hover {
  background: var(--bg-layer-03);
}

[data-slot="list"] {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

[data-slot="session"] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.1s ease;
  min-height: 34px;
}

[data-slot="session"]:hover {
  background: var(--bg-layer-02);
}

[data-slot="session"].active {
  background: var(--bg-layer-03);
}

[data-slot="title"] {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-base);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-slot="status"] {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

[data-slot="status"].active { background: var(--accent); }
[data-slot="status"].completed { background: var(--success); }
[data-slot="status"].error { background: var(--danger); }

[data-slot="footer"] {
  padding: 20px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
  border-top: 0.5px solid var(--border-base);
}

[data-component="modal-overlay"] {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

[data-component="new-session"] {
  background: var(--bg-layer-02);
  border: 0.5px solid var(--border-strong);
  border-radius: var(--radius-xl);
  padding: 20px;
  width: 440px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

[data-slot="input"] {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-base);
  border: 0.5px solid var(--border-base);
  border-radius: var(--radius-md);
  color: var(--text-strong);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

[data-slot="input"]:focus {
  border-color: var(--accent);
}

[data-slot="actions"] {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

[data-slot="actions"] button {
  padding: 6px 16px;
  border-radius: var(--radius-md);
  border: 0.5px solid var(--border-base);
  background: var(--bg-layer-02);
  color: var(--text-base);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

[data-slot="actions"] button:hover {
  background: var(--bg-layer-03);
}

[data-slot="actions"] button[data-slot="primary"] {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

[data-slot="actions"] button[data-slot="primary"]:hover {
  background: var(--accent-hover);
}
</style>
