import * as Effect from "effect/Effect";

import { Provider, Message, ToolDefinition } from "../provider";
import { ToolRegistry } from "../tools/registry";
import { ToolInput, ToolOutput } from "../tools/contracts";
import { getCognitiveModeByName } from "@pf/core/cognition/modes";

export type AgentEventType =
  | "thinking"
  | "tool:calling"
  | "tool:result"
  | "phase:start"
  | "phase:progress"
  | "phase:complete"
  | "message"
  | "user:interrupt"
  | "error"
  | "self:review"
  | "phase:approved"
  | "phase:rejected"
  | "phase:modified"
  | "phase:error";

export interface AgentEvent {
  type: AgentEventType;
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: ToolOutput;
  phase?: string;
  iteration?: number;
  timestamp: string;
  passed?: boolean;
  rounds?: number;
  issues?: Array<{ severity: "blocking" | "warning"; category: string; message: string }>;
}

export interface AgentLoopOptions {
  maxIterations?: number;
  onEvent?: (event: AgentEvent) => void;
  tools?: ReadonlyArray<ToolDefinition>;
  shouldStop?: () => boolean;
}

export interface AgentLoopResult {
  finalContent: string;
  messages: ReadonlyArray<Message>;
  toolCalls: ReadonlyArray<{ toolName: string; input: ToolInput; output: ToolOutput }>;
  events: AgentEvent[];
}

function emit(onEvent: AgentLoopOptions["onEvent"], event: AgentEvent) {
  onEvent?.(event);
}

export async function runAgentLoop(
  provider: Provider,
  toolRegistry: ToolRegistry,
  initialMessages: ReadonlyArray<Message>,
  options: AgentLoopOptions = {}
): Promise<AgentLoopResult> {
  const { maxIterations = 20, onEvent, tools, shouldStop } = options;
  const messages: Message[] = [...initialMessages];
  const toolCalls: Array<{ toolName: string; input: ToolInput; output: ToolOutput }> = [];
  const events: AgentEvent[] = [];
  const realEmit = (e: Omit<AgentEvent, "timestamp">): AgentEvent => {
    const event: AgentEvent = { ...e, timestamp: new Date().toISOString() };
    events.push(event);
    emit(onEvent, event);
    return event;
  };
  let iteration = 0;

  while (iteration < maxIterations) {
    if (shouldStop?.()) {
      realEmit({ type: "user:interrupt", content: "用户中断了 Agent" });
      return { finalContent: "用户中断", messages, toolCalls, events };
    }

    iteration++;

    realEmit({ type: "thinking", content: `第 ${iteration} 轮推理中...`, iteration });

    const responseOpt = await Effect.runPromise(
      Effect.either(provider.sendMessages(messages, { tools }))
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

    messages.push({
      role: "assistant",
      content: response.content || "",
    });

    for (const toolCall of response.toolCalls) {
      if (shouldStop?.()) {
        realEmit({ type: "user:interrupt", content: "用户中断了 Agent" });
        return { finalContent: "用户中断", messages, toolCalls, events };
      }

      realEmit({
        type: "tool:calling",
        content: `正在调用工具: ${toolCall.toolName}`,
        toolName: toolCall.toolName,
        toolArgs: toolCall.arguments,
      });

      const toolOutput = await Effect.runPromise(
        toolRegistry.execute(toolCall.toolName, toolCall.arguments)
      ).catch((err) => ({ content: `Error: ${err}` } as ToolOutput));

      realEmit({
        type: "tool:result",
        content: (toolOutput.content || "(empty)").substring(0, 2000),
        toolName: toolCall.toolName,
        toolResult: toolOutput,
      });

      toolCalls.push({
        toolName: toolCall.toolName,
        input: toolCall.arguments,
        output: toolOutput,
      });

      messages.push({
        role: "tool" as const,
        content: toolOutput.content || "",
      });
    }

    // Reflexion: after all tool results in this iteration, if iterations remain,
    // insert a reflection prompt using the REFLECT cognitive mode.
    if (iteration < maxIterations - 1) {
      const reflectInstruction = getCognitiveModeByName("REFLECT")?.instructions ?? "";

      messages.push({
        role: "user",
        content: `${reflectInstruction}

Reflect on the tool result above:
1. Is the result sufficient?
2. What can be improved?
3. What action should you take next?`,
      });

      realEmit({
        type: "thinking",
        content: "反思工具结果，规划下一步行动",
        iteration,
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
