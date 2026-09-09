import { Hono } from "hono";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import type { Database as SQLiteDatabase, Statement } from "better-sqlite3";

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
 *
 * 持久化账本（对标 OpenCode event 账本）：
 * - 事件同步写入 SQLite（append-only，seq 单调递增），重启不丢；
 * - Last-Event-ID 续传跨进程重启有效（since 从 DB 读）；
 * - 账本故障（打开/写入失败）时 console.warn 并退化为纯内存模式，
 *   研究流程不因账本停摆。
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

/** 账本行结构（下划线列名与表 schema 一一对应） */
interface LedgerRow {
  seq: number;
  type: string;
  project_id: string | null;
  run_id: string | null;
  phase: string | null;
  data: string | null;
  timestamp: string;
}

/** 账本表：append-only（代码只 INSERT/SELECT，禁止 UPDATE/DELETE），seq 由 AUTOINCREMENT 保证单调 */
const CREATE_LEDGER_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    project_id TEXT,
    run_id TEXT,
    phase TEXT,
    data TEXT,
    timestamp TEXT NOT NULL
  )
`;

function defaultDbPath(): string {
  const dataDir = process.env.PF_DATA_DIR
    ?? path.join(process.cwd(), "data");
  return path.join(dataDir, "ledger.sqlite");
}

function rowToEvent(row: LedgerRow): DomainEvent {
  return {
    seq: row.seq,
    type: row.type,
    projectId: row.project_id ?? undefined,
    runId: row.run_id ?? undefined,
    phase: row.phase ?? undefined,
    data: row.data === null ? undefined : (JSON.parse(row.data) as Record<string, unknown>),
    timestamp: row.timestamp,
  };
}

export class EventBus {
  private emitter = new EventEmitter();
  /** SQLite 账本；null = 纯内存退化模式 */
  private db: SQLiteDatabase | null = null;
  private insertStmt: Statement | null = null;
  private sinceStmt: Statement | null = null;
  /** 内存退化模式的状态；nextSeq 与 DB MAX(seq) 保持同步，降级后 seq 也不回退 */
  private history: DomainEvent[] = [];
  private nextSeq = 1;
  private static readonly HISTORY_LIMIT = 2000;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? defaultDbPath();
    try {
      // createRequire 同步加载 CJS 原生模块；任何失败（缺绑定/磁盘/权限）都退化为纯内存
      const require = createRequire(import.meta.url);
      const Database = require("better-sqlite3") as typeof import("better-sqlite3");
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      const db = new Database(resolvedPath);
      db.pragma("journal_mode = WAL");
      db.pragma("busy_timeout = 5000");
      db.exec(CREATE_LEDGER_SQL);
      this.insertStmt = db.prepare(
        "INSERT INTO events (type, project_id, run_id, phase, data, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
      );
      this.sinceStmt = db.prepare(
        "SELECT seq, type, project_id, run_id, phase, data, timestamp FROM events WHERE seq > ? ORDER BY seq"
      );
      const max = db.prepare("SELECT COALESCE(MAX(seq), 0) AS max FROM events").get() as { max: number };
      this.nextSeq = max.max + 1;
      this.db = db;
    } catch (err) {
      this.db = null;
      this.insertStmt = null;
      this.sinceStmt = null;
      console.warn(
        `[eventBus] ledger unavailable at ${resolvedPath}, degrading to in-memory mode:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  emit(type: string, payload: Omit<DomainEvent, "seq" | "type" | "timestamp"> = {}): DomainEvent {
    const timestamp = new Date().toISOString();
    if (this.db && this.insertStmt) {
      try {
        const info = this.insertStmt.run(
          type,
          payload.projectId ?? null,
          payload.runId ?? null,
          payload.phase ?? null,
          payload.data === undefined ? null : JSON.stringify(payload.data),
          timestamp
        );
        const event: DomainEvent = { seq: Number(info.lastInsertRowid), type, ...payload, timestamp };
        this.nextSeq = event.seq + 1; // 保持内存计数与账本同步，降级后 seq 不回退
        this.emitter.emit("event", event);
        return event;
      } catch (err) {
        this.db = null;
        this.insertStmt = null;
        this.sinceStmt = null;
        console.warn("[eventBus] ledger write failed, degrading to in-memory mode:", err);
      }
    }
    // 纯内存模式（账本不可用/写入失败）
    const event: DomainEvent = { seq: this.nextSeq++, type, ...payload, timestamp };
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

  /** 断线重连：取 lastSeq 之后的事件（从账本读，跨进程重启有效） */
  since(lastSeq: number): DomainEvent[] {
    if (this.db && this.sinceStmt) {
      try {
        return (this.sinceStmt.all(lastSeq) as LedgerRow[]).map(rowToEvent);
      } catch (err) {
        console.warn("[eventBus] ledger read failed, falling back to in-memory:", err);
      }
    }
    return this.history.filter((e) => e.seq > lastSeq);
  }

  /** 测试专用：清空账本与内存历史（用例间隔离，防重放串台）。 */
  clearForTest(): void {
    if (this.db) {
      try {
        this.db.exec("DELETE FROM events");
      } catch {
        /* ignore */
      }
    }
    this.history = [];
    this.nextSeq = 1;
  }

  /** 关闭账本连接（测试/优雅停机用；关闭后退化为纯内存模式） */
  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        /* already closed */
      }
      this.db = null;
      this.insertStmt = null;
      this.sinceStmt = null;
    }
  }
}

// vitest 多 worker 并行下，文件型 SQLite（WAL+文件锁+目录）与 vite 模块图组合会触发
// native 层病态分配——测试环境全局单例用纯内存库；持久化语义由显式路径的单测覆盖。
export const eventBus = new EventBus(process.env.VITEST ? ":memory:" : undefined);

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

        // 断线重连：先补发错过的事件（since 从 SQLite 账本读，可跨进程重启续传）
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
