import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Chunk from "effect/Chunk";
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
