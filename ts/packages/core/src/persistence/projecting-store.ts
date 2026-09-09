import * as Effect from "effect/Effect";
import { Option, inferIdKey, inferType } from "./object-store";
import type { ObjectStore, ResearchObject } from "./object-store";
import { eventBus, EventBus, type DomainEvent } from "../ledger/events";

/**
 * ProjectingObjectStore（REQ-REC2）
 *
 * 对象写入时同步发出快照式对象事件（object:mutated / object:deleted），
 * 使事件账本成为对象状态的完整记录；启动时可用 replayObjectsInto() 从账本
 * 把对象重建进任意 ObjectStore（内存模式的重启恢复 = 投影重建）。
 *
 * 不变量：
 * - 双写失败不阻塞对象写入（账本故障降级为纯存储，warn 提示）
 * - objectType/objectId 复用 object-store 的共享推断（inferIdKey/inferType）；Unknown 类型跳过发事件
 *   （幂等安全：无事件 = 重放时无此对象，与"从未写成功"语义一致由调用方保证）
 */

function warnLedgerFailure(operation: string, error: unknown): void {
  console.warn(`[projecting-store] ledger ${operation} failed (degraded):`, String(error));
}

export class ProjectingObjectStore implements ObjectStore {
  constructor(
    private readonly inner: ObjectStore,
    private readonly bus: EventBus = eventBus,
  ) {}

  get<T extends ResearchObject>(id: string, type: string): Effect.Effect<Option<T>, Error> {
    return this.inner.get<T>(id, type);
  }

  list<T extends ResearchObject>(type: string, filter?: (obj: T) => boolean): Effect.Effect<ReadonlyArray<T>, Error> {
    return this.inner.list<T>(type, filter);
  }

  save<T extends ResearchObject>(obj: T): Effect.Effect<T, Error> {
    return this.inner.save<T>(obj).pipe(
      Effect.map((saved) => {
        const objectId = inferIdKey(saved);
        const objectType = inferType(saved as unknown as Record<string, unknown>);
        if (objectId && objectType !== "Unknown") {
          try {
            this.bus.emit("object:mutated", {
              data: { objectType, objectId, object: saved as unknown as Record<string, unknown> },
            });
          } catch (error) {
            warnLedgerFailure("emit(mutated)", error);
          }
        }
        return saved;
      }),
    );
  }

  delete(id: string, type: string): Effect.Effect<boolean, Error> {
    return this.inner.delete(id, type).pipe(
      Effect.map((deleted) => {
        if (deleted) {
          try {
            this.bus.emit("object:deleted", { data: { objectType: type, objectId: id } });
          } catch (error) {
            warnLedgerFailure("emit(deleted)", error);
          }
        }
        return deleted;
      }),
    );
  }
}

/**
 * 从事件账本重放对象事件到目标 store（启动时的投影重建）。
 * 语义：按 seq 顺序，mutated -> upsert（save），deleted -> delete（容忍不存在）。
 * 返回重建的对象数。
 */
export function replayObjectsInto(store: ObjectStore, bus: EventBus = eventBus, sinceSeq = 0): Promise<number> {
  const events: DomainEvent[] = bus.since(sinceSeq).filter(
    (event) => event.type === "object:mutated" || event.type === "object:deleted",
  );
  let replayed = 0;
  return new Promise((resolve) => {
    const run = async () => {
      for (const event of events) {
        const data = (event.data ?? {}) as {
          objectType?: string;
          objectId?: string;
          object?: Record<string, unknown>;
        };
        try {
          if (event.type === "object:mutated" && data.object) {
            await Effect.runPromise(store.save(data.object as unknown as ResearchObject));
            replayed++;
          } else if (event.type === "object:deleted" && data.objectId && data.objectType) {
            await Effect.runPromise(store.delete(data.objectId, data.objectType).pipe(Effect.catchAll(() => Effect.succeed(false))));
          }
        } catch (error) {
          console.warn(`[projecting-store] replay skip seq=${event.seq}:`, String(error));
        }
      }
      resolve(replayed);
    };
    void run();
  });
}
