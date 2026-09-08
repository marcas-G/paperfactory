import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Chunk from "effect/Chunk";
import type { ClientOptions } from "openai";
import {
  MockProvider,
  StreamEvent,
  OpenAIProvider,
  OpenAIProviderConfig,
} from "@runtime/provider";

describe("MockProvider", () => {
  it("returns correct responses", async () => {
    const provider = new MockProvider([
      {
        pattern: "hello",
        response: {
          content: "Hello! How can I help?",
          stopReason: "end_turn",
        },
      },
    ]);

    const result = await Effect.runPromise(
      provider.sendMessages([{ role: "user", content: "hello world" }])
    );

    expect(result.content).toBe("Hello! How can I help?");
    expect(result.stopReason).toBe("end_turn");
  });

  it("returns default response when no pattern matches", async () => {
    const provider = new MockProvider([]);

    const result = await Effect.runPromise(
      provider.sendMessages([{ role: "user", content: "something" }])
    );

    expect(result.content).toBe("Default mock response");
    expect(result.stopReason).toBe("end_turn");
  });

  it("returns tool calls in response", async () => {
    const provider = new MockProvider([
      {
        pattern: "search",
        response: {
          content: "",
          stopReason: "tool_use",
          toolCalls: [
            {
              toolCallId: "tc1",
              toolName: "search",
              arguments: { query: "test" },
            },
          ],
        },
      },
    ]);

    const result = await Effect.runPromise(
      provider.sendMessages([{ role: "user", content: "search for papers" }])
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0].toolName).toBe("search");
  });

  it("streams events", async () => {
    const provider = new MockProvider([
      {
        pattern: "test",
        response: {
          content: "First word second word third",
          stopReason: "end_turn",
        },
      },
    ]);

    const stream = await Effect.runPromise(
      provider.streamResponse([{ role: "user", content: "test query" }])
    );

    const events = await Effect.runPromise(
      Stream.runCollect(stream).pipe(
        Effect.map(
          (chunk) => Chunk.toArray(chunk) as StreamEvent[]
        )
      )
    );
    expect(events.length).toBeGreaterThan(0);
    const lastEvent = events[events.length - 1] as StreamEvent;
    expect(lastEvent.type).toBe("stop");
  });
});

describe("OpenAIProvider", () => {
  it("creates with default config", async () => {
    const provider = new OpenAIProvider();
    expect(provider).toBeDefined();
  });

  it("creates with custom config", async () => {
    const provider = new OpenAIProvider({
      baseUrl: "http://localhost:8000/v1",
      apiKey: "test-key",
      model: "qwen2.5-7b-instruct",
    } as OpenAIProviderConfig);
    expect(provider).toBeDefined();
  });

  it("fails gracefully when no server available", async () => {
    const provider = new OpenAIProvider({
      baseUrl: "http://localhost:19999/v1",
      apiKey: "test-key",
      model: "test-model",
    });

    const result = await Effect.runPromiseExit(
      provider.sendMessages([{ role: "user", content: "Hello" }])
    );

    expect(result._tag).toBe("Failure");
  });

  it("streams fail gracefully when no server available", async () => {
    const provider = new OpenAIProvider({
      baseUrl: "http://localhost:19999/v1",
      apiKey: "test-key",
      model: "test-model",
    });

    const result = await Effect.runPromiseExit(
      provider.streamResponse([{ role: "user", content: "Hello" }])
    );

    expect(result._tag).toBe("Failure");
  });
});

