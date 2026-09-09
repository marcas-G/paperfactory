import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as Effect from "effect/Effect";
import { EventBus } from "@pf/core/ledger/events";
import { InMemoryObjectStore } from "@pf/core/persistence/object-store";
import { ProjectingObjectStore, replayObjectsInto } from "@pf/core/persistence/projecting-store";

/**
 * REQ-REC2 投影重建验证：
 * 双写（save/delete → object 事件入账本）+ 重放（新 store 从账本重建对象）。
 */

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "pf-proj-"));
  process.env.PF_DATA_DIR = dataDir;
});

afterEach(() => {
  delete process.env.PF_DATA_DIR;
  rmSync(dataDir, { recursive: true, force: true });
});

function freshBusAndStore(): { bus: EventBus; dbPath: string; store: ProjectingObjectStore } {
  // 每个 case 用独立 db 文件，避免用例间事件串扰
  const dbPath = path.join(dataDir, `l-${Math.random().toString(36).slice(2)}.sqlite`);
  const bus = new EventBus(dbPath);
  const store = new ProjectingObjectStore(new InMemoryObjectStore(), bus);
  return { bus, dbPath, store };
}

async function save(store: ProjectingObjectStore, obj: Record<string, unknown>) {
  await Effect.runPromise(store.save(obj as never));
}

describe("ProjectingObjectStore (REQ-REC2)", () => {
  it("save 双写对象事件，重启后可从账本重建到新 store", async () => {
    const { bus, dbPath, store } = freshBusAndStore();
    await save(store, { projectId: "p1", name: "Alpha", status: "ACTIVE" });
    await save(store, { hypothesisId: "h1", projectId: "p1", statement: "S", status: "PROPOSED" });

    const mutated = bus.since(0).filter((e) => e.type === "object:mutated");
    expect(mutated.length).toBe(2);

    // 模拟重启：全新 bus（同一 db）+ 全新内存 store → 重放
    const bus2 = new EventBus(dbPath);
    const fresh = new InMemoryObjectStore();
    const rebuilt = await replayObjectsInto(fresh, bus2);
    expect(rebuilt).toBeGreaterThanOrEqual(2);
    const projects = await Effect.runPromise(fresh.list("Project")) as Array<Record<string, unknown>>;
    expect(projects.some((p) => p.projectId === "p1")).toBe(true);
    const hypotheses = await Effect.runPromise(fresh.list("Hypothesis")) as Array<Record<string, unknown>>;
    expect(hypotheses.some((h) => (h as { hypothesisId?: string }).hypothesisId === "h1")).toBe(true);
  });

  it("delete 后重放不复活对象", async () => {
    const { bus, dbPath, store } = freshBusAndStore();
    await save(store, { projectId: "p2", name: "Beta" });
    await Effect.runPromise(store.delete("p2", "Project"));

    const types = bus.since(0).map((e) => e.type);
    expect(types).toContain("object:deleted");

    const fresh = new InMemoryObjectStore();
    await replayObjectsInto(fresh, new EventBus(dbPath));
    const projects = await Effect.runPromise(fresh.list("Project")) as Array<Record<string, unknown>>;
    expect(projects.some((p) => p.projectId === "p2")).toBe(false);
  });

  it("无 *Id 字段的对象跳过发事件（不炸、不阻塞写入）", async () => {
    const { bus, store } = freshBusAndStore();
    const saved = await Effect.runPromise(store.save({ foo: "bar" } as never));
    expect((saved as Record<string, unknown>).foo).toBe("bar");
    expect(bus.since(0).filter((e) => e.type === "object:mutated").length).toBe(0);
  });
});
