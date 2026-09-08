/**
 * 统一事件流订阅（多端契约的前端实现样板）。
 *
 * 架构（与 web/手机/桌面/TUI 共用的同一契约）：
 *   命令：POST /api/research/run | /api/research/:runId/stop ...
 *   事件：GET  /api/events?projectId=...（SSE，本模块）
 *   资源：GET  /api/projects ...
 *
 * 断线重连：浏览器 EventSource 自动重连并携带 Last-Event-ID，
 * 服务端按 seq 补发错过的事件——多端都不丢进度。
 */

export interface BusEvent {
  seq?: number;
  type: string;
  projectId?: string;
  runId?: string;
  phase?: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}

export function subscribeEvents(
  onEvent: (event: BusEvent) => void,
  options: { projectId?: string } = {}
): () => void {
  const url = options.projectId
    ? `/api/events?projectId=${encodeURIComponent(options.projectId)}`
    : '/api/events';
  const es = new EventSource(url);

  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as BusEvent);
    } catch {
      /* ignore malformed */
    }
  };
  es.onerror = () => {
    // EventSource 会自动重连并带上 Last-Event-ID；这里不做额外处理
  };

  return () => es.close();
}
