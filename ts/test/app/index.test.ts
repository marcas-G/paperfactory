import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { createApp, loadConfig } from "@app/index";

describe("App", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "pf-app-test-"));
    process.env.PF_DATA_DIR = dataDir;
  });
  afterEach(() => {
    delete process.env.PF_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("initializes all layers", () => {
    const app = createApp();

    expect(app.objectStore).toBeDefined();
    expect(app.eventStore).toBeDefined();
    expect(app.controller).toBeDefined();
    expect(app.transitionEngine).toBeDefined();
    expect(app.actionRegistry).toBeDefined();
    expect(app.toolRegistry).toBeDefined();
    expect(app.tracer).toBeDefined();
    expect(app.metrics).toBeDefined();
    expect(app.evalFramework).toBeDefined();
    expect(app.hookSystem).toBeDefined();
    expect(app.honoApp).toBeDefined();
  });

  it("registers default tools", () => {
    const app = createApp();
    expect(app.toolRegistry.list().length).toBe(4); // search+code+filesystem+literature_search
    expect(app.toolRegistry.has("search")).toBe(true);
    expect(app.toolRegistry.has("code")).toBe(true);
    expect(app.toolRegistry.has("filesystem")).toBe(true);
  });

  it("registers default actions", () => {
    const app = createApp();
    expect(app.actionRegistry.list().length).toBe(24);
  });

  it("controller is wired with stores", () => {
    const app = createApp();
    expect(app.controller).toBeDefined();
  });

  it("loadConfig returns defaults", () => {
    const config = loadConfig();
    expect(typeof config.port).toBe("number");
    expect(config.sandboxBaseDir).toBe("/tmp/paperfactory");
  });

  it("createApp with custom config", () => {
    const app = createApp({
      port: 8080,
      llmModel: "custom-model",
    });
    expect(app).toBeDefined();
    expect(app.honoApp).toBeDefined();
  });
});