describe("OpenAIProvider success paths (mocked HTTP)", () => {
  const BASE = "http://localhost:19999/v1";

  // Inject a fake fetch through OpenAIProviderConfig.fetch (the OpenAI SDK
  // resolves fetch at construction time, so globalThis mocking never applies)
  // and record every request — proves the provider really reaches the wire
  // and lets us assert the exact URL + payload.
  function withMockedFetch(handler: (url: string) => Promise<Response>) {
    const httpCalls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = ((url: any, init?: any) => {
      httpCalls.push({ url: String(url), init });
      return handler(String(url));
    }) as NonNullable<ClientOptions["fetch"]>;
    return { httpCalls, fetchImpl };
  }

  function makeProvider(fetchImpl: NonNullable<ClientOptions["fetch"]>): OpenAIProvider {
    return new OpenAIProvider({
      baseUrl: BASE,
      apiKey: "k",
      model: "mock-model",
      fetch: fetchImpl,
    });
  }

  it("sendMessages maps tool messages and options.tools onto the request", async () => {
    const { httpCalls, fetchImpl } = withMockedFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "chatcmpl-mock",
            object: "chat.completion",
            created: 1,
            model: "mock-model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Mock answer" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const provider = makeProvider(fetchImpl);
    const result = await Effect.runPromise(
      provider.sendMessages(
        [
          { role: "user", content: "hi" },
          { role: "tool", content: "tool result", toolCallId: "tc1" },
        ],
        {
          temperature: 0.7,
          maxTokens: 123,
          tools: [
            {
              name: "search",
              description: "Search the web",
              parameters: {
                type: "object",
                properties: { q: { type: "string" } },
              },
            },
          ],
        }
      )
    );

    expect(result.content).toBe("Mock answer");
    expect(result.stopReason).toBe("stop");
    expect(result.toolCalls).toBeUndefined();
    expect(httpCalls.length).toBe(1);
    expect(httpCalls[0].url).toContain("http://localhost:19999/v1/chat/completions");
    const body = JSON.parse(httpCalls[0].init.body as string);
    expect(body.messages[1]).toEqual({
      role: "tool",
      content: "tool result",
      tool_call_id: "tc1",
    });
    expect(body.tools[0].function.name).toBe("search");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(123);
  });

  it("sendMessages parses tool_calls with JSON arguments", async () => {
    const { httpCalls, fetchImpl } = withMockedFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "chatcmpl-mock",
            object: "chat.completion",
            created: 1,
            model: "mock-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "search",
                        arguments: JSON.stringify({ query: "ml" }),
                      },
                    },
                  ],
                },
                finish_reason: "tool_use",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const provider = makeProvider(fetchImpl);
    const result = await Effect.runPromise(
      provider.sendMessages([{ role: "user", content: "search" }])
    );

    expect(result.content).toBe("");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0]).toEqual({
      toolCallId: "call_1",
      toolName: "search",
      arguments: { query: "ml" },
    });
    expect(result.stopReason).toBe("tool_use");
    expect(httpCalls.length).toBe(1);
    expect(httpCalls[0].url).toContain("/chat/completions");
  });

  it("sendMessages fails when the response has no choices", async () => {
    const { httpCalls, fetchImpl } = withMockedFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "chatcmpl-mock",
            object: "chat.completion",
            created: 1,
            model: "mock-model",
            choices: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const provider = makeProvider(fetchImpl);
    const result = await Effect.runPromiseExit(
      provider.sendMessages([{ role: "user", content: "hi" }])
    );

    expect(result._tag).toBe("Failure");
    expect(httpCalls.length).toBe(1);
    expect(httpCalls[0].url).toContain("/chat/completions");
  });

  it("streamResponse turns SSE chunks into text/tool_use/stop events", async () => {
    const sseBody =
      [
        `data: ${JSON.stringify({
          id: "c1",
          object: "chat.completion.chunk",
          created: 1,
          model: "mock-model",
          choices: [
            { index: 0, delta: { role: "assistant", content: "Hello" }, finish_reason: null },
          ],
        })}`,
        `data: ${JSON.stringify({
          id: "c1",
          object: "chat.completion.chunk",
          created: 1,
          model: "mock-model",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: { name: "search", arguments: '{"q":"x"}' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          id: "c1",
          object: "chat.completion.chunk",
          created: 1,
          model: "mock-model",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        })}`,
        "data: [DONE]",
      ].join("\n\n") + "\n\n";

    const { httpCalls, fetchImpl } = withMockedFetch(() =>
      Promise.resolve(
        new Response(sseBody, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        })
      )
    );

    const provider = makeProvider(fetchImpl);
    const stream = await Effect.runPromise(
      provider.streamResponse([{ role: "user", content: "hi" }])
    );
    const events = await Effect.runPromise(
      Stream.runCollect(stream).pipe(Effect.map((chunk) => Chunk.toArray(chunk)))
    );

    const textEvents = events.filter((e) => e.type === "text");
    const toolEvents = events.filter((e) => e.type === "tool_use");
    const lastEvent = events[events.length - 1];
    expect(textEvents.some((e) => e.data === "Hello")).toBe(true);
    expect(toolEvents).toHaveLength(1);
    expect((toolEvents[0].data as { id: string }).id).toBe("call_1");
    expect(lastEvent).toEqual({ type: "stop", data: "stop" });
    expect(httpCalls.length).toBe(1);
    expect(httpCalls[0].url).toContain("/chat/completions");
  });

  it("streamResponse emits an empty text event when no content arrives", async () => {
    const sseBody =
      `data: ${JSON.stringify({
        id: "c1",
        object: "chat.completion.chunk",
        created: 1,
        model: "mock-model",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      })}\n\ndata: [DONE]\n\n`;

    const { fetchImpl } = withMockedFetch(() =>
      Promise.resolve(
        new Response(sseBody, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        })
      )
    );

    const provider = makeProvider(fetchImpl);
    const stream = await Effect.runPromise(
      provider.streamResponse([{ role: "user", content: "hi" }])
    );
    const events = await Effect.runPromise(
      Stream.runCollect(stream).pipe(Effect.map((chunk) => Chunk.toArray(chunk)))
    );

    expect(events[0]).toEqual({ type: "text", data: "" });
    expect(events[events.length - 1]).toEqual({ type: "stop", data: "stop" });
  });
});
