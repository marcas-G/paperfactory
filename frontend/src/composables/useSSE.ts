import { ref, onUnmounted } from 'vue';

export interface SSEMessage {
  event: string;
  data: unknown;
}

export function useSSE() {
  const connected = ref(false);
  const eventSource: EventSource | null = null;

  function connect(url = '/api/research/stream') {
    if (eventSource) {
      eventSource.close();
    }

    const es = new EventSource(url);
    eventSource = es;

    es.onopen = () => {
      connected.value = true;
    };

    es.onmessage = (e) => {
      const windowEvent = window as unknown as EventTarget;
      const event = new CustomEvent('sse-message', {
        detail: JSON.parse(e.data),
      });
      windowEvent.dispatchEvent(event);
    };

    es.onerror = () => {
      connected.value = false;
      es.close();
      setTimeout(() => connect(url), 3000);
    };

    return es;
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      connected.value = false;
    }
  }

  onUnmounted(() => {
    disconnect();
  });

  return { connected, connect, disconnect };
}
