import { BaseTool, ToolInfo, ToolInput, ToolOutput } from "./contracts";
import * as Effect from "effect/Effect";

export class ToolRegistry {
  private tools = new Map<string, BaseTool>();
  private infos = new Map<string, ToolInfo>();

  register(tool: BaseTool, info: ToolInfo): void {
    this.tools.set(tool.name, tool);
    this.infos.set(tool.name, info);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getInfo(name: string): ToolInfo | undefined {
    return this.infos.get(name);
  }

  list(): ReadonlyArray<ToolInfo> {
    return Array.from(this.infos.values());
  }

  listReadTools(): ReadonlyArray<ToolInfo> {
    return this.list().filter((t) => !t.writeOnly);
  }

  listWriteTools(): ReadonlyArray<ToolInfo> {
    return this.list().filter((t) => t.writeOnly);
  }

  execute(name: string, input: ToolInput): Effect.Effect<ToolOutput, string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return Effect.fail(`Tool not found: ${name}`);
    }
    return tool.execute(input);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  unregister(name: string): boolean {
    const toolRemoved = this.tools.delete(name);
    const infoRemoved = this.infos.delete(name);
    return toolRemoved && infoRemoved;
  }
}
