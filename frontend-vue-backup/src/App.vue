<template>
  <div class="app-root" :data-theme="theme">
    <Sidebar />
    <div class="app-main">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Sidebar from './components/Sidebar.vue';

const theme = ref('dark');
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  overflow: hidden;
  background: var(--bg-base) !important;
  color: var(--text-base) !important;
}

:root {
  --bg-base: #0a0a0a;
  --bg-layer-01: rgba(255,255,255,0.031);
  --bg-layer-02: rgba(255,255,255,0.056);
  --bg-layer-03: rgba(255,255,255,0.094);
  --bg-layer-04: rgba(255,255,255,0.169);
  --text-strong: rgba(255,255,255,0.936);
  --text-base: rgba(255,255,255,0.618);
  --text-muted: rgba(255,255,255,0.422);
  --text-faint: rgba(255,255,255,0.284);
  --border-base: rgba(255,255,255,0.063);
  --border-strong: rgba(255,255,255,0.141);
  --accent: #034cff;
  --accent-hover: #1d65f7;
  --success: #12c905;
  --warning: #fcd53a;
  --danger: #fc533a;
  --info: #edb2f1;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 10px;
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.app-root {
  display: flex;
  height: 100%;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.3;
  letter-spacing: -0.04px;
  color: var(--text-base);
  background: var(--bg-base);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

[data-component="message"] {
  display: flex;
  gap: 12px;
  padding: 0 48px;
  width: 100%;
}

[data-slot="text"] {
  margin-top: 24px;
  line-height: 1.5;
  color: var(--text-strong);
}

[data-slot="text"]:first-child {
  margin-top: 0;
}

[data-slot="code"] {
  background: var(--bg-layer-02);
  border: 0.5px solid var(--border-base);
  border-radius: var(--radius-md);
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  overflow-x: auto;
}

[data-slot="spinner"] {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

::scrollbar {
  width: 6px;
}

::scrollbar-track {
  background: transparent;
}

::scrollbar-thumb {
  background: var(--bg-layer-03);
  border-radius: 3px;
}

::selection {
  background: rgba(3, 76, 255, 0.3);
  color: #fff;
}

input, textarea, button {
  font-family: inherit;
  font-size: inherit;
}
</style>
