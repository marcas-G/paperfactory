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

  function setHandlers(h: SSEEventHandlers) {
    handlers = h;
  }

  function connect(url = '/api/research/stream') {
    disconnect();

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
        // If data isn't JSON, treat raw text as data
        const msg: SSEMessage = {
          event: 'message',
          data: e.data,
        };
        messages.value.push(msg);
        handlers.onMessage?.(msg);
      }
    };

    es.onerror = (err) => {
      connected.value = false;
      handlers.onDisconnect?.();
      handlers.onError?.(err);
      es.close();
      eventSource = null;
      // Auto-reconnect after 3s
      reconnectTimer = setTimeout(() => connect(url), 3000);
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
