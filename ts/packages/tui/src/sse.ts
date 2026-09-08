/**
 * fetch 版 SSE 读流 —— Node 18+ 无原生 EventSource 的极简替代。
 *
 * 契约对应 GET /api/events（packages/protocol/src/events.ts）：
 * - 帧：`id: <seq>\ndata: <json>\n\n`；就绪帧无 id；心跳为 `: ping\n\n` 注释行
 * - 服务端支持 ?projectId=&lastEventId= 过滤/续传（断线按 seq 补发，不丢事件）
 *
 * 只做逐行解析 + 断线重连，不依赖任何 npm 包。
 */
import type { DomainEvent } from "@pf/client";

export interface SseSubscribeOptions {
  /** 只接收该项目的事件（服务端过滤键） */
  projectId?: string;
  /** 断线重连续传游标（之后每次重连自动带上最新收到的 seq） */
  lastEventId?: number;
  /** 重连退避（默认 1s） */
  reconnectDelayMs?: number;
  /** 连接状态回调（打印 `[reconnecting]` 等） */
  onStatus?: (status: "reconnecting" | "closed", detail?: string) => void;
  /** 测试注入：自定义 fetch */
  fetchImpl?: typeof globalThis.fetch;
}

export interface SseSubscription {
  /** 干净关流（中断 fetch、停重连循环） */
  close(): void;
}

interface SseFrame {
  id: string | null;
  data: string[];
}

/** 单行解析（返回 null 表示注释/未知字段，忽略） */
function parseLine(line: string, frame: SseFrame): "data" | "id" | null {
  if (line === "" || line.startsWith(":")) return null;
  const colon = line.indexOf(":");
  const field = colon < 0 ? line : line.slice(0, colon);
  let value = colon < 0 ? "" : line.slice(colon + 1);
  if (value.startsWith(" ")) value = value.slice(1);
  if (field === "data") {
    frame.data.push(value);
    return "data";
  }
  if (field === "id") {
    frame.id = value;
    return "id";
  }
  return null;
}

/** 完整帧 → DomainEvent（data 非合法 JSON 则丢弃） */
function frameToEvent(frame: SseFrame): { event: DomainEvent; id: number | null } | null {
  if (frame.data.length === 0) return null;
  try {
    const event = JSON.parse(frame.data.join("\n")) as DomainEvent;
    return { event, id: frame.id !== null ? Number(frame.id) : null };
  } catch {
    return null; // ignore malformed frame
  }
}

/**
 * 订阅统一事件流。onEvent 在每帧解析后回调；断线自动带 lastEventId 重连。
 * 返回 SseSubscription，close() 后不再重连。
 */
export function subscribeSse(
  baseUrl: string,
  onEvent: (event: DomainEvent) => void,
  opts: SseSubscribeOptions = {}
): SseSubscription {
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  const delay = opts.reconnectDelayMs ?? 1000;
  const abort = new AbortController();
  let closed = false;

  const run = async (): Promise<void> => {
    let lastEventId = opts.lastEventId ?? 0;
    while (!closed) {
      let failureDetail: string | undefined;
      try {
        const qs = new URLSearchParams();
        if (opts.projectId !== undefined) qs.set("projectId", opts.projectId);
        if (lastEventId > 0) qs.set("lastEventId", String(lastEventId));
        const queryStr = qs.toString();
        const res = await doFetch(`${baseUrl}/api/events${queryStr ? "?" + queryStr : ""}`, {
          headers: { Accept: "text/event-stream" },
          signal: abort.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let frame: SseFrame = { id: null, data: [] };

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break; // 服务端关流 → 走重连
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, "");
            buffer = buffer.slice(newline + 1);
            if (line === "") {
              // 空行 = 帧结束
              const parsed = frameToEvent(frame);
              frame = { id: null, data: [] };
              if (parsed) {
                if (parsed.id !== null && Number.isFinite(parsed.id)) {
                  lastEventId = parsed.id;
                }
                onEvent(parsed.event);
              }
            } else {
              parseLine(line, frame);
            }
            newline = buffer.indexOf("\n");
          }
        }
        if (!closed) {
          try {
            await reader.cancel();
          } catch {
            /* already closed */
          }
        }
      } catch (err) {
        if (closed || abort.signal.aborted) return;
        failureDetail = String(err);
      }
      if (closed) return;
      opts.onStatus?.("reconnecting", failureDetail);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  };

  void run();

  return {
    close(): void {
      if (closed) return;
      closed = true;
      abort.abort();
      opts.onStatus?.("closed");
    },
  };
}
