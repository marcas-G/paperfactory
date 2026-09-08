import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventBus } from "@pf/server/events";

/**
 * 事件账本（SQLite append-only ledger）测试：
 * - 重启模拟：新实例打开同一 db 文件，since(0) 应读到全部历史事件且 seq 连续单调；
 * - 续传语义：since(lastSeq) 只返回 seq > lastSeq 的事件。
 */
describe("EventBus SQLite ledger", () => {
  const tmpDirs: string[] = [];
  const tmpFiles: string[] = [];

  function makeDbPath(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ledger-"));
    tmpDirs.push(dir);
    return path.join(dir, "ledger.sqlite");
  }

  afterEach(() => {
    // 只清理测试自建的目录/文件，绝不触碰 os.tmpdir() 本身
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
    for (const file of tmpFiles) fs.rmSync(file, { force: true });
    tmpDirs.length = 0;
    tmpFiles.length = 0;
  });

  it("survives restart: new instance on same db replays all events with contiguous seq", () => {
    const dbPath = makeDbPath();

    // 第一个实例（模拟首次进程）：emit 3 条后关闭
    const bus1 = new EventBus(dbPath);
    bus1.emit("run:start", { runId: "run-1", projectId: "proj-1", data: { question: "q1" } });
    bus1.emit("phase:change", { runId: "run-1", projectId: "proj-1", phase: "search" });
    bus1.emit("run:end", { runId: "run-1", projectId: "proj-1" });
    bus1.close();

    // 新实例（模拟重启）：同一 db 文件
    const bus2 = new EventBus(dbPath);
    const replayed = bus2.since(0);

    expect(replayed).toHaveLength(3);
    expect(replayed.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(replayed.map((e) => e.type)).toEqual(["run:start", "phase:change", "run:end"]);

    // 字段完整还原（含可选字段与 JSON data）
    expect(replayed[0].runId).toBe("run-1");
    expect(replayed[0].projectId).toBe("proj-1");
    expect(replayed[0].data).toEqual({ question: "q1" });
    expect(replayed[1].phase).toBe("search");
    expect(typeof replayed[0].timestamp).toBe("string");
    bus2.close();
  });

  it("replay from mid-stream: since(2) returns only events with seq > 2", () => {
    const dbPath = makeDbPath();

    const bus = new EventBus(dbPath);
    bus.emit("a");
    bus.emit("b");
    bus.emit("c");
    bus.emit("d");

    const tail = bus.since(2);
    expect(tail.map((e) => e.seq)).toEqual([3, 4]);
    expect(tail.map((e) => e.type)).toEqual(["c", "d"]);

    // 跨实例同样成立（重启后从断点续传）
    bus.close();
    const bus2 = new EventBus(dbPath);
    expect(bus2.since(2).map((e) => e.seq)).toEqual([3, 4]);
    // 新事件在重启后继续单调递增，不回退、不复用
    const next = bus2.emit("e");
    expect(next.seq).toBe(5);
    bus2.close();
  });

  it("degrades to in-memory mode when db path is not writable", () => {
    // 目录占位为文件 → mkdir 失败 → 应退化纯内存而非抛异常
    const blocker = path.join(os.tmpdir(), `pf-blocker-${Date.now()}`);
    fs.writeFileSync(blocker, "not-a-dir");
    tmpFiles.push(blocker);

    const bus = new EventBus(path.join(blocker, "sub", "ledger.sqlite"));
    const e1 = bus.emit("x");
    const e2 = bus.emit("y");
    expect(e2.seq).toBe(e1.seq + 1); // 内存模式 seq 仍单调
    expect(bus.since(0).map((e) => e.type)).toEqual(["x", "y"]);
    bus.close();
  });
});
