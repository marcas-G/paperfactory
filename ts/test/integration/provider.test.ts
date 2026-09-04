import { describe, it, expect, afterEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Chunk from "effect/Chunk";
import { createServer } from "node:http";
import { OpenAIProvider, StreamEvent } from "@runtime/provider";

describe("OpenAIProvider Integration", () => {
  let server: ReturnType<typeof createServer>;
  const port = 19876;

  afterEach(() => {
    server?.close();
  });

  it("sends messages to OpenAI-compatible endpoint", async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1234567890,
          model: "test-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "Test response from mock server",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        })
      );
    });
    server.listen(port);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));

    const provider = new OpenAIProvider({
      baseUrl: `http://localhost:${port}/v1`,
      apiKey: "test-key",
      model: "test-model",
    });

    const result = await Effect.runPromise(
      provider.sendMessages([
        { role: "user", content: "Hello" },
      ])
    );

    expect(result.content).toBe("Test response from mock server");
    expect(result.stopReason).toBe("stop");
  });

  it("handles tool calls in response", async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1234567890,
          model: "test-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call_abc",
                    type: "function",
                    function: {
                      name: "search",
                      arguments: JSON.stringify({ query: "test" }),
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        })
      );
    });
    server.listen(port);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));

    const provider = new OpenAIProvider({
      baseUrl: `http://localhost:${port}/v1`,
      apiKey: "test-key",
      model: "test-model",
    });

    const result = await Effect.runPromise(
      provider.sendMessages([
        { role: "user", content: "Search for something" },
      ])
    );

    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0].toolName).toBe("search");
    expect(result.toolCalls?.[0].toolCallId).toBe("call_abc");
    expect(result.toolCalls?.[0].arguments).toEqual({ query: "test" });
    expect(result.stopReason).toBe("tool_calls");
  });

  it("streams response from endpoint", async () => {
    server = createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const chunks = [
        {
          id: "chatcmpl-123",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "test-model",
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: null },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-123",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "test-model",
          choices: [
            {
              index: 0,
              delta: { content: "Hello " },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-123",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "test-model",
          choices: [
            {
              index: 0,
              delta: { content: "world" },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-123",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "test-model",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
        },
      ];

      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
    server.listen(port);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));

    const provider = new OpenAIProvider({
      baseUrl: `http://localhost:${port}/v1`,
      apiKey: "test-key",
      model: "test-model",
    });

    const stream = await Effect.runPromise(
      provider.streamResponse([
        { role: "user", content: "Hello" },
      ])
    );

    const events = await Effect.runPromise(
      Stream.runCollect(stream).pipe(
        Effect.map((chunk) =>
          Chunk.toArray(chunk) as StreamEvent[]
        )
      )
    );

    expect(events.length).toBeGreaterThan(0);
    const textEvents = events.filter(
      (e) => e.type === "text"
    );
    expect(textEvents.length).toBe(2);
    const stopEvents = events.filter(
      (e) => e.type === "stop"
    );
    expect(stopEvents.length).toBe(1);
    expect(stopEvents[0].data).toBe("stop");
  });

  it("passes correct configuration", async () => {
    server = createServer((req, res) => {
      expect(req.headers["authorization"]).toBe("Bearer test-key");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1234567890,
          model: "test-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "ok",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        })
      );
    });
    server.listen(port);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));

    const provider = new OpenAIProvider({
      baseUrl: `http://localhost:${port}/v1`,
      apiKey: "test-key",
      model: "custom-model",
    });

    await Effect.runPromise(
      provider.sendMessages([
        { role: "user", content: "test" },
      ])
    );
  });
});
