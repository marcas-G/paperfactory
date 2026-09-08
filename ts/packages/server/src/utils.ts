import { ToolDefinition } from "@pf/core/runtime/provider";
import { ToolRegistry } from "@pf/core/runtime/tools/registry";

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

export function apiError(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

export function validateRequired(body: unknown, fields: string[]): { ok: boolean; errors: string[] } {
  if (!body || typeof body !== "object") {
    return { ok: false, errors: ["Request body must be a JSON object"] };
  }
  const errors: string[] = [];
  const bodyObj = body as Record<string, unknown>;
  for (const f of fields) {
    if (!(f in bodyObj) || bodyObj[f] === undefined || bodyObj[f] === null) {
      errors.push(`Missing required field: ${f}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateString(val: unknown, maxLen?: number): string | null {
  if (typeof val !== "string" || val.length === 0) return null;
  if (maxLen && val.length > maxLen) return null;
  return val;
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
