import * as Effect from "effect/Effect";

import { Provider, Message,  } from "../provider";
import { ToolRegistry } from "../tools/registry";
import { ToolInput, ToolOutput } from "../tools/contracts";

export interface AgentLoopResult {
  finalContent: string;
  messages: ReadonlyArray<Message>;
  toolCalls: ReadonlyArray<{ toolName: string; input: ToolInput; output: ToolOutput }>;
}

export async function runAgentLoop(
  provider: Provider,
  toolRegistry: ToolRegistry,
  initialMessages: ReadonlyArray<Message>,
  maxIterations: number = 20
): Promise<AgentLoopResult> {
  const messages: Message[] = [...initialMessages];
  const toolCalls: Array<{ toolName: string; input: ToolInput; output: ToolOutput }> = [];
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    const responseOpt = await Effect.runPromise(
      Effect.either(provider.sendMessages(messages))
    );

    if (responseOpt._tag === "Left") {
      messages.push({
        role: "assistant",
        content: `Error: ${responseOpt.left}`,
      });
      return {
        finalContent: `Error: ${responseOpt.left}`,
        messages,
        toolCalls,
      };
    }

    const response = responseOpt.right;

    if (!response.toolCalls || response.toolCalls.length === 0) {
      messages.push({
        role: "assistant",
        content: response.content,
      });
      return {
        finalContent: response.content,
        messages,
        toolCalls,
      };
    }

    for (const toolCall of response.toolCalls) {
      const toolOutput = await Effect.runPromise(
        toolRegistry.execute(toolCall.toolName, toolCall.arguments)
      ).catch((err) => ({ content: `Error: ${err}` } as ToolOutput));

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

  return {
    finalContent: "Max iterations reached",
    messages,
    toolCalls,
  };
}
