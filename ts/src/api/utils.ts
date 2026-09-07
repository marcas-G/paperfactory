import { ToolDefinition } from "@runtime/provider";
import { ToolRegistry } from "@runtime/tools/registry";

export function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function buildToolDefs(registry: ToolRegistry): ReadonlyArray<ToolDefinition> {
  return registry.list().map((info) => ({
    name: info.name,
    description: info.description,
    parameters: info.schema ?? {
      type: "object",
      properties: {},
    },
  }));
}

export function lineDiff(a: string, b: string): Array<{ from: string; to: string }> {
  const baseLines = a.split("\n");
  const compareLines = b.split("\n");
  const changes: Array<{ from: string; to: string }> = [];
  const maxLen = Math.max(baseLines.length, compareLines.length);
  for (let j = 0; j < maxLen; j++) {
    const baseLine = j < baseLines.length ? baseLines[j] : undefined;
    const compareLine = j < compareLines.length ? compareLines[j] : undefined;
    if (baseLine !== compareLine) {
      changes.push({
        from: baseLine ?? "",
        to: compareLine ?? "",
      });
    }
  }
  return changes;
}
