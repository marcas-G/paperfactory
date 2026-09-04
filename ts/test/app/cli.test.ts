import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import { runCLI, initCommand, researchCommand } from "@app/cli";
import { createApp } from "@app/index";

describe("CLI", () => {
  it("shows usage for unknown command", async () => {
    await runCLI(["unknown-command"]);
  });

  it("init command runs", async () => {
    await runCLI(["init"]);
  });

  it("status command runs", async () => {
    await runCLI(["status"]);
  });

  it("test command runs", async () => {
    await runCLI(["test"]);
  });

  it("empty args shows usage", async () => {
    await runCLI([]);
  });
});

describe("CLI init command", () => {
  let _logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("init creates a ResearchQuestion in the object store", async () => {
    const app = createApp();
    await initCommand("What causes Alzheimer's disease?", app);

    const questions = await Effect.runPromise(app.objectStore.list("ResearchQuestion"));
    expect(questions.length).toBeGreaterThan(0);
  });

  it("init creates a Project in the object store", async () => {
    const app = createApp();
    await initCommand("What causes X?", app);

    const projects = await Effect.runPromise(app.objectStore.list("Project"));
    expect(projects.length).toBeGreaterThan(0);
  });

  it("init stores the user question in the title", async () => {
    const app = createApp();
    await initCommand("What causes X?", app);

    const questions = await Effect.runPromise(app.objectStore.list("ResearchQuestion"));
    const q = questions[0] as Record<string, unknown>;
    expect(q.title).toContain("X");
  });

  it("init generates real UUIDs (not zero UUID)", async () => {
    const app = createApp();
    await initCommand("What causes X?", app);

    const questions = await Effect.runPromise(app.objectStore.list("ResearchQuestion"));
    const q = questions[0] as Record<string, unknown>;
    expect(q.questionId).not.toBe("00000000-0000-4000-a000-000000000000");
    expect(q.projectId).not.toBe("00000000-0000-4000-a000-000000000000");
  });

  it("init creates question with DRAFT status", async () => {
    const app = createApp();
    await initCommand("What causes X?", app);

    const questions = await Effect.runPromise(app.objectStore.list("ResearchQuestion"));
    const q = questions[0] as Record<string, unknown>;
    expect(q.status).toBe("DRAFT");
  });

  it("init links question to the created project", async () => {
    const app = createApp();
    await initCommand("What causes X?", app);

    const questions = await Effect.runPromise(app.objectStore.list("ResearchQuestion"));
    const projects = await Effect.runPromise(app.objectStore.list("Project"));
    const q = questions[0] as Record<string, unknown>;
    const p = projects[0] as Record<string, unknown>;
    expect(q.projectId).toBe(p.projectId);
  });
});

describe("CLI research command", () => {
  let _logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("research creates a ResearchQuestion in the store", async () => {
    const app = createApp();
    await researchCommand("Does exercise improve memory?", app);

    const questions = await Effect.runPromise(app.objectStore.list("ResearchQuestion"));
    expect(questions.length).toBeGreaterThan(0);
  });

  it("research stores the question text", async () => {
    const app = createApp();
    await researchCommand("Does exercise improve memory?", app);

    const questions = await Effect.runPromise(app.objectStore.list("ResearchQuestion"));
    const q = questions[0] as Record<string, unknown>;
    expect(q.title).toContain("memory");
  });

  it("research generates real UUIDs", async () => {
    const app = createApp();
    await researchCommand("Does exercise improve memory?", app);

    const questions = await Effect.runPromise(app.objectStore.list("ResearchQuestion"));
    const q = questions[0] as Record<string, unknown>;
    expect(q.questionId).not.toBe("00000000-0000-4000-a000-000000000000");
  });

  it("research produces a workflow result", async () => {
    const app = createApp();
    const result = await researchCommand("Does exercise improve memory?", app);

    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
  });
});
