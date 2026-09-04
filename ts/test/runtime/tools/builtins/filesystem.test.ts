import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import {
  InMemoryFilesystem,
  createFilesystemTool,
} from "@runtime/tools/builtins/filesystem";

describe("InMemoryFilesystem", () => {
  it("reads a file", () => {
    const fs = new InMemoryFilesystem();
    fs.write("/test.txt", "hello");
    expect(fs.read("/test.txt")).toBe("hello");
  });

  it("returns null for missing file", () => {
    const fs = new InMemoryFilesystem();
    expect(fs.read("/missing.txt")).toBeNull();
  });

  it("lists directory entries", () => {
    const fs = new InMemoryFilesystem();
    fs.write("/dir/a.txt", "a");
    fs.write("/dir/b.txt", "b");
    fs.write("/other.txt", "c");

    const entries = fs.list("/dir");
    expect(entries).toContain("a.txt");
    expect(entries).toContain("b.txt");
    expect(entries).not.toContain("other.txt");
  });
});

describe("createFilesystemTool", () => {
  it("reads a file", async () => {
    const fs = new InMemoryFilesystem();
    fs.write("/readme.txt", "file content");
    const tool = createFilesystemTool(fs);

    const result = await Effect.runPromise(
      tool.execute({ operation: "read", path: "/readme.txt" })
    );

    expect(result.content).toBe("file content");
  });

  it("writes a file", async () => {
    const fs = new InMemoryFilesystem();
    const tool = createFilesystemTool(fs);

    const result = await Effect.runPromise(
      tool.execute({
        operation: "write",
        path: "/new.txt",
        data: "written",
      })
    );

    expect(result.content).toBe("Wrote /new.txt");
    expect(fs.read("/new.txt")).toBe("written");
  });

  it("lists directory", async () => {
    const fs = new InMemoryFilesystem();
    fs.write("/dir/file1.txt", "a");
    fs.write("/dir/file2.txt", "b");
    const tool = createFilesystemTool(fs);

    const result = await Effect.runPromise(
      tool.execute({ operation: "list", path: "/dir" })
    );

    const entries = JSON.parse(result.content);
    expect(entries).toContain("file1.txt");
    expect(entries).toContain("file2.txt");
  });

  it("reports missing file on read", async () => {
    const fs = new InMemoryFilesystem();
    const tool = createFilesystemTool(fs);

    const result = await Effect.runPromise(
      tool.execute({ operation: "read", path: "/missing.txt" })
    );

    expect(result.content).toContain("File not found");
  });

  it("reports unknown operation", async () => {
    const fs = new InMemoryFilesystem();
    const tool = createFilesystemTool(fs);

    const result = await Effect.runPromise(
      tool.execute({ operation: "unknown", path: "/x.txt" })
    );

    expect(result.content).toContain("Unknown operation");
  });
});
