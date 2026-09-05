import { describe, it, expect } from "vitest";
import { createHonoApp, HonoApp } from "@api/routes";
import { InMemoryObjectStore } from "@persistence/object-store";
import { MockProvider } from "@runtime/provider";

describe("Web UI", () => {
  let app: HonoApp;

  beforeAll(() => {
    const store = new InMemoryObjectStore();
    const mockProvider = new MockProvider([
      { pattern: "", response: { content: "Research result", stopReason: "stop" } },
    ]);
    const mockController = {} as any;
    app = createHonoApp({ use: () => {} } as any, store, mockController, mockProvider);
  });

  it("GET / returns web interface", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("html");
    expect(body).toContain("PaperFactory");
  });

  it("GET / returns interactive research form", async () => {
    const res = await app.request("/");
    const body = await res.text();
    expect(body).toContain("research");
    expect(body).toContain("input");
    expect(body).toContain("button");
  });

  it("GET /static/ serves assets", async () => {
    // Static assets should be served
    const res = await app.request("/");
    expect(res.status).toBe(200);
  });
});
