import * as Effect from "effect/Effect";

export interface BaseTool {
  name: string;
  description: string;
  execute(input: ToolInput): Effect.Effect<ToolOutput, string>;
}

export interface ToolInfo {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  writeOnly: boolean;
}

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface ToolResponse {
  toolCallId: string;
  result: ToolOutput;
}

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  content: string;
  [key: string]: unknown;
}
