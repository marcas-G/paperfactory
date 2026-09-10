import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { Provider, Message, ToolDefinition, ProviderResponse, StreamEvent } from "../provider";
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

/** REQ-REC5 预算刹车：LLM/工具超时 + 工具输出回填截断（防上下文爆炸与失控烧钱）。 */
const LLM_TIMEOUT_MS = Number(process.env.AGENT_LLM_TIMEOUT_MS ?? 120_000);
const TOOL_TIMEOUT_MS = Number(process.env.AGENT_TOOL_TIMEOUT_MS ?? 30_000);
const TOOL_OUTPUT_MAX_CHARS = Number(process.env.AGENT_TOOL_OUTPUT_MAX_CHARS ?? 8_000);

function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | { content: string }> {
  return Promise.race([
    promise,
    new Promise<{ content: string }>((resolve) =>
      setTimeout(() => resolve({ content: `Error: ${label} timed out after ${ms}ms` }), ms),
    ),
  ]);
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

    // 方案A：流式 LLM 调用——逐 token 发 thinking 事件，消灭"90 秒黑洞"
    // 优先用 streamResponse；不支持时降级 sendMessages（行为不变）
    let response: ProviderResponse | undefined;
    try {
      const stream = await Effect.runPromise(provider.streamResponse(messages, { tools }));
      let text = "";
      const toolCalls: Array<{ toolCallId: string; toolName: string; arguments: Record<string, unknown> }> = [];
      let stopReason = "";

      // 逐 token 收集，有新文本就 emit（TUI 端看到 thinking 行实时更新）
      const processed = await Effect.runPromise(
        Stream.runForEach(stream, (event: StreamEvent) =>
          Effect.sync(() => {
            if (event.type === "text") {
              text += String(event.data);
              realEmit({ type: "thinking", content: text.slice(-80), iteration });
            } else if (event.type === "tool_use") {
              const tc = event.data as { id?: string; toolCallId?: string; name?: string; toolName?: string; arguments: Record<string, unknown> };
              toolCalls.push({
                toolCallId: tc.toolCallId ?? tc.id ?? "",
                toolName: tc.toolName ?? tc.name ?? "",
                arguments: tc.arguments,
              });
            } else if (event.type === "stop") {
              stopReason = String(event.data);
            }
          }),
        ),
      );

      response = {
        content: text.trim(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        stopReason,
      };
    } catch {
      // streamResponse 不可用（provider 不支持或网络问题），降级 sendMessages
      realEmit({ type: "thinking", content: `第 ${iteration} 轮推理中（等待响应）...`, iteration });
      const responseOpt = await raceTimeout(
        Effect.runPromise(Effect.either(provider.sendMessages(messages, { tools }))),
        LLM_TIMEOUT_MS,
        "LLM call",
      );

      if (!("_tag" in responseOpt)) {
        const err = `Error: ${(responseOpt as { content: string }).content}`;
        realEmit({ type: "error", content: err });
        messages.push({ role: "assistant", content: err });
        return { finalContent: err, messages, toolCalls, events };
      }
      if (responseOpt._tag === "Left") {
        const err = `Error: ${responseOpt.left}`;
        realEmit({ type: "error", content: err });
        messages.push({ role: "assistant", content: err });
        return { finalContent: err, messages, toolCalls, events };
      }
      response = responseOpt.right;
    }

    if (!response) {
      realEmit({ type: "error", content: "LLM returned no response" });
      return { finalContent: "error", messages, toolCalls, events };
    }

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

      // REC5: 工具执行超时刹车
      const toolOutput = (await raceTimeout(
        Effect.runPromise(toolRegistry.execute(toolCall.toolName, toolCall.arguments)),
        TOOL_TIMEOUT_MS,
        `tool ${toolCall.toolName}`,
      ).catch((err) => ({ content: `Error: ${err}` }))) as ToolOutput;

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

      // REC5: 工具输出回填截断（事件已截 2000，这里防喂模型的上下文爆炸）
      const rawToolContent = toolOutput.content || "";
      messages.push({
        role: "tool" as const,
        content:
          rawToolContent.length > TOOL_OUTPUT_MAX_CHARS
            ? `${rawToolContent.slice(0, TOOL_OUTPUT_MAX_CHARS)}\n[output truncated at ${TOOL_OUTPUT_MAX_CHARS} chars]`
            : rawToolContent,
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
