/**
 * 契约 ↔ 实现回归：遍历 @pf/protocol 端点契约表，对真实 Hono app 发请求。
 *
 * 三层保证：
 * 1. 覆盖完整性——契约表必须与 server 实际注册的 HTTP 路由一一对应
 *    （SERVER_ROUTES 为 grep 快照；server 加端点未进契约 → 这里红）
 * 2. 行为一致——每端点不炸 500：GET 200/404，POST/PUT/DELETE 2xx/4xx，
 *    4xx 必须是统一 ApiError JSON
 * 3. SDK 正确——生成函数的 path/query/body 拼装、adapter 透传、
 *    subscribeEvents 的 URL 拼接（契约的消费者侧）
 */
import { describe, it, expect } from "vitest";
import { createHonoApp, type HonoApp } from "@pf/server/routes";
import { InMemoryObjectStore } from "@pf/core/persistence/object-store";
import { InMemoryEventStore } from "@pf/core/persistence/event-store";
import { ResearchController } from "@pf/core/control/controller";
import { TransitionEngine } from "@pf/core/control/engine";
import { ActionRegistry } from "@pf/core/control/registry";
import { DeterministicProvider } from "@pf/core/runtime/provider-deterministic";
import { ENDPOINTS, type EndpointDef } from "../../packages/protocol/src";
import {
  getEvents,
  getEvidenceChain,
  startResearch,
  axiosAdapter,
  fetchAdapter,
  subscribeEvents,
  type ClientAdapter,
  type PfFetchInit,
  type AxiosLike,
} from "@pf/client";

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

function buildApp(): HonoApp {
  const objectStore = new InMemoryObjectStore();
  const eventStore = new InMemoryEventStore();
  const controller = new ResearchController(
    objectStore,
    eventStore,
    new TransitionEngine(),
    new ActionRegistry()
  );
  const provider = new DeterministicProvider({
    name: "protocol-contract-test",
    responses: [{ content: "ok", stopReason: "stop" }],
  });
  return createHonoApp(objectStore, controller, provider);
}

/** server 实际注册的全部 HTTP 路由（grep packages/server/src 的快照） */
const SERVER_ROUTES = new Set([
  "GET /", // SPA 静态入口（依赖前端 build 产物，非 API 契约，不入表）
  "GET /health",
  "GET /api/events",
  "POST /api/projects",
  "GET /api/projects",
  "GET /api/projects/:id",
  "PUT /api/projects/:id",
  "DELETE /api/projects/:id",
  "GET /api/projects/:id/hypotheses",
  "GET /api/projects/:id/evidence",
  "GET /api/projects/:id/knowledge",
  "GET /api/projects/:id/reports",
  "GET /api/projects/:id/all",
  "GET /api/projects/:id/papers",
  "GET /api/projects/:id/phases",
  "GET /api/projects/:id/phases/grouped",
  "GET /api/projects/:id/phases/:phaseName/versions",
  "GET /api/projects/:id/phases/:phaseName/compare",
  "GET /api/projects/:id/chain/:objectType/:objectId",
  "POST /api/projects/:id/phases/:runId/decision",
  "POST /api/projects/:id/phases/:phaseName/run",
  "GET /api/papers/:citationId",
  "POST /api/papers/:citationId/download-pdf",
  "POST /api/research/run",
  "POST /api/research/resume",
  "POST /api/research/stream",
  "GET /api/research/stream",
  "POST /api/research/:runId/stop",
  "GET /api/research/:runId/status",
  "POST /api/research/questions",
  "GET /api/research/:objectId",
  "PUT /api/research/:objectId",
  "DELETE /api/research/:objectId",
  "POST /api/agent/run",
  "POST /api/agent/stream",
]);

/** 契约表去重 + 与快照对齐（排除 SPA 入口） */
function contractRouteSet(): Set<string> {
  return new Set(ENDPOINTS.map((e) => `${e.method} ${e.path}`));
}

