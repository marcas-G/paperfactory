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
