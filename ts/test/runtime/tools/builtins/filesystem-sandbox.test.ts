import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  SandboxedFilesystem,
  createSandboxedFilesystemTool,
} from "@runtime/tools/builtins/filesystem";
import * as Effect from "effect/Effect";

describe("SandboxedFilesystem", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperfactory-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("reads a file", async () => {
    const sandbox = new SandboxedFilesystem({ baseDir: tempDir });
    const testFile = path.join(tempDir, "test.txt");
    await fs.writeFile(testFile, "hello world");

    const content = await sandbox.readFile("test.txt");
    expect(content).toBe("hello world");
  });

  it("writes a file", async () => {
    const sandbox = new SandboxedFilesystem({ baseDir: tempDir });
    const result = await sandbox.writeFile("new.txt", "content here");

    expect(result).toBe("Wrote new.txt");
    const fileContent = await fs.readFile(
      path.join(tempDir, "new.txt"),
      "utf-8"
    );
    expect(fileContent).toBe("content here");
  });

  it("lists a directory", async () => {
    await fs.writeFile(path.join(tempDir, "a.txt"), "");
    await fs.writeFile(path.join(tempDir, "b.txt"), "");

    const sandbox = new SandboxedFilesystem({ baseDir: tempDir });
    const entries = await sandbox.listDirectory(".");

    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries).toContain("a.txt");
    expect(entries).toContain("b.txt");
  });

  it("creates a directory", async () => {
    const sandbox = new SandboxedFilesystem({ baseDir: tempDir });
    const result = await sandbox.createDirectory("subdir");

    expect(result).toBe("Created directory subdir");
    const stat = await fs.stat(path.join(tempDir, "subdir"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("deletes a file", async () => {
    const testFile = path.join(tempDir, "delete-me.txt");
    await fs.writeFile(testFile, "temp");

    const sandbox = new SandboxedFilesystem({ baseDir: tempDir });
    const result = await sandbox.deleteFile("delete-me.txt");

    expect(result).toBe("Deleted delete-me.txt");
    await expect(fs.stat(testFile)).rejects.toThrow();
  });

  it("prevents path escape", async () => {
    const sandbox = new SandboxedFilesystem({ baseDir: tempDir });
    await expect(sandbox.readFile("../etc/passwd")).rejects.toThrow(
      "outside sandbox"
    );
  });

  it("respects allowed operations", async () => {
    const sandbox = new SandboxedFilesystem({
      baseDir: tempDir,
      allowedOperations: ["read"],
    });

    expect(sandbox.canPerform("read")).toBe(true);
    expect(sandbox.canPerform("write")).toBe(false);
  });

  describe("createSandboxedFilesystemTool", () => {
    it("executes read operation", async () => {
      const sandbox = new SandboxedFilesystem({ baseDir: tempDir });
      await fs.writeFile(path.join(tempDir, "test.txt"), "readme");

      const tool = createSandboxedFilesystemTool(sandbox);
      const result = await Effect.runPromise(
        tool.execute({
          operation: "read",
          path: "test.txt",
        })
      );

      expect(result.content).toBe("readme");
    });

    it("executes write operation", async () => {
      const sandbox = new SandboxedFilesystem({ baseDir: tempDir });
      const tool = createSandboxedFilesystemTool(sandbox);

      const result = await Effect.runPromise(
        tool.execute({
          operation: "write",
          path: "tool-written.txt",
          data: "tool data",
        })
      );

      expect(result.content).toBe("Wrote tool-written.txt");
    });

    it("rejects disallowed operation", async () => {
      const sandbox = new SandboxedFilesystem({
        baseDir: tempDir,
        allowedOperations: ["read"],
      });
      const tool = createSandboxedFilesystemTool(sandbox);

      const result = await Effect.runPromise(
        tool.execute({
          operation: "write",
          path: "test.txt",
          data: "x",
        })
      );

      expect(result.content).toContain("not allowed");
    });
  });
});
