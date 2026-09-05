import * as Effect from "effect/Effect";
import type { Stream } from "effect/Stream";
import * as StreamNS from "effect/Stream";
import OpenAI from "openai";

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
}

export interface ProviderResponse {
  content: string;
  toolCalls?: ReadonlyArray<ToolCallRequest>;
  stopReason: string;
}

export interface ToolCallRequest {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface StreamEvent {
  type: "text" | "tool_use" | "stop";
  data: unknown;
}

export interface Provider {
  sendMessages(
    messages: ReadonlyArray<Message>,
    options?: ProviderOptions
  ): Effect.Effect<ProviderResponse, string>;
  streamResponse(
    messages: ReadonlyArray<Message>,
    options?: ProviderOptions
  ): Effect.Effect<Stream<StreamEvent, never>, string>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ReadonlyArray<ToolDefinition>;
}

export interface OpenAIProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export class OpenAIProvider implements Provider {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIProviderConfig = {}) {
    this.model = config.model ?? "qwen2.5-7b-instruct";
    this.client = new OpenAI({
      baseURL: config.baseUrl ?? "http://localhost:8011/v1",
      apiKey: config.apiKey ?? "not-needed",
    });
  }

  sendMessages(
    messages: ReadonlyArray<Message>,
    options?: ProviderOptions
  ): Effect.Effect<ProviderResponse, string> {
    return Effect.tryPromise({
      try: async () => {
        const openaiMessages: Array<OpenAI.ChatCompletionMessageParam> = messages.map(
          (m) => {
            if (m.role === "tool") {
              return {
                role: "tool" as const,
                content: m.content,
                tool_call_id: m.toolCallId,
              };
            }
            return {
              role: m.role as "user" | "assistant" | "system",
              content: m.content,
            };
          }
        );

        const openaiTools = options?.tools?.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters ?? {
              type: "object",
              properties: {},
            },
          },
        }));

        const response = await this.client.chat.completions.create({
          model: options?.model ?? this.model,
          messages: openaiMessages,
          temperature: options?.temperature ?? 0,
          max_tokens: options?.maxTokens ?? 4096,
          ...(openaiTools && openaiTools.length > 0 ? { tools: openaiTools } : {}),
        });

        const choice = response.choices[0];
        if (!choice) {
          throw new Error("No choices in response");
        }

        const content = choice.message.content ?? "";
        const toolCalls = choice.message.tool_calls
          ?.map((tc) => ({
            toolCallId: tc.id,
            toolName: tc.function.name,
            arguments: tc.function.arguments
              ? JSON.parse(tc.function.arguments)
              : {},
          }))
          .filter((tc): tc is ToolCallRequest => tc !== null) ?? [];

        return {
          content,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          stopReason: choice.finish_reason ?? "stop",
        };
      },
      catch: (error) => String(error),
    });
  }

  streamResponse(
    messages: ReadonlyArray<Message>,
    options?: ProviderOptions
  ): Effect.Effect<Stream<StreamEvent, never>, string> {
    return Effect.tryPromise({
      try: async () => {
        const openaiMessages: Array<OpenAI.ChatCompletionMessageParam> = messages.map(
          (m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          })
        );

        const stream = await this.client.chat.completions.create({
          model: options?.model ?? this.model,
          messages: openaiMessages,
          temperature: options?.temperature ?? 0,
          max_tokens: options?.maxTokens ?? 4096,
          stream: true,
        });

        const events: StreamEvent[] = [];
        let fullContent = "";
        let finishReason = "stop";

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            events.push({ type: "text", data: delta.content });
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              events.push({ type: "tool_use", data: tc });
            }
          }
          if (chunk.choices[0]?.finish_reason) {
            finishReason = chunk.choices[0].finish_reason;
          }
        }

        if (fullContent.length === 0) {
          events.push({ type: "text", data: "" });
        }
        events.push({ type: "stop", data: finishReason });

        return StreamNS.fromIterable(
          events.length > 0
            ? events
            : [{ type: "stop", data: "end_turn" }]
        );
      },
      catch: (error) => String(error),
    });
  }
}

export class MockProvider implements Provider {
  constructor(
    readonly responses: Array<{
      pattern: string;
      response: ProviderResponse;
    }> = []
  ) {}

  sendMessages(
    messages: ReadonlyArray<Message>,
    _options?: ProviderOptions
  ): Effect.Effect<ProviderResponse, string> {
    const lastMessage = messages[messages.length - 1];
    const matched = this.responses.find((r) =>
      lastMessage.content.includes(r.pattern)
    );
    if (matched) {
      return Effect.succeed(matched.response);
    }
    return Effect.succeed({
      content: "Default mock response",
      stopReason: "end_turn",
    });
  }

  streamResponse(
    messages: ReadonlyArray<Message>,
    _options?: ProviderOptions
  ): Effect.Effect<Stream<StreamEvent, never>, string> {
    const lastMessage = messages[messages.length - 1];
    const matched = this.responses.find((r) =>
      lastMessage.content.includes(r.pattern)
    );
    const response = matched?.response ?? {
      content: "Default mock response",
      stopReason: "end_turn",
    };

    const events: StreamEvent[] = [];
    const words = response.content.split(" ");
    for (const word of words) {
      events.push({ type: "text", data: word + " " });
    }
    if (response.toolCalls) {
      for (const tc of response.toolCalls) {
        events.push({ type: "tool_use", data: tc });
      }
    }
    events.push({ type: "stop", data: response.stopReason });

    return Effect.succeed(
      StreamNS.fromIterable(
        events.length > 0
          ? events
          : [{ type: "stop", data: "end_turn" }]
      )
    );
  }
}