/** 路径参数填充为不存在的假 id → 单参数端点应 404-with-JSON（而非 500） */
const FAKE_PARAMS: Record<string, string> = {
  id: "proj-nonexistent",
  runId: "run-nonexistent",
  objectId: "obj-nonexistent",
  citationId: "cite-nonexistent",
  objectType: "Hypothesis",
  phaseName: "literature_review",
};

function fillPath(path: string): string {
  return path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, p: string) => FAKE_PARAMS[p] ?? "fake");
}

/** 各 POST/PUT 端点的合法请求体 */
const VALID_BODIES: Record<string, unknown> = {
  createProject: { name: "契约回归项目" },
  updateProject: { description: "契约回归更新" },
  submitPhaseDecision: { decision: "approve", feedback: "" },
  runPhase: { question: "契约回归问题" },
  startResearch: { question: "契约回归研究问题", mode: "auto" },
  resumeResearch: { projectId: "proj-nonexistent" },
  startResearchStream: { question: "契约回归流" },
  createResearchQuestion: { title: "契约回归标题" },
  updateResearchObject: { status: "DRAFT" },
  runAgent: { prompt: "契约回归 prompt" },
  streamAgent: { prompt: "契约回归 prompt" },
};

/** 必填 query 参数 */
const REQUIRED_QUERY: Record<string, string> = {
  getResearchStream: "?q=contract+test",
};

async function requestEndpoint(app: HonoApp, e: EndpointDef): Promise<Response> {
  const qs = REQUIRED_QUERY[e.name] ?? "";
  const init: RequestInit = { method: e.method };
  const body = VALID_BODIES[e.name];
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return app.request(fillPath(e.path) + qs, init);
}

/* ------------------------------------------------------------------ */
/*  1. 覆盖完整性                                                      */
/* ------------------------------------------------------------------ */

