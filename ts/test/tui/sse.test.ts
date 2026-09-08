/**
 * SSE 读流单测 —— 不起真 server，用 node:http 在随机端口回 SSE 帧流：
 * - 帧解析：`id:`/`data:` 帧、`: ping` 心跳注释、跨 chunk 断帧重组
 * - 断线重连：连接被断后 onStatus("reconnecting")，重连请求带最新 lastEventId + projectId
 * - close()：干净关流，不再重连
 */
import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { ServerResponse } from "node:http";
import { subscribeSse } from "../../packages/tui/src/sse";
import type { DomainEvent } from "../../packages/client/src";

function waitFor(cond: () => boolean, timeoutMs = 3000, what = "condition"): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      if (cond()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error(`timeout waiting for ${what}`));
      setTimeout(tick, 10);
    };
    tick();
  });
}

interface TestServer {
  url: string;
  requests: string[];
  close(): Promise<void>;
}

/** 起随机端口 SSE server；onConnect 拿 res（用 res.write 发帧，走标准 chunked 编码） */
function startSseServer(onConnect: (res: ServerResponse) => void): Promise<TestServer> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url ?? "/");
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    onConnect(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

describe("TUI SSE 读流 (subscribeSse)", () => {
  it("解析 id/data 帧、忽略心跳注释、跨 chunk 断帧重组", async () => {
    const server = await startSseServer((res) => {
      res.write(": ping\n\n");
      // 断帧：一行拆成两次 write，验证逐行缓冲重组
      res.write('id: 1\nda');
      res.write('ta: {"type":"run:start","projectId":"p1"}\n\n');
      res.write('id: 2\ndata: {"type":"phase:start","phase":"literature_search"}\n\n');
    });
    servers.push(server);

    const events: DomainEvent[] = [];
    const sub = subscribeSse(server.url, (e) => events.push(e), { projectId: "p1" });
    try {
      await waitFor(() => events.length >= 2, 3000, "2 SSE events");
      expect(events[0]).toMatchObject({ type: "run:start", projectId: "p1" });
      expect(events[1]).toMatchObject({ type: "phase:start", phase: "literature_search" });
    } finally {
      sub.close();
    }
  });

  it("断线后 onStatus(reconnecting)，重连请求带最新 lastEventId 与 projectId", async () => {
    let connections = 0;
    const server = await startSseServer((res) => {
      connections += 1;
      if (connections === 1) {
        res.write('id: 1\ndata: {"type":"run:start"}\n\n');
        res.write('id: 5\ndata: {"type":"phase:start","phase":"report_generation"}\n\n');
        setTimeout(() => res.socket?.destroy(), 50); // 断线
      } else {
        // 第二次连接：发一条后续事件，保持连接
        res.write('id: 6\ndata: {"type":"phase:complete","phase":"report_generation"}\n\n');
      }
    });
    servers.push(server);

    const events: DomainEvent[] = [];
    const statuses: string[] = [];
    const sub = subscribeSse(server.url, (e) => events.push(e), {
      projectId: "p1",
      reconnectDelayMs: 50,
      onStatus: (s) => statuses.push(s),
    });
    try {
      await waitFor(() => events.length >= 3, 3000, "reconnect + 3rd event");
      // 第一连接收 2 条，重连后收第 3 条
      expect(events.map((e) => e.type)).toEqual(["run:start", "phase:start", "phase:complete"]);
      expect(statuses).toContain("reconnecting");
      // 重连 URL 带最新游标（id 5）与项目过滤
      expect(server.requests.length).toBeGreaterThanOrEqual(2);
      expect(server.requests[1]).toContain("lastEventId=5");
      expect(server.requests[1]).toContain("projectId=p1");
    } finally {
      sub.close();
    }
  });

  it("close() 干净关流：不再产生新连接", async () => {
    const server = await startSseServer((res) => {
      res.write('id: 1\ndata: {"type":"run:start"}\n\n');
      setTimeout(() => res.socket?.destroy(), 30);
    });
    servers.push(server);

    const statuses: string[] = [];
    const sub = subscribeSse(server.url, () => {}, {
      reconnectDelayMs: 50,
      onStatus: (s) => statuses.push(s),
    });
    await waitFor(() => statuses.includes("reconnecting"), 3000, "first reconnect notice");
    sub.close();
    expect(statuses).toContain("closed");

    const connectionsAtClose = server.requests.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(server.requests.length).toBe(connectionsAtClose); // 无重连尝试
  });
});
