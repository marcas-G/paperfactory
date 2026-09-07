import { ref } from 'vue';

const status = ref<'ready' | 'running' | 'done' | 'error'>('ready');

export function useResearchStatus() {
  function setStatus(newStatus: typeof status.value) {
    status.value = newStatus;
  }

  function reset() {
    status.value = 'ready';
  }

  return { status, setStatus, reset };
}