describe("protocol contract coverage", () => {
  it("契约表函数名唯一", () => {
    const names = ENDPOINTS.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("契约表与 server 注册路由一一对应（server 加端点未进契约 → 红）", () => {
    const expected = new Set([...SERVER_ROUTES].filter((r) => r !== "GET /"));
    expect(contractRouteSet()).toEqual(expected);
  });
});

/* ------------------------------------------------------------------ */
/*  2. 契约 ↔ 实现行为一致                                              */
/* ------------------------------------------------------------------ */

describe("endpoints match implementation", () => {
  const app = buildApp();

  for (const e of ENDPOINTS) {
    it(`${e.method} ${e.path}${e.sse ? " [sse]" : ""}`, async () => {
      const res = await requestEndpoint(app, e);

      // SSE 端点：200 + text/event-stream，不消费流（避免挂住），cancel 清理心跳
      if (e.sse) {
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        await res.body?.cancel();
        return;
      }

      // 普通端点：不炸 500
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
      if (res.status >= 400) {
        const body = (await res.json()) as { error?: { code: string; message: string } };
        expect(body.error?.code).toBeTruthy();
        expect(typeof body.error?.message).toBe("string");
      }
    });
  }

  it("GET /health 返回 200 ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("ok");
  });

  it("POST /api/projects → 201；GET /api/projects 含新建项目", async () => {
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "happy-path" }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const list = await app.request("/api/projects");
    const projects = (await list.json()) as Array<{ id: string }>;
    expect(projects.some((p) => p.id === id)).toBe(true);
  });

  it("POST /api/research/run → 202 秒回 runId（命令/事件分离契约）", async () => {
    const res = await app.request("/api/research/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "happy path 研究问题", mode: "auto" }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { runId: string; projectId: string; status: string };
    expect(body.runId).toBeTruthy();
    expect(body.projectId).toBeTruthy();
    expect(body.status).toBe("started");
  });

  it("GET 不存在的项目 → 404 统一 ApiError", async () => {
    const res = await app.request("/api/projects/definitely-missing");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("POST /api/agent/run → 200 同步结果", async () => {
    const res = await app.request("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello contract" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; result: string };
    expect(body.status).toBe("completed");
  });
});

/* ------------------------------------------------------------------ */
/*  3. 生成 SDK 消费者侧                                                */
/* ------------------------------------------------------------------ */

describe("generated SDK + adapters", () => {
  /** 记录调用的假 adapter */
  function recordingAdapter(): { adapter: ClientAdapter; calls: Array<{ path: string; init?: PfFetchInit }> } {
    const calls: Array<{ path: string; init?: PfFetchInit }> = [];
    return {
      calls,
      adapter: {
        fetch: (path, init) => {
          calls.push({ path, init });
          return Promise.resolve({});
        },
      },
    };
  }

  it("query 拼装：undefined 跳过、值 encodeURIComponent", async () => {
    const { adapter, calls } = recordingAdapter();
    await getEvents(adapter, { projectId: "p 1", lastEventId: 42 });
    expect(calls[0].path).toBe("/api/events?projectId=p%201&lastEventId=42");

    await getEvents(adapter);
    expect(calls[1].path).toBe("/api/events");
  });

  it("多路径参数端到端拼装", async () => {
    const { adapter, calls } = recordingAdapter();
    await getEvidenceChain(adapter, "proj 1", "Evidence", "ev/2");
    expect(calls[0].path).toBe("/api/projects/proj%201/chain/Evidence/ev%2F2");
    // GET 端点省略 init（adapter 默认 GET）
    expect(calls[0].init).toBeUndefined();
  });

  it("POST body 序列化 + Content-Type", async () => {
    const { adapter, calls } = recordingAdapter();
    await startResearch(adapter, { question: "sdk 测试", mode: "manual" });
    expect(calls[0].path).toBe("/api/research/run");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ question: "sdk 测试", mode: "manual" });
  });

  it("axiosAdapter：method/url/data 透传，data 解包返回", async () => {
    const configs: Array<Record<string, unknown>> = [];
    const fakeAxios: AxiosLike = {
      request: async (config) => {
        configs.push(config);
        return { data: { runId: "r1" } };
      },
    };
    const adapter = axiosAdapter(fakeAxios, "http://t:3001");
    const out = await startResearch(adapter, { question: "q" });
    expect(out).toEqual({ runId: "r1" });
    expect(configs[0]).toEqual({
      method: "POST",
      url: "http://t:3001/api/research/run",
      data: JSON.stringify({ question: "q" }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("fetchAdapter：baseUrl 拼接、JSON 解析、非 2xx 抛错", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/health")) {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("nope", { status: 404 });
    };
    const adapter = fetchAdapter("http://t:1", fakeFetch as typeof fetch);
    const health = await adapter.fetch("/health");
    expect(health).toEqual({ status: "ok" });
    expect(calls[0].url).toBe("http://t:1/health");
    await expect(adapter.fetch("/api/projects/x")).rejects.toThrow("HTTP 404");
  });

  it("subscribeEvents：URL 拼接（projectId 过滤 + baseUrl）、JSON 解析、退订 close", () => {
    class FakeEventSource {
      onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      closed = false;
      constructor(public url: string) {
        instances.push(this);
      }
      close() {
        this.closed = true;
      }
    }
    const instances: FakeEventSource[] = [];
    const received: string[] = [];
    const unsubscribe = subscribeEvents(
      "http://t:2",
      (e) => received.push(e.type),
      { projectId: "proj 1", eventSourceCtor: FakeEventSource }
    );

    expect(instances[0].url).toBe("http://t:2/api/events?projectId=proj%201");
    instances[0].onmessage?.({ data: JSON.stringify({ type: "run:start", data: { question: "q" } }) });
    instances[0].onmessage?.({ data: "{not-json" });
    expect(received).toEqual(["run:start"]);

    unsubscribe();
    expect(instances[0].closed).toBe(true);
  });
});
