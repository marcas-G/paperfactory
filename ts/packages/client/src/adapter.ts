/**
 * SDK 与传输层之间的薄接口——注入而非绑定具体 HTTP 库。
 *
 * - web：axiosAdapter(axios 实例)（axios 为可选 peer 依赖，本文件零静态 import）
 * - TUI / 桌面 / app：fetchAdapter(baseUrl)（全局 fetch）
 * - 测试 / 内嵌：直接实现 ClientAdapter
 */

export interface PfFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface ClientAdapter {
  /** 发送请求，返回解析后的响应体（JSON 已解包；错误语义由 adapter 定义） */
  fetch: (path: string, init?: PfFetchInit) => Promise<unknown>;
  /** 可选的 API 根前缀（如 "http://host:3001"）；同源 web 传 "" */
  baseUrl?: string;
}

/** axios 实例的最小结构接口——避免对 axios 的静态依赖 */
export interface AxiosLike {
  request(config: {
    method?: string;
    url?: string;
    data?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ data: unknown }>;
}

/** 用 axios 实例组装 adapter（web 用；axios 由调用方安装并传入） */
export function axiosAdapter(instance: AxiosLike, baseUrl = ""): ClientAdapter {
  return {
    baseUrl,
    fetch: async (path, init = {}) => {
      const res = await instance.request({
        method: init.method ?? "GET",
        url: baseUrl + path,
        data: init.body,
        headers: init.headers,
      });
      return res.data;
    },
  };
}

/** 用全局 fetch 组装 adapter（TUI / 桌面 / app 用） */
export function fetchAdapter(
  baseUrl = "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): ClientAdapter {
  return {
    baseUrl,
    fetch: async (path, init = {}) => {
      const res = await fetchImpl(baseUrl + path, {
        method: init.method ?? "GET",
        headers: init.headers,
        body: init.body,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error("HTTP " + res.status + ": " + text.slice(0, 200));
      }
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    },
  };
}
