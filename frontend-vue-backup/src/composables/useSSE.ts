import { ref, onUnmounted } from 'vue';

export interface SSEMessage {
  event: string;
  data: unknown;
}

export interface SSEEventHandlers {
  onMessage?: (msg: SSEMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (err: unknown) => void;
}

export function useSSE() {
  const connected = ref(false);
  const messages = ref<SSEMessage[]>([]);
  let eventSource: EventSource | null = null;
  let handlers: SSEEventHandlers = {};
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectCount = 0;
  const maxReconnects = 3;

  function setHandlers(h: SSEEventHandlers) {
    handlers = h;
  }

  function connect(url = '/api/research/stream') {
    disconnect();
    reconnectCount = 0;

    const es = new EventSource(url);
    eventSource = es;

    es.onopen = () => {
      connected.value = true;
      handlers.onConnect?.();
    };

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        const msg: SSEMessage = {
          event: parsed.type ?? parsed.event ?? 'message',
          data: parsed,
        };
        messages.value.push(msg);
        handlers.onMessage?.(msg);
      } catch {
        const msg: SSEMessage = {
          event: 'message',
          data: e.data,
        };
        messages.value.push(msg);
        handlers.onMessage?.(msg);
      }
    };

    es.onerror = () => {
      connected.value = false;
      es.close();
      eventSource = null;
      if (reconnectCount < maxReconnects) {
        reconnectCount++;
        reconnectTimer = setTimeout(() => connect(url), 3000);
      } else {
        handlers.onDisconnect?.();
      }
    };

    return es;
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      connected.value = false;
    }
  }

  function clear() {
    messages.value = [];
  }

  onUnmounted(() => {
    disconnect();
  });

  return { connected, messages, connect, disconnect, clear, setHandlers };
}
