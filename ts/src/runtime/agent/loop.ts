import * as Effect from "effect/Effect";

import { Provider, Message } from "../provider";
import { ToolRegistry } from "../tools/registry";
import { ToolInput, ToolOutput } from "../tools/contracts";

export type AgentEventType =
  | "thinking"         // Agent 正在思考
  | "tool:calling"     // 正在调用工具
  | "tool:result"      // 工具返回结果
  | "phase:start"      // 阶段开始
  | "phase:progress"   // 阶段进展
  | "phase:complete"   // 阶段完成
  | "message"          // Agent 说话
  | "error";           // 错误

export interface AgentEvent {
  type: AgentEventType;
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: ToolOutput;
  phase?: string;
  iteration?: number;
  timestamp: string;
}

export interface AgentLoopOptions {
  maxIterations?: number;
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentLoopResult {
  finalContent: string;
  messages: ReadonlyArray<Message>;
  toolCalls: ReadonlyArray<{ toolName: string; input: ToolInput; output: ToolOutput }>;
  events: AgentEvent[];
}

function emit(onEvent: AgentLoopOptions["onEvent"], event: AgentEvent) {
  event.timestamp = new Date().toISOString();
  onEvent?.(event);
}

export async function runAgentLoop(
  provider: Provider,
  toolRegistry: ToolRegistry,
  initialMessages: ReadonlyArray<Message>,
  options: AgentLoopOptions = {}
): Promise<AgentLoopResult> {
  const { maxIterations = 20, onEvent } = options;
  const messages: Message[] = [...initialMessages];
  const toolCalls: Array<{ toolName: string; input: ToolInput; output: ToolOutput }> = [];
  const events: AgentEvent[] = [];
  const realEmit = (e: AgentEvent) => { events.push(e); emit(onEvent, e); };
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    realEmit({ type: "thinking", content: `第 ${iteration} 轮推理中...`, iteration });

    const responseOpt = await Effect.runPromise(
      Effect.either(provider.sendMessages(messages))
    );

    if (responseOpt._tag === "Left") {
      const err = `Error: ${responseOpt.left}`;
      realEmit({ type: "error", content: err });
      messages.push({ role: "assistant", content: err });
      return { finalContent: err, messages, toolCalls, events };
    }

    const response = responseOpt.right;

    if (!response.toolCalls || response.toolCalls.length === 0) {
      const content = response.content;
      realEmit({ type: "message", content, iteration });
      messages.push({ role: "assistant", content });
      return { finalContent: content, messages, toolCalls, events };
    }

    for (const toolCall of response.toolCalls) {
      realEmit({
        type: "tool:calling",
        content: `调用工具: ${toolCall.toolName}`,
        toolName: toolCall.toolName,
        toolArgs: toolCall.arguments,
      });

      const toolOutput = await Effect.runPromise(
        toolRegistry.execute(toolCall.toolName, toolCall.arguments)
      ).catch((err) => ({ content: `Error: ${err}` } as ToolOutput));

      realEmit({
        type: "tool:result",
        content: toolOutput.content || "(empty)",
        toolName: toolCall.toolName,
        toolResult: toolOutput,
      });

      toolCalls.push({
        toolName: toolCall.toolName,
        input: toolCall.arguments,
        output: toolOutput,
      });

      messages.push({
        role: "user",
        content: JSON.stringify({
          toolCallId: toolCall.toolCallId,
          result: toolOutput.content,
        }),
      });
    }
  }

  realEmit({ type: "error", content: "达到最大迭代次数" });
  return {
    finalContent: "达到最大迭代次数",
    messages,
    toolCalls,
    events,
  };
}
