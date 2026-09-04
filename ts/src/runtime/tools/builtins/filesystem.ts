import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BaseTool, ToolInput, ToolOutput } from "../contracts";
import * as Effect from "effect/Effect";

export class InMemoryFilesystem {
  constructor(readonly files: Map<string, string> = new Map()) {}

  read(filepath: string): string | null {
    return this.files.get(filepath) ?? null;
  }

  write(filepath: string, content: string): void {
    this.files.set(filepath, content);
  }

  list(directory: string): ReadonlyArray<string> {
    const prefix = directory.endsWith("/") ? directory : directory + "/";
    return Array.from(this.files.keys())
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.substring(prefix.length));
  }
}

export function createFilesystemTool(
  filesystem: InMemoryFilesystem
): BaseTool {
  return {
    name: "filesystem",
    description:
      "Read, write, and list files in an in-memory filesystem",
    execute: (input: ToolInput): Effect.Effect<ToolOutput, string> =>
      Effect.sync(() => {
        const operation = input.operation as string;
        const filepath = (input.path as string) ?? "";

        switch (operation) {
          case "read": {
            const content = filesystem.read(filepath);
            if (content === null) {
              return { content: `File not found: ${filepath}` } as ToolOutput;
            }
            return { content } as ToolOutput;
          }
          case "write": {
            const data = input.data as string;
            filesystem.write(filepath, data ?? "");
            return { content: `Wrote ${filepath}` } as ToolOutput;
          }
          case "list": {
            const entries = filesystem.list(filepath);
            return { content: JSON.stringify(entries) } as ToolOutput;
          }
          default:
            return {
              content: `Unknown operation: ${operation}`,
            } as ToolOutput;
        }
      }),
  };
}

export interface SandboxedFilesystemConfig {
  baseDir: string;
  allowedOperations?: ReadonlyArray<string>;
}

export class SandboxedFilesystem {
  private baseDir: string;
  private allowedOps: ReadonlyArray<string>;

  constructor(config: SandboxedFilesystemConfig) {
    this.baseDir = path.resolve(config.baseDir);
    this.allowedOps =
      config.allowedOperations ?? [
        "read",
        "write",
        "list",
        "createDirectory",
        "delete",
      ];
  }

  private resolvePath(requestedPath: string): string {
    const resolved = path.resolve(this.baseDir, requestedPath);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error(
        `Path escape attempt: ${requestedPath} resolves outside sandbox`
      );
    }
    return resolved;
  }

  async readFile(requestedPath: string): Promise<string> {
    const targetPath = this.resolvePath(requestedPath);
    return fs.readFile(targetPath, "utf-8");
  }

  async writeFile(
    requestedPath: string,
    content: string
  ): Promise<string> {
    const targetPath = this.resolvePath(requestedPath);
    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(targetPath, content, "utf-8");
    return `Wrote ${requestedPath}`;
  }

  async listDirectory(requestedPath: string): Promise<ReadonlyArray<string>> {
    const targetPath = this.resolvePath(requestedPath);
    return fs.readdir(targetPath);
  }

  async createDirectory(requestedPath: string): Promise<string> {
    const targetPath = this.resolvePath(requestedPath);
    await fs.mkdir(targetPath, { recursive: true });
    return `Created directory ${requestedPath}`;
  }

  async deleteFile(requestedPath: string): Promise<string> {
    const targetPath = this.resolvePath(requestedPath);
    await fs.unlink(targetPath);
    return `Deleted ${requestedPath}`;
  }

  canPerform(operation: string): boolean {
    return this.allowedOps.includes(operation);
  }
}

export function createSandboxedFilesystemTool(
  sandbox: SandboxedFilesystem
): BaseTool {
  const execFn = async (
    input: ToolInput
  ): Promise<ToolOutput> => {
    const operation = input.operation as string;
    const filepath = (input.path as string) ?? "";
    const data = input.data as string;

    if (!sandbox.canPerform(operation)) {
      return { content: `Operation not allowed: ${operation}` };
    }

    switch (operation) {
      case "read":
        return { content: await sandbox.readFile(filepath) };
      case "write":
        return {
          content: await sandbox.writeFile(filepath, data ?? ""),
        };
      case "list":
        return {
          content: JSON.stringify(await sandbox.listDirectory(filepath)),
        };
      case "createDirectory":
        return {
          content: await sandbox.createDirectory(filepath),
        };
      case "delete":
        return { content: await sandbox.deleteFile(filepath) };
      default:
        return { content: `Unknown operation: ${operation}` };
    }
  };

  return {
    name: "filesystem_sandbox",
    description:
      "Sandboxed filesystem operations restricted to a base directory",
    execute: (input: ToolInput): Effect.Effect<ToolOutput, string> =>
      Effect.tryPromise({
        try: () => execFn(input),
        catch: (error) => String(error),
      }),
  };
}
