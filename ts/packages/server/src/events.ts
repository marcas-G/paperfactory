import { Hono } from "hono";
import { EventEmitter } from "node:events";

/**
 * 全局事件总线 —— OpenCode 架构的"GlobalBus"对等物。
 *
 * 设计（多端契约的核心）：
 * - 所有领域事件（研究运行/阶段/工具/审批/报告）的唯一出口；
 * - 任何客户端（web / 手机 app / 桌面 / TUI）只需：
 *     ① GET /api/events 订阅这一条 SSE 流；
 *     ② POST 命令端点发起动作；
 *     ③ GET 资源端点查状态。
 * - 事件带 projectId，客户端可按项目过滤；reconnect 支持 Last-Event-ID
 *   从 seq 续传（断线重连不丢事件）。
 */

export interface DomainEvent {
  seq: number;
  type: string;
  projectId?: string;
  runId?: string;
  phase?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

class EventBus {
  private emitter = new EventEmitter();
  private history: DomainEvent[] = [];
  private nextSeq = 1;
  private static readonly HISTORY_LIMIT = 2000;

  emit(type: string, payload: Omit<DomainEvent, "seq" | "type" | "timestamp"> = {}): DomainEvent {
    const event: DomainEvent = {
      seq: this.nextSeq++,
      type,
      ...payload,
      timestamp: new Date().toISOString(),
    };
    this.history.push(event);
    if (this.history.length > EventBus.HISTORY_LIMIT) {
      this.history = this.history.slice(-EventBus.HISTORY_LIMIT);
    }
    this.emitter.emit("event", event);
    return event;
  }

  /** 订阅（返回退订函数） */
  subscribe(listener: (event: DomainEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  /** 断线重连：取 lastSeq 之后的事件 */
  since(lastSeq: number): DomainEvent[] {
    return this.history.filter((e) => e.seq > lastSeq);
  }
}

export const eventBus = new EventBus();

export function createEventRoutes(): Hono {
  const router = new Hono();

  router.get("/api/events", (c) => {
    const projectId = c.req.query("projectId") ?? undefined;
    const lastEventId = Number(c.req.header("Last-Event-ID") ?? c.req.query("lastEventId") ?? 0);

    const encoder = new TextEncoder();
    let unsubscribe: () => void = () => {};
    let heartbeat: ReturnType<typeof setInterval>;

    const stream = new ReadableStream({
      start(controller) {
        const send = (event: DomainEvent) => {
          if (projectId && event.projectId && event.projectId !== projectId) return;
          try {
            controller.enqueue(
              encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
            /* connection closed */
          }
        };

        // 断线重连：先补发错过的事件
        for (const event of eventBus.since(lastEventId)) send(event);

        // 连接确认（客户端可用于就绪检测）
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "stream:ready" })}\n\n`)
          );
        } catch {
          /* closed */
        }

        unsubscribe = eventBus.subscribe(send);
        // 心跳防止代理断开空闲连接
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            /* closed */
          }
        }, 25_000);
      },
      cancel() {
        unsubscribe();
        clearInterval(heartbeat);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  return router;
}
